import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDate,
  calendarOccurrences,
  convert,
  forecast,
  monthlyAmount,
  statsFor,
  rebaseRates,
} from '../src/lib.js';
const company = { baseCurrency: 'BDT', timezone: 'Asia/Dhaka', rates: { BDT: 1, USD: 120 } };
test('changing reporting currency previews automatic rates without modifying the snapshot', () => {
  const original = { BDT: 1, USD: 120, EUR: 132 };
  const rebased = rebaseRates(original, 'USD');
  assert.equal(rebased.USD, 1);
  assert.equal(rebased.BDT, 1 / 120);
  assert.equal(rebased.EUR, 1.1);
  assert.equal(original.USD, 120);
  assert.deepEqual(rebaseRates({ BDT: 1 }, 'USD'), { USD: 1 });
});
const sub = {
  id: 'test',
  name: 'Test',
  amount: 10,
  currency: 'USD',
  cycle: 'monthly',
  nextBillingDate: '2026-01-31',
  billingAnchorDay: 31,
  status: 'active',
  autoRenew: true,
  category: 'Design',
};
test('currency conversion preserves original data and flags missing rates', () => {
  assert.equal(convert(10, 'USD', company), 1200);
  assert.equal(convert(10, 'EUR', company), null);
  assert.equal(sub.amount, 10);
});
test('monthly commitment normalizes recurrence and excludes one-time costs', () => {
  assert.equal(monthlyAmount({ amount: 120, cycle: 'yearly' }), 10);
  assert.equal(monthlyAmount({ amount: 30, cycle: 'quarterly' }), 10);
  assert.equal(monthlyAmount({ amount: 100, cycle: 'once' }), 0);
});
test('forecast keeps month-end anchors and does not invent historical payments', () => {
  const values = forecast([sub], company, 3, '2026-01-01');
  assert.deepEqual(
    values.map((v) => v.amount),
    [1200, 1200, 1200]
  );
  assert.deepEqual(
    forecast([sub], company, 3, '2026-02-15').map((v) => v.amount),
    [1200, 1200, 1200]
  );
  assert.equal(advanceDate('2026-02-28', 'monthly', 31), '2026-03-31');
});
test('calendar projects recurring dates and respects auto-renew settings', () => {
  assert.equal(calendarOccurrences([sub], '2026-03', company)[0].occurrenceDate, '2026-03-31');
  assert.equal(calendarOccurrences([{ ...sub, autoRenew: false }], '2026-03', company).length, 0);
  assert.equal(
    calendarOccurrences([{ ...sub, status: 'cancelled' }], '2026-01', company).length,
    0
  );
});
test('missing rates are excluded and visibly accounted for in dashboard statistics', () => {
  const data = {
    company,
    subscriptions: [sub, { ...sub, id: 'eur', currency: 'EUR' }],
    paidThisMonth: [
      { _id: 'USD', total: 12 },
      { _id: 'EUR', total: 7 },
    ],
  };
  const stats = statsFor(data);
  assert.equal(stats.monthly, 1200);
  assert.equal(stats.paid, 1440);
  assert.deepEqual(stats.missing, ['EUR']);
  assert.equal(stats.paidMissing, true);
});
