import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBillingDate, dateString, subscriptionInput, canEdit } from '../src/domain.js';

test('monthly renewals preserve the anchor day across shorter months', () => {
  assert.equal(nextBillingDate('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextBillingDate('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(nextBillingDate('2028-01-31', 'monthly', 31), '2028-02-29');
});
test('yearly, quarterly, weekly and one-time cycles cross boundaries correctly', () => {
  assert.equal(nextBillingDate('2028-02-29', 'yearly', 29), '2029-02-28');
  assert.equal(nextBillingDate('2026-11-30', 'quarterly', 30), '2027-02-28');
  assert.equal(nextBillingDate('2026-12-29', 'weekly'), '2027-01-05');
  assert.equal(nextBillingDate('2026-11-11', 'once'), '2026-11-11');
});
test('invalid and rolled-over dates are rejected', () => {
  for (const date of ['2026-02-30', '2026-13-01', '11/11/2026', '2026-1-1', '2026-00-10'])
    assert.equal(dateString.safeParse(date).success, false);
  assert.equal(dateString.safeParse('2028-02-29').success, true);
});
test('members can only edit their assigned subscriptions', () => {
  assert.equal(canEdit({ id: 'a', role: 'member' }, { owner: { _id: 'a' } }), true);
  assert.equal(canEdit({ id: 'a', role: 'member' }, { owner: 'b' }), false);
  assert.equal(canEdit({ id: 'a', role: 'viewer' }, { owner: 'a' }), false);
  assert.equal(canEdit({ id: 'a', role: 'manager' }, { owner: 'b' }), true);
});
test('input validation rejects executable URLs and unsupported currency', () => {
  const valid = {
    name: 'Tool',
    category: 'Design',
    department: 'Design',
    amount: 29.99,
    currency: 'USD',
    cycle: 'monthly',
    nextBillingDate: '2026-11-11',
    status: 'active',
    seats: 1,
  };
  assert.equal(subscriptionInput.safeParse(valid).success, true);
  assert.equal(
    subscriptionInput.safeParse({ ...valid, website: 'javascript:alert(1)' }).success,
    false
  );
  assert.equal(subscriptionInput.safeParse({ ...valid, amount: 1.001 }).success, false);
  assert.equal(subscriptionInput.safeParse({ ...valid, currency: 'FAKE' }).success, false);
});
