import mongoose from 'mongoose';
const { Schema } = mongoose;
const options = {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      delete ret.logoPublicId;
      return ret;
    },
  },
};
const ref = (name, required = false) => ({ type: Schema.Types.ObjectId, ref: name, required });

const companySchema = new Schema(
  {
    _id: { type: String, default: 'workspace' },
    name: { type: String, required: true },
    baseCurrency: { type: String, default: 'BDT' },
    timezone: { type: String, default: 'Asia/Dhaka' },
    monthlyBudget: { type: Number, default: 0, min: 0 },
    rates: { type: Map, of: Number, default: { BDT: 1 } },
    categories: {
      type: [String],
      default: [
        'Productivity',
        'Design',
        'Development',
        'Marketing',
        'Infrastructure',
        'Finance',
        'Other',
      ],
    },
    departments: {
      type: [String],
      default: ['Operations', 'Engineering', 'Design', 'Marketing', 'Finance', 'People'],
    },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'subtrack_companies' }
);
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'member', 'viewer'], default: 'member' },
    department: { type: String, default: 'Operations' },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
  },
  { ...options, collection: 'subtrack_users' }
);
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: ref('User', true),
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true, collection: 'subtrack_sessions' }
);
const fileSchema = new Schema(
  {
    name: String,
    mime: String,
    size: Number,
    publicId: String,
    resourceType: String,
    uploadedBy: ref('User'),
  },
  { timestamps: true }
);
const subscriptionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    vendor: { type: String, default: '' },
    website: { type: String, default: '' },
    description: { type: String, default: '' },
    category: { type: String, default: 'Other' },
    department: { type: String, default: 'Operations' },
    owner: ref('User', true),
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BDT' },
    cycle: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'once'],
      default: 'monthly',
    },
    nextBillingDate: { type: String, required: true },
    billingAnchorDay: { type: Number, min: 1, max: 31 },
    status: { type: String, enum: ['active', 'trial', 'paused', 'cancelled'], default: 'active' },
    seats: { type: Number, default: 1, min: 1 },
    paymentMethod: { type: String, default: '' },
    autoRenew: { type: Boolean, default: true },
    color: { type: String, default: '#b7ef70' },
    logo: { type: String, default: '' },
    logoPublicId: { type: String, default: '', select: false },
    files: { type: [fileSchema], default: [] },
    createdBy: ref('User', true),
  },
  { ...options, optimisticConcurrency: true, collection: 'subtrack_subscriptions' }
);
subscriptionSchema.index({ status: 1, nextBillingDate: 1 });
subscriptionSchema.index({ owner: 1 });
const paymentSchema = new Schema(
  {
    subscription: ref('Subscription', true),
    subscriptionName: String,
    amount: { type: Number, min: 0, required: true },
    currency: String,
    dueDate: String,
    paidDate: String,
    paidBy: ref('User', true),
    reference: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { ...options, collection: 'subtrack_payments' }
);
paymentSchema.index({ subscription: 1, dueDate: 1 }, { unique: true });
paymentSchema.index({ paidDate: -1, createdAt: -1 });
const activitySchema = new Schema(
  {
    actor: ref('User'),
    actorName: String,
    action: { type: String, required: true },
    target: String,
    detail: String,
  },
  { ...options, collection: 'subtrack_activities' }
);
export const Company = mongoose.model('Company', companySchema);
export const User = mongoose.model('User', userSchema);
export const Session = mongoose.model('Session', sessionSchema);
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export const Payment = mongoose.model('Payment', paymentSchema);
export const Activity = mongoose.model('Activity', activitySchema);
const exchangeRateSchema = new Schema(
  {
    _id: { type: String, default: 'USD' },
    usdRates: { type: Map, of: Number },
    asOf: Date,
    fetchedAt: Date,
    checkedAt: Date,
    nextCheckAt: Date,
    providerNextUpdateAt: Date,
    lastError: String,
    lockUntil: Date,
  },
  { timestamps: true, collection: 'subtrack_exchange_rates' }
);
export const ExchangeRate = mongoose.model('ExchangeRate', exchangeRateSchema);
export const models = [Company, User, Session, Subscription, Payment, Activity, ExchangeRate];
