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
  groupSubscriptions,
  initials,
  money,
} from '../src/lib.js';
const company = { baseCurrency: 'BDT', timezone: 'Asia/Dhaka', rates: { BDT: 1, USD: 120 } };
test('company initials follow the configured name and tolerate extra whitespace', () => {
  assert.equal(initials('Global Oparation'), 'GO');
  assert.equal(initials('  New   Company Ltd. '), 'NC');
  assert.equal(initials('Acme'), 'A');
  assert.equal(initials(''), '?');
});
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
  vendor: 'Test plan',
  amount: 10,
  currency: 'USD',
  cycle: 'monthly',
  nextBillingDate: '2026-01-31',
  billingAnchorDay: 31,
  status: 'active',
  autoRenew: true,
  category: 'Design',
};

test('unknown company renewal costs stay on the calendar and are excluded from spending totals', () => {
  const unknown = {
    ...sub,
    id: 'company',
    amount: null,
    cycle: 'yearly',
    nextBillingDate: '2026-12-01',
  };
  const free = { ...sub, id: 'free', amount: 0 };
  assert.equal(money(null, 'USD'), 'Amount not provided');
  assert.notEqual(money(0, 'USD'), 'Amount not provided');
  assert.equal(monthlyAmount(unknown), null);
  assert.equal(convert(null, 'USD', company), null);
  const stats = statsFor({ company, subscriptions: [unknown, free, sub], paidThisMonth: [] });
  assert.equal(stats.monthly, 1200);
  assert.equal(stats.unknownAmounts, 1);
  assert.deepEqual(stats.missing, []);
  assert.deepEqual(stats.monthlyByCurrency, { USD: 10 });
  assert.equal(calendarOccurrences([unknown], '2026-12', company).length, 1);
  assert.equal(
    forecast([unknown], company, 2, '2026-11-01').reduce((sum, m) => sum + m.amount, 0),
    0
  );
  assert.equal(
    groupSubscriptions([
      { ...sub, bundleId: 'bundle' },
      { ...unknown, bundleId: 'bundle', cycle: 'monthly' },
    ])[0].amount,
    null
  );
});
test('bundled plans share one card and total while retaining independent forecasts and billing dates', () => {
  const plans = [
    {
      ...sub,
      id: 'domain',
      bundleId: 'domain',
      name: 'example.com',
      vendor: 'Limda Host - Domain',
      amount: 1857,
      currency: 'BDT',
      cycle: 'yearly',
      nextBillingDate: '2027-07-18',
    },
    {
      ...sub,
      id: 'hosting',
      bundleId: 'domain',
      name: 'Hosting - example.com',
      vendor: 'Limda Host - Hosting',
      amount: 1800,
      currency: 'BDT',
      cycle: 'yearly',
      nextBillingDate: '2027-08-25',
    },
  ];
  const grouped = groupSubscriptions([...plans].reverse());
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].id, 'domain');
  assert.equal(grouped[0].name, 'example.com');
  assert.equal(grouped[0].amount, 3657);
  assert.equal(grouped[0].nextBillingDate, '2027-07-18');
  assert.equal(grouped[0].plans.length, 2);
  const stats = statsFor({ company, subscriptions: plans, paidThisMonth: [] });
  assert.equal(stats.liveCount, 1);
  assert.equal(stats.live.length, 2);
  assert.equal(stats.monthly, 304.75);
  assert.deepEqual(
    forecast(plans, company, 2, '2027-07-01').map((m) => m.amount),
    [1857, 1800]
  );
  assert.equal(plans[1].amount, 1800);
  assert.equal(groupSubscriptions(plans.map((p) => ({ ...p, bundleId: '' }))).length, 2);
  assert.equal(groupSubscriptions([plans[0], { ...plans[1], currency: 'USD' }]).length, 2);
});
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
test('original currency totals keep USD costs separate from converted totals', () => {
  const stats = statsFor({
    company: { ...company, rates: { BDT: 1 } },
    subscriptions: [
      sub,
      { ...sub, id: 'annual', amount: 120, cycle: 'yearly' },
      { ...sub, id: 'bdt', amount: 500, currency: 'BDT' },
      { ...sub, id: 'cancelled', amount: 999, status: 'cancelled' },
      { ...sub, id: 'once', amount: 100, cycle: 'once' },
    ],
    paidThisMonth: [
      { _id: 'USD', total: 30 },
      { _id: 'BDT', total: 500 },
    ],
  });
  assert.deepEqual(stats.monthlyByCurrency, { USD: 20, BDT: 500 });
  assert.deepEqual(stats.paidByCurrency, { USD: 30, BDT: 500 });
  assert.equal(stats.monthly, 500);
  assert.equal(stats.paid, 500);
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
