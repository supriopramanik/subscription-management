import { z } from 'zod';

export const currencies = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'CAD', 'AUD'];
export const roles = ['admin', 'manager', 'member', 'viewer'];
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Enter a valid date'
  );
const text = (max = 120) => z.string().trim().max(max);
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(72, 'Use no more than 72 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
export const emailSchema = z.string().trim().email().toLowerCase().max(254);
export const userInput = z.object({
  name: text().min(2),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(roles),
  department: text().min(1),
});
export const subscriptionInput = z.object({
  name: text().min(1, 'Subscription name is required'),
  vendor: text().default(''),
  website: z
    .union([
      z.literal(''),
      z.url().refine((v) => /^https?:\/\//i.test(v), 'Use an http or https URL'),
    ])
    .default(''),
  description: text(2000).default(''),
  category: text(60).min(1),
  department: text(60).min(1),
  owner: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  amount: z
    .number()
    .finite()
    .min(0)
    .max(1e10)
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
      'Use up to two decimal places'
    ),
  currency: z.enum(currencies),
  cycle: z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'once']),
  nextBillingDate: dateString,
  status: z.enum(['active', 'trial', 'paused', 'cancelled']),
  seats: z.number().int().min(1).max(100000),
  paymentMethod: text().default(''),
  autoRenew: z.boolean().default(true),
  color: z
    .string()
    .regex(/^#[a-f\d]{6}$/i)
    .default('#b7ef70'),
});
export const companyInput = z.object({
  name: text().min(2),
  baseCurrency: z.enum(currencies),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid timezone'),
  monthlyBudget: z.number().min(0).max(1e12),
  categories: z.array(text(60).min(1)).min(1).max(30),
  departments: z.array(text(60).min(1)).min(1).max(30),
});
export const paymentInput = z.object({
  paidDate: dateString,
  reference: text(200).default(''),
  note: text(1000).default(''),
});

export function nextBillingDate(date, cycle, anchorDay) {
  const value = new Date(`${date}T12:00:00Z`);
  if (cycle === 'once') return date;
  if (cycle === 'weekly') value.setUTCDate(value.getUTCDate() + 7);
  else {
    const month = value.getUTCMonth() + { monthly: 1, quarterly: 3, yearly: 12 }[cycle];
    const day = anchorDay || value.getUTCDate();
    value.setUTCDate(1);
    value.setUTCMonth(month);
    const last = new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)
    ).getUTCDate();
    value.setUTCDate(Math.min(day, last));
  }
  return value.toISOString().slice(0, 10);
}
export function canEdit(user, subscription) {
  return (
    ['admin', 'manager'].includes(user.role) ||
    (user.role === 'member' &&
      String(subscription.owner?._id || subscription.owner) === String(user._id || user.id))
  );
}
export function serializeSubscription(doc) {
  const value = doc.toJSON();
  value.files = value.files.map((f) => ({
    id: String(f._id),
    name: f.name,
    mime: f.mime,
    size: f.size,
    createdAt: f.createdAt,
  }));
  return value;
}
export function todayInZone(timezone = 'Asia/Dhaka') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
