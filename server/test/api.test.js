import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { models, Company, User, Subscription, Payment, Session, Activity } from '../src/models.js';
import { config } from '../src/config.js';
import { todayInZone } from '../src/domain.js';
import { rateView } from '../src/exchange-rates.js';

let replica, app, admin, adminUser, member, memberUser, viewer, manager, ownSub, otherSub;
const origin = config.origin;
const password = 'Test-password-2026';
const write = (agent, method, path, body) => agent[method](path).set('Origin', origin).send(body);
const subBody = (owner) => ({
  name: 'Figma',
  vendor: 'Team plan',
  amount: 45,
  currency: 'USD',
  cycle: 'monthly',
  nextBillingDate: '2026-01-31',
  category: 'Design',
  department: 'Design',
  owner,
  status: 'active',
  seats: 3,
  autoRenew: true,
  color: '#b7ef70',
  website: 'https://figma.com',
  description: 'Company design tools',
  paymentMethod: 'Company card',
});
before(
  async () => {
    // This suite creates its own disposable replica set. It never uses MONGODB_URI.
    replica = await MongoMemoryReplSet.create({
      binary: { version: '8.0.17' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(replica.getUri(), { dbName: 'subtrack_disposable_test' });
    await Promise.all(models.map((m) => m.init()));
    app = createApp({
      exchangeRates: {
        read: async (baseCurrency) =>
          rateView(
            {
              usdRates: {
                USD: 1,
                BDT: 125,
                EUR: 0.9,
                GBP: 0.75,
                INR: 90,
                AED: 3.67,
                SGD: 1.3,
                CAD: 1.4,
                AUD: 1.5,
              },
              asOf: new Date(),
              fetchedAt: new Date(),
              checkedAt: new Date(),
            },
            baseCurrency
          ),
      },
    });
    admin = request.agent(app);
  },
  { timeout: 240000 }
);
after(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});

test('workspace requires authentication and rejects cross-origin writes', async () => {
  assert.equal((await request(app).get('/api/workspace')).status, 401);
  const response = await request(app)
    .post('/api/auth/setup')
    .set('Origin', 'https://untrusted.example')
    .send({});
  assert.equal(response.status, 403);
  assert.equal((await request(app).get('/api/auth/status')).body.setupRequired, true);
});
test('first-run setup creates exactly one admin and hides password hashes', async () => {
  const response = await write(admin, 'post', '/api/auth/setup', {
    name: 'Test Administrator',
    email: 'admin@example.invalid',
    password,
    companyName: 'Test Company',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  adminUser = response.body.user;
  assert.equal(adminUser.role, 'admin');
  assert.equal(adminUser.passwordHash, undefined);
  assert.ok(response.headers['set-cookie'][0].includes('HttpOnly'));
  assert.ok(response.headers['set-cookie'][0].includes('SameSite=Strict'));
  assert.equal((await request(app).get('/api/auth/status')).body.setupRequired, false);
  assert.equal(
    (
      await write(request(app), 'post', '/api/auth/setup', {
        name: 'Another Admin',
        email: 'other@example.invalid',
        password,
        companyName: 'Other',
      })
    ).status,
    409
  );
});
async function employee(role) {
  const response = await write(admin, 'post', '/api/team', {
    name: `Test ${role}`,
    email: `${role}@example.invalid`,
    password,
    role,
    department: 'Engineering',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const agent = request.agent(app);
  assert.equal(
    (await write(agent, 'post', '/api/auth/login', { email: `${role}@example.invalid`, password }))
      .status,
    200
  );
  assert.equal((await agent.get('/api/workspace')).status, 403);
  const changed = await write(agent, 'post', '/api/auth/password', {
    currentPassword: password,
    newPassword: 'Own-password-2026',
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  return [agent, response.body.user];
}
test('employees must replace temporary passwords before accessing company data', async () => {
  [member, memberUser] = await employee('member');
  [viewer] = await employee('viewer');
  [manager] = await employee('manager');
  assert.equal((await member.get('/api/workspace')).status, 200);
  assert.equal((await viewer.get('/api/team')).status, 403);
  assert.equal((await manager.get('/api/team')).status, 403);
});
test('subscriptions persist original currency and ownership', async () => {
  const response = await write(admin, 'post', '/api/subscriptions', subBody(memberUser.id));
  assert.equal(response.status, 201, JSON.stringify(response.body));
  ownSub = response.body.subscription;
  assert.equal(ownSub.currency, 'USD');
  assert.equal(ownSub.amount, 45);
  assert.equal(ownSub.billingAnchorDay, 31);
  const other = await write(admin, 'post', '/api/subscriptions', {
    ...subBody(adminUser.id),
    name: 'Admin tool',
  });
  assert.equal(other.status, 201);
  otherSub = other.body.subscription;
  const snapshot = await member.get('/api/workspace');
  assert.equal(snapshot.body.subscriptions.length, 2);
  assert.equal(snapshot.body.subscriptions[0].owner.passwordHash, undefined);
  assert.equal(snapshot.body.people[0].email, undefined);
});
test('member editing and payment permissions are enforced on the API', async () => {
  assert.equal(
    (await write(member, 'put', `/api/subscriptions/${otherSub.id}`, subBody(adminUser.id))).status,
    403
  );
  assert.equal(
    (
      await write(member, 'post', `/api/subscriptions/${otherSub.id}/payments`, {
        paidDate: todayInZone(),
        dueDate: otherSub.nextBillingDate,
      })
    ).status,
    403
  );
  const response = await write(member, 'put', `/api/subscriptions/${ownSub.id}`, {
    ...subBody(adminUser.id),
    name: 'Member tool',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.subscription.owner, memberUser.id);
  assert.equal((await write(member, 'delete', `/api/subscriptions/${otherSub.id}`)).status, 403);
});
test('viewers cannot create, update, pay, delete or upload', async () => {
  assert.equal(
    (await write(viewer, 'post', '/api/subscriptions', subBody(memberUser.id))).status,
    403
  );
  assert.equal(
    (await write(viewer, 'put', `/api/subscriptions/${ownSub.id}`, subBody(memberUser.id))).status,
    403
  );
  assert.equal(
    (
      await write(viewer, 'post', `/api/subscriptions/${ownSub.id}/payments`, {
        paidDate: todayInZone(),
        dueDate: ownSub.nextBillingDate,
      })
    ).status,
    403
  );
  assert.equal((await write(viewer, 'delete', `/api/subscriptions/${ownSub.id}`)).status, 403);
  assert.equal((await write(viewer, 'post', `/api/subscriptions/${ownSub.id}/files`)).status, 403);
});
test('concurrent payment requests record once and advance the anchored billing date once', async () => {
  const body = {
    paidDate: todayInZone(),
    dueDate: ownSub.nextBillingDate,
    reference: 'TEST-001',
    note: 'Integration test',
  };
  const results = await Promise.all([
    write(member, 'post', `/api/subscriptions/${ownSub.id}/payments`, body),
    write(member, 'post', `/api/subscriptions/${ownSub.id}/payments`, body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await Payment.countDocuments({ subscription: ownSub.id }), 1);
  assert.equal((await Subscription.findById(ownSub.id)).nextBillingDate, '2026-02-28');
  assert.equal(
    await Activity.countDocuments({ action: 'recorded payment', target: 'Member tool' }),
    1
  );
});
test('a second billing cycle returns from February to the original month-end anchor', async () => {
  const result = await write(member, 'post', `/api/subscriptions/${ownSub.id}/payments`, {
    paidDate: todayInZone(),
    dueDate: '2026-02-28',
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.subscription.nextBillingDate, '2026-03-31');
  assert.equal((await write(admin, 'delete', `/api/subscriptions/${ownSub.id}`)).status, 409);
});
test('future payment dates, invalid IDs and unsafe fields are rejected', async () => {
  assert.equal(
    (
      await write(admin, 'post', `/api/subscriptions/${ownSub.id}/payments`, {
        paidDate: '2099-01-01',
        dueDate: '2026-03-31',
      })
    ).status,
    400
  );
  assert.equal(
    (await write(admin, 'put', '/api/subscriptions/invalid', subBody(adminUser.id))).status,
    400
  );
  assert.equal(
    (await write(admin, 'post', '/api/subscriptions', { ...subBody(adminUser.id), amount: -1 }))
      .status,
    400
  );
  assert.equal(
    (
      await write(admin, 'post', '/api/subscriptions', {
        ...subBody(adminUser.id),
        website: 'javascript:alert(1)',
      })
    ).status,
    400
  );
});
test('settings cannot override server-synced rates; member cannot alter company configuration', async () => {
  const company = (await admin.get('/api/workspace')).body.company;
  const settings = { ...company, rates: { BDT: 1, USD: 122 }, monthlyBudget: 100000 };
  assert.equal((await write(member, 'put', '/api/company', settings)).status, 403);
  assert.equal((await write(admin, 'put', '/api/company', { ...settings, name: '' })).status, 400);
  const response = await write(admin, 'put', '/api/company', settings);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.company.rates.USD, 125);
  assert.equal(response.body.company.exchangeRates.mode, 'automatic');
  assert.equal((await Company.findById('workspace')).rates.has('USD'), false);
});
test('automatic exchange rates appear in the workspace and manual check is admin-only', async () => {
  const workspace = await viewer.get('/api/workspace');
  assert.equal(workspace.body.company.rates.BDT, 1);
  assert.equal(workspace.body.company.rates.USD, 125);
  assert.equal(workspace.body.company.exchangeRates.status, 'current');
  assert.equal((await write(viewer, 'post', '/api/company/rates/refresh')).status, 403);
  assert.equal((await write(member, 'post', '/api/company/rates/refresh')).status, 403);
  assert.equal((await write(manager, 'post', '/api/company/rates/refresh')).status, 403);
  const checked = await write(admin, 'post', '/api/company/rates/refresh');
  assert.equal(checked.status, 200);
  assert.equal(checked.body.rates.USD, 125);
  assert.equal(checked.body.exchangeRates.mode, 'automatic');
});
test('the payment archive is paginated, searchable and restricted to authenticated users', async () => {
  assert.equal((await request(app).get('/api/payments')).status, 401);
  const first = await viewer.get('/api/payments?page=1&limit=1');
  const second = await viewer.get('/api/payments?page=2&limit=1');
  assert.equal(first.status, 200);
  assert.equal(first.body.total, 2);
  assert.equal(first.body.payments.length, 1);
  assert.equal(second.body.payments.length, 1);
  assert.notEqual(first.body.payments[0].id, second.body.payments[0].id);
  const searched = await viewer.get('/api/payments?search=TEST-001');
  assert.equal(searched.body.total, 1);
  const filtered = await viewer.get(`/api/payments?subscription=${otherSub.id}`);
  assert.equal(filtered.body.total, 0);
  assert.equal((await viewer.get('/api/payments?page=0')).status, 400);
  assert.equal((await viewer.get('/api/payments?subscription=invalid')).status, 400);
});
test('an administrator cannot remove the last admin or deactivate an active subscription owner', async () => {
  assert.equal(
    (await write(admin, 'patch', `/api/team/${adminUser.id}`, { role: 'viewer' })).status,
    400
  );
  assert.equal(
    (await write(admin, 'patch', `/api/team/${adminUser.id}`, { active: false })).status,
    400
  );
  assert.equal(
    (await write(admin, 'patch', `/api/team/${memberUser.id}`, { active: false })).status,
    400
  );
});
test('role changes revoke existing sessions immediately', async () => {
  const changed = await write(admin, 'patch', `/api/team/${memberUser.id}`, { role: 'viewer' });
  assert.equal(changed.status, 200);
  assert.equal((await member.get('/api/workspace')).status, 401);
  assert.equal(await Session.countDocuments({ user: memberUser.id }), 0);
});
test('unknown accounts and wrong passwords return the same generic message', async () => {
  const a = await write(request(app), 'post', '/api/auth/login', {
    email: 'missing@example.invalid',
    password,
  });
  const b = await write(request(app), 'post', '/api/auth/login', {
    email: 'admin@example.invalid',
    password: 'Wrong-password-2026',
  });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error, b.body.error);
});
test('admin email changes require the current password and preserve account access', async () => {
  const body = { email: 'new-admin@example.invalid', currentPassword: password };
  assert.equal((await write(request(app), 'post', '/api/auth/email', body)).status, 401);
  assert.equal((await write(viewer, 'post', '/api/auth/email', body)).status, 403);
  assert.equal(
    (await write(admin, 'post', '/api/auth/email', { ...body, email: 'invalid' })).status,
    400
  );
  assert.equal(
    (await write(admin, 'post', '/api/auth/email', { ...body, currentPassword: 'wrong' })).status,
    400
  );
  assert.equal(
    (await write(admin, 'post', '/api/auth/email', { ...body, email: 'viewer@example.invalid' }))
      .status,
    409
  );
  assert.equal((await User.findById(adminUser.id)).email, 'admin@example.invalid');
  const otherSession = request.agent(app);
  assert.equal(
    (await write(otherSession, 'post', '/api/auth/login', { email: adminUser.email, password }))
      .status,
    200
  );
  const changed = await write(admin, 'post', '/api/auth/email', {
    ...body,
    email: '  NEW-ADMIN@example.invalid  ',
    role: 'viewer',
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.user.id, adminUser.id);
  assert.equal(changed.body.user.email, body.email);
  assert.equal(changed.body.user.role, 'admin');
  assert.equal(changed.body.user.passwordHash, undefined);
  assert.equal((await admin.get('/api/auth/me')).body.user.email, body.email);
  assert.equal((await otherSession.get('/api/auth/me')).status, 401);
  assert.equal(await Session.countDocuments({ user: adminUser.id }), 1);
  assert.equal(
    (await write(request(app), 'post', '/api/auth/login', { email: adminUser.email, password }))
      .status,
    401
  );
  const newLogin = request.agent(app);
  const signedIn = await write(newLogin, 'post', '/api/auth/login', {
    email: body.email,
    password,
  });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.user.id, adminUser.id);
  assert.equal((await newLogin.get('/api/workspace')).status, 200);
  assert.equal(await Activity.countDocuments({ action: 'changed email', actor: adminUser.id }), 1);
});

test('manager can delete a subscription without payments, while logout invalidates access', async () => {
  assert.equal((await write(manager, 'delete', `/api/subscriptions/${otherSub.id}`)).status, 200);
  assert.equal(await Subscription.exists({ _id: otherSub.id }), null);
  assert.equal((await write(admin, 'post', '/api/auth/logout')).status, 204);
  assert.equal((await admin.get('/api/workspace')).status, 401);
});
