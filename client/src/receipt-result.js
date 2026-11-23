import { CURRENCIES, CYCLES, advanceDate } from './lib.js';

const textFields = { name: 120, vendor: 120, website: 2000, paymentMethod: 120 };

export function normalizeReceiptResult(response) {
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    !response.fields ||
    typeof response.fields !== 'object' ||
    Array.isArray(response.fields)
  ) {
    throw new Error(
      'The receipt reader returned an incomplete response. Please try the file again.'
    );
  }
  const fields = {};
  for (const [key, max] of Object.entries(textFields)) {
    const value = response.fields[key];
    if (typeof value === 'string' && value.trim()) fields[key] = value.trim().slice(0, max);
  }
  const source = response.fields;
  if (
    typeof source.amount === 'number' &&
    Number.isFinite(source.amount) &&
    source.amount >= 0 &&
    source.amount <= 1e10
  )
    fields.amount = Math.round(source.amount * 100) / 100;
  if (CURRENCIES.includes(source.currency)) fields.currency = source.currency;
  if (typeof source.cycle === 'string' && Object.keys(CYCLES).includes(source.cycle))
    fields.cycle = source.cycle;
  for (const key of ['nextBillingDate', 'purchaseDate']) {
    if (typeof source[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source[key])) {
      const date = new Date(source[key]);
      if (!Number.isNaN(+date) && date.toISOString().slice(0, 10) === source[key])
        fields[key] = source[key];
    }
  }
  if (Number.isInteger(source.seats) && source.seats > 0 && source.seats <= 100000)
    fields.seats = source.seats;
  return {
    fields,
    warnings: Array.isArray(response.warnings)
      ? response.warnings.filter((value) => typeof value === 'string')
      : [],
    text: typeof response.text === 'string' ? response.text.slice(0, 16000) : '',
  };
}

export function mergeReceiptFields(current, snapshot, fields) {
  const applied = Object.fromEntries(
    Object.entries(fields).filter(([key]) => current[key] === snapshot[key])
  );
  const merged = {
    ...current,
    ...applied,
  };
  if (applied.nextBillingDate) merged.billingDateMode = 'receipt';
  else if (merged.billingDateMode === 'calculated' && (applied.purchaseDate || applied.cycle)) {
    merged.nextBillingDate = merged.purchaseDate
      ? advanceDate(merged.purchaseDate, merged.cycle)
      : '';
  }
  return merged;
}

export function setSubscriptionField(form, key, value) {
  const next = { ...form, [key]: value };
  if (key === 'nextBillingDate') next.billingDateMode = 'manual';
  if ((key === 'purchaseDate' || key === 'cycle') && next.billingDateMode === 'calculated') {
    next.nextBillingDate = next.purchaseDate ? advanceDate(next.purchaseDate, next.cycle) : '';
  }
  return next;
}
