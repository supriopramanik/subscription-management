import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { config } from './config.js';
import { Company, User, Session, Subscription, Payment, Activity } from './models.js';
import {
  userInput,
  subscriptionInput,
  companyInput,
  paymentInput,
  passwordSchema,
  emailSchema,
  canEdit,
  nextBillingDate,
  serializeSubscription,
  todayInZone,
} from './domain.js';
import { uploadFile, downloadUrl, destroyFile, cloudinaryReady } from './cloudinary.js';
import { exchangeRateService } from './exchange-rates.js';

const cookieName = config.secure ? '__Host-subtrack' : 'subtrack_session';
const cookieOptions = { httpOnly: true, secure: config.secure, sameSite: 'strict', path: '/' };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const objectId = (value) => {
  if (!mongoose.isValidObjectId(value)) fail(400, 'Invalid record ID');
  return value;
};
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 },
});
async function transaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
async function log(user, action, target, detail = '', session) {
  await Activity.create([{ actor: user._id, actorName: user.name, action, target, detail }], {
    session,
  });
}
async function createSession(res, user) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await Session.create({ tokenHash: hash(token), user: user._id, expiresAt });
  res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
}
async function authenticate(req, _res, next) {
  const token = req.cookies[cookieName];
  if (!token || typeof token !== 'string' || token.length !== 64)
    fail(401, 'Please sign in to continue');
  const session = await Session.findOne({
    tokenHash: hash(token),
    expiresAt: { $gt: new Date() },
  }).populate('user');
  if (!session?.user?.active) fail(401, 'Your session has expired. Please sign in again.');
  req.user = session.user;
  req.authSession = session;
  next();
}
const allow =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) fail(403, 'You do not have permission for this action');
    next();
  };
async function editable(req) {
  const doc = await Subscription.findById(objectId(req.params.id));
  if (!doc) fail(404, 'Subscription not found');
  if (!canEdit(req.user, doc)) fail(403, 'You can only manage subscriptions assigned to you');
  return doc;
}

export function createApp({ exchangeRates = exchangeRateService } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    })
  );
  app.use(express.json({ limit: '128kb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a minute.' },
    })
  );
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.origin)
      fail(403, 'Request origin is not allowed');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable' })
  );
  app.get('/api/auth/status', async (_req, res) =>
    res.json({ setupRequired: !(await Company.exists({ _id: 'workspace' })) })
  );
  app.post('/api/auth/setup', authLimit, async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: emailSchema,
        password: passwordSchema,
        companyName: z.string().trim().min(2).max(120),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await transaction(async (session) => {
      if (await Company.exists({ _id: 'workspace' }).session(session))
        fail(409, 'This workspace has already been set up');
      await Company.create([{ _id: 'workspace', name: input.companyName }], { session });
      const [admin] = await User.create(
        [{ name: input.name, email: input.email, passwordHash, role: 'admin' }],
        { session }
      );
      await log(admin, 'created workspace', input.companyName, '', session);
      return admin;
    });
    await createSession(res, user);
    res.status(201).json({ user });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const input = z
      .object({ email: emailSchema, password: z.string().min(1).max(256) })
      .parse(req.body);
    const user = await User.findOne({ email: input.email, active: true }).select('+passwordHash');
    // A dummy hash keeps unknown-account attempts on the password verification path.
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash || '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW'
    );
    if (!user || !valid) fail(401, 'Email or password is incorrect');
    if (req.cookies[cookieName])
      await Session.deleteOne({ tokenHash: hash(req.cookies[cookieName]) });
    await createSession(res, user);
    res.json({ user });
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (typeof req.cookies[cookieName] === 'string')
      await Session.deleteOne({ tokenHash: hash(req.cookies[cookieName]) });
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  app.use('/api', authenticate);
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/password', authLimit, async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().min(1).max(256), newPassword: passwordSchema })
      .parse(req.body);
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
      fail(400, 'Current password is incorrect');
    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    user.mustChangePassword = false;
    await transaction(async (session) => {
      await user.save({ session });
      await Session.deleteMany({ user: user._id, _id: { $ne: req.authSession._id } }).session(
        session
      );
      await log(user, 'changed password', user.name, '', session);
    });
    res.json({ user });
  });
  app.use('/api', (req, _res, next) => {
    if (req.user.mustChangePassword) fail(403, 'Change your temporary password before continuing');
    next();
  });

  app.get('/api/workspace', async (_req, res) => {
    const [company, subscriptions, people, payments, activities] = await Promise.all([
      Company.findById('workspace').lean(),
      Subscription.find().sort({ createdAt: -1 }).populate('owner', 'name role department active'),
      User.find({ active: true }).select('name role department active').sort({ name: 1 }),
      Payment.find().sort({ paidDate: -1, createdAt: -1 }).limit(100).populate('paidBy', 'name'),
      Activity.find().sort({ createdAt: -1 }).limit(100),
    ]);
    Object.assign(company, await exchangeRates.read(company.baseCurrency));
    const monthStart = todayInZone(company.timezone).slice(0, 7) + '-01';
    const monthEnd = todayInZone(company.timezone).slice(0, 7) + '-31';
    const paidThisMonth = await Payment.aggregate([
      { $match: { paidDate: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    res.json({
      company,
      subscriptions: subscriptions.map(serializeSubscription),
      people,
      payments,
      activities,
      paidThisMonth,
      uploadsEnabled: cloudinaryReady(),
    });
  });
  app.get('/api/payments', async (req, res) => {
    const input = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().trim().max(120).default(''),
        subscription: z.string().optional(),
      })
      .parse(req.query);
    const filter = {};
    if (input.subscription)
      filter.subscription = new mongoose.Types.ObjectId(objectId(input.subscription));
    if (input.search) {
      const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { subscriptionName: { $regex: escaped, $options: 'i' } },
        { reference: { $regex: escaped, $options: 'i' } },
      ];
    }
    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ paidDate: -1, createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit)
        .populate('paidBy', 'name'),
      Payment.countDocuments(filter),
    ]);
    res.json({ payments, total, page: input.page, limit: input.limit });
  });

  app.post('/api/subscriptions', allow('admin', 'manager', 'member'), async (req, res) => {
    const input = subscriptionInput.parse(req.body);
    input.owner = req.user.role === 'member' ? req.user._id : input.owner || req.user._id;
    if (!(await User.exists({ _id: input.owner, active: true })))
      fail(400, 'Select an active employee as owner');
    const doc = await transaction(async (session) => {
      const [sub] = await Subscription.create(
        [
          {
            ...input,
            billingAnchorDay: Number(input.nextBillingDate.slice(-2)),
            createdBy: req.user._id,
          },
        ],
        { session }
      );
      await log(
        req.user,
        'added subscription',
        sub.name,
        `${sub.currency} ${sub.amount} / ${sub.cycle}`,
        session
      );
      return sub;
    });
    res.status(201).json({ subscription: serializeSubscription(doc) });
  });
  app.put('/api/subscriptions/:id', async (req, res) => {
    const doc = await editable(req);
    const input = subscriptionInput.parse(req.body);
    if (req.user.role === 'member') input.owner = req.user._id;
    if (!input.owner) input.owner = doc.owner;
    if (!(await User.exists({ _id: input.owner, active: true })))
      fail(400, 'Select an active employee as owner');
    if (input.nextBillingDate !== doc.nextBillingDate)
      doc.billingAnchorDay = Number(input.nextBillingDate.slice(-2));
    Object.assign(doc, input);
    await transaction(async (session) => {
      await doc.save({ session });
      await log(req.user, 'updated subscription', doc.name, '', session);
    });
    res.json({ subscription: serializeSubscription(doc) });
  });
  app.delete('/api/subscriptions/:id', allow('admin', 'manager'), async (req, res) => {
    const doc = await Subscription.findById(objectId(req.params.id)).select('+logoPublicId');
    if (!doc) fail(404, 'Subscription not found');
    // Records with financial history are retained; cancel them instead.
    if (await Payment.exists({ subscription: doc._id }))
      fail(409, 'This subscription has payment history. Cancel it instead to keep your records.');
    const removedFiles = [...doc.files];
    await transaction(async (session) => {
      // Serializes this deletion with payment recording on the subscription document.
      const deleted = await Subscription.deleteOne({ _id: doc._id, __v: doc.__v }).session(session);
      if (!deleted.deletedCount) fail(409, 'This subscription changed. Refresh and try again.');
      if (await Payment.exists({ subscription: doc._id }).session(session))
        fail(409, 'This subscription has payment history. Cancel it instead.');
      await log(req.user, 'deleted subscription', doc.name, '', session);
    });
    const cleanup = await Promise.allSettled([
      ...removedFiles.map((f) => destroyFile(f.publicId, f.resourceType)),
      destroyFile(doc.logoPublicId, 'image', 'upload'),
    ]);
    res.json({ success: true, cleanupPending: cleanup.some((r) => r.status === 'rejected') });
  });
  app.post('/api/subscriptions/:id/payments', async (req, res) => {
    const input = paymentInput.parse(req.body);
    const company = await Company.findById('workspace');
    if (input.paidDate > todayInZone(company.timezone))
      fail(400, 'Payment date cannot be in the future');
    const result = await transaction(async (session) => {
      const doc = await Subscription.findById(objectId(req.params.id)).session(session);
      if (!doc) fail(404, 'Subscription not found');
      if (!canEdit(req.user, doc))
        fail(403, 'You can only record payments for your own subscriptions');
      if (!['active', 'trial'].includes(doc.status))
        fail(400, 'Only active or trial subscriptions can be marked paid');
      const dueDate = doc.nextBillingDate;
      // Idempotency key supplied by the UI protects double clicks and request retries.
      if (req.body.dueDate !== dueDate)
        fail(409, 'This billing period has changed or was already paid. Refresh and try again.');
      const [payment] = await Payment.create(
        [
          {
            ...input,
            subscription: doc._id,
            subscriptionName: doc.name,
            amount: doc.amount,
            currency: doc.currency,
            dueDate,
            paidBy: req.user._id,
          },
        ],
        { session }
      );
      doc.nextBillingDate = nextBillingDate(dueDate, doc.cycle, doc.billingAnchorDay);
      doc.status = doc.cycle === 'once' ? 'cancelled' : doc.autoRenew ? 'active' : 'paused';
      await doc.save({ session });
      await log(
        req.user,
        'recorded payment',
        doc.name,
        `${doc.currency} ${doc.amount} · due ${dueDate}`,
        session
      );
      return { subscription: serializeSubscription(doc), payment };
    });
    res.status(201).json(result);
  });

  app.post(
    '/api/subscriptions/:id/files',
    allow('admin', 'manager', 'member'),
    async (req, res) => {
      const doc = await editable(req);
      // Permission is checked before buffering an upload.
      await new Promise((resolve, reject) =>
        upload.single('file')(req, res, (err) => (err ? reject(err) : resolve()))
      );
      if (!req.file) fail(400, 'Choose a file to upload');
      const isLogo = req.body.kind === 'logo';
      if (!isLogo && doc.files.length >= 20) fail(400, 'Maximum 20 attachments per subscription');
      const result = await uploadFile(req.file, isLogo);
      const oldLogo = isLogo
        ? (await Subscription.findById(doc._id).select('+logoPublicId'))?.logoPublicId
        : '';
      try {
        if (isLogo) {
          doc.logo = result.secure_url;
          doc.logoPublicId = result.public_id;
        } else
          doc.files.push({
            name: req.file.originalname.replace(/[\x00-\x1F]/g, '').slice(0, 200),
            mime: result.mime,
            size: req.file.size,
            publicId: result.public_id,
            resourceType: result.resource_type,
            uploadedBy: req.user._id,
          });
        await transaction(async (session) => {
          await doc.save({ session });
          await log(
            req.user,
            isLogo ? 'updated logo' : 'uploaded file',
            doc.name,
            isLogo ? '' : req.file.originalname.slice(0, 200),
            session
          );
        });
      } catch (error) {
        await destroyFile(
          result.public_id,
          result.resource_type,
          isLogo ? 'upload' : 'authenticated'
        ).catch(() => {});
        throw error;
      }
      const cleanup = isLogo
        ? await Promise.allSettled([destroyFile(oldLogo, 'image', 'upload')])
        : [];
      res.status(201).json({
        subscription: serializeSubscription(doc),
        cleanupPending: cleanup.some((r) => r.status === 'rejected'),
      });
    }
  );
  app.get('/api/subscriptions/:id/files/:fileId/download', async (req, res) => {
    const doc = await Subscription.findById(objectId(req.params.id));
    const file = doc?.files.id(objectId(req.params.fileId));
    if (!file) fail(404, 'File not found');
    res.redirect(downloadUrl(file));
  });
  app.delete('/api/subscriptions/:id/files/:fileId', async (req, res) => {
    const doc = await editable(req);
    const file = doc.files.id(objectId(req.params.fileId));
    if (!file) fail(404, 'File not found');
    const publicId = file.publicId,
      resourceType = file.resourceType;
    doc.files.pull(file._id);
    await transaction(async (session) => {
      await doc.save({ session });
      await log(req.user, 'removed file', doc.name, file.name, session);
    });
    const cleanup = await Promise.allSettled([destroyFile(publicId, resourceType)]);
    res.json({ success: true, cleanupPending: cleanup.some((r) => r.status === 'rejected') });
  });

  app.get('/api/team', allow('admin'), async (_req, res) =>
    res.json({ users: await User.find().sort({ createdAt: 1 }) })
  );
  app.post('/api/team', allow('admin'), async (req, res) => {
    const input = userInput.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await transaction(async (session) => {
      const [doc] = await User.create([{ ...input, passwordHash, mustChangePassword: true }], {
        session,
      });
      await log(req.user, 'added employee', doc.name, doc.role, session);
      return doc;
    });
    res.status(201).json({ user });
  });
  app.patch('/api/team/:id', allow('admin'), async (req, res) => {
    const input = userInput
      .omit({ password: true, email: true })
      .partial()
      .extend({ active: z.boolean().optional(), password: passwordSchema.optional() })
      .parse(req.body);
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;
    const updated = await transaction(async (session) => {
      // A shared workspace write prevents concurrent last-admin changes from both succeeding.
      await Company.updateOne({ _id: 'workspace' }, { $inc: { revision: 1 } }).session(session);
      const user = await User.findById(objectId(req.params.id)).session(session);
      if (!user) fail(404, 'Employee not found');
      if (String(user._id) === String(req.user._id) && input.active === false)
        fail(400, 'You cannot deactivate your own account');
      if (
        user.active &&
        user.role === 'admin' &&
        (input.active === false || (input.role && input.role !== 'admin')) &&
        (await User.countDocuments({ active: true, role: 'admin' }).session(session)) <= 1
      )
        fail(400, 'Keep at least one active administrator');
      if (
        input.active === false &&
        (await Subscription.exists({
          owner: user._id,
          status: { $in: ['active', 'trial'] },
        }).session(session))
      )
        fail(400, 'Reassign this employee’s active subscriptions before deactivating them');
      const { password, ...safe } = input;
      Object.assign(user, safe);
      if (passwordHash) {
        user.passwordHash = passwordHash;
        user.mustChangePassword = true;
      }
      await user.save({ session });
      if (input.active === false || input.role || passwordHash)
        await Session.deleteMany({ user: user._id }).session(session);
      await log(
        req.user,
        'updated employee',
        user.name,
        passwordHash
          ? 'Temporary password reset'
          : `${user.role} · ${user.active ? 'active' : 'inactive'}`,
        session
      );
      return user;
    });
    res.json({ user: updated });
  });
  app.put('/api/company', allow('admin'), async (req, res) => {
    const input = companyInput.parse(req.body);
    const company = await transaction(async (session) => {
      const doc = await Company.findByIdAndUpdate(
        'workspace',
        { $set: input, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true, session }
      );
      await log(req.user, 'updated workspace settings', doc.name, '', session);
      return doc;
    });
    res.json({
      company: { ...company.toObject(), ...(await exchangeRates.read(company.baseCurrency)) },
    });
  });
  app.post('/api/company/rates/refresh', allow('admin'), async (_req, res) => {
    const company = await Company.findById('workspace');
    // All refresh triggers respect the shared provider cooldown, including this button.
    res.json(await exchangeRates.read(company.baseCurrency));
  });
  app.use('/api', (_req, _res, next) =>
    next(Object.assign(new Error('API route not found'), { status: 404 }))
  );
  if (process.env.SERVE_CLIENT === 'true') {
    const clientDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
    app.use(express.static(clientDirectory, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) =>
      res.sendFile(`${clientDirectory}/index.html`, { headers: { 'Cache-Control': 'no-cache' } })
    );
  }
  app.use((_req, _res, next) => next(Object.assign(new Error('Route not found'), { status: 404 })));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: error.issues.map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`).join('; '),
      });
    if (error.code === 11000)
      return res.status(409).json({
        error: 'This record already exists, or this billing period has already been paid.',
      });
    if (error.name === 'VersionError' || error.hasErrorLabel?.('TransientTransactionError'))
      return res
        .status(409)
        .json({ error: 'This record changed while you were editing it. Refresh and try again.' });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'File must be smaller than 10 MB' });
    if (error instanceof multer.MulterError)
      return res.status(400).json({ error: 'Upload one file at a time using the file field.' });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request body is too large' });
    const status = error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status === 500)
      console.error(
        'Request failed:',
        error.name,
        error.code || '',
        config.production ? '' : error.message
      );
    res.status(status).json({
      error:
        status === 500 ? 'The request could not be completed. Please try again.' : error.message,
    });
  });
  return app;
}
