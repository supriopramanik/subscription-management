import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import { config } from '../server/src/config.js';
import { Company, User, Subscription, Payment, Activity } from '../server/src/models.js';

// Transcribed from the authenticated BTCL domain and bill lists on 2026-11-17.
// Domain, provider ID, application date, activation date, valid till, bill ID, last payment.
// No invoice inspection: explicitly excluded by the user's latest instruction.
const domains = [
  ['gadgethub.bd', '2332054', '2026-04-09', '2026-04-11', '2027-04-10', '2405251', '2026-04-16'],
  ['terminus.bd', '2340260', '2026-04-30', '2026-04-30', '2027-04-29', '2414143', '2026-05-07'],
  ['cbdl.bd', '2341558', '2026-05-06', '2026-05-06', '2027-05-05', '2415757', '2026-05-13'],
  ['cbd.bd', '2341560', '2026-05-06', '2026-05-06', '2027-05-05', '2415759', '2026-05-13'],
  ['elitefurnitures.bd', '2349152', '2026-06-06', '2026-06-07', '2027-06-06', '2424695', '2026-06-13'],
  ['titanenergy.bd', '2364242', '2026-07-12', '2026-07-12', '2027-07-11', '2442127', '2026-07-19'],
  ['fireshop.bd', '2401510', '2026-10-17', '2026-10-17', '2027-10-16', '2486631', '2026-10-24'],
];
const evidence = {
  observedOn: '2026-11-17',
  domainSource: 'https://bdia.btcl.com.bd/SearchDomain.do',
  billSource: 'https://bdia.btcl.com.bd/SearchBill.do?moduleID=1',
  domainListPages: 1,
  billListPages: 1,
  providerStatus: 'Active - Buy Completed',
  billType: 'Demand Note',
  billStatus: 'Paid',
  billAmountBDT: 1472,
  priceBasis: 'Last paid bill for a one-year registration. Future renewal quote not displayed; annual tracker amount uses the last bill as an estimate.',
  autoRenewBasis: 'Provider auto-renew setting not displayed. Tracker uses manual renewal; no provider setting was changed.',
  domains,
};
await fs.writeFile(new URL('./btcl-verified.json', import.meta.url), JSON.stringify(evidence, null, 2));

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  assert.equal((await Company.findById('workspace'))?.name, 'Complaiance BD Ltd.');
  const admin = await User.findOne({ active: true, role: 'admin' });
  assert.ok(admin, 'Active administrator required');
  const before = await Subscription.find().sort({ _id: 1 }).lean();
  const previousPayments = await Payment.find().sort({ _id: 1 }).lean();
  const names = domains.map(d => d[0]);
  assert.equal(before.filter(s => names.includes(s.name) || /^BTCL(?:\s|$)/i.test(s.vendor)).length, 0, 'Existing BTCL records must be reconciled, not duplicated');
  await fs.writeFile(new URL('./btcl-before-import.json', import.meta.url), JSON.stringify({ subscriptions: before, payments: previousPayments }, null, 2));
  const savedIds = [];
  await mongoose.connection.transaction(async session => {
    assert.equal(await Subscription.countDocuments({ name: { $in: names } }).session(session), 0);
    for (const [name, providerId, application, activation, expiry, billId, paidDate] of domains) {
      const source = `https://bdia.btcl.com.bd/ViewDomain.do?moduleID=1&entityID=${providerId}&entityTypeID=101`;
      const [sub] = await Subscription.create([{
        name, vendor: 'BTCL - .BD Domain', providerId,
        providerStatus: 'Active - Buy Completed; annual price based on last bill, renewal quote unconfirmed',
        website: `https://${name}`, category: 'Infrastructure', department: 'Operations',
        owner: admin._id, createdBy: admin._id, amount: 1472, currency: 'BDT', cycle: 'yearly',
        nextBillingDate: expiry, billingAnchorDay: Number(expiry.slice(-2)), status: 'active',
        autoRenew: false, color: '#b7ef70',
        description: `BTCL .BD domain, verified in the authenticated portal on 2026-11-17. Provider domain ID: ${providerId}. Status: Active - Buy Completed. Application date: ${application}. Activation date: ${activation}. Valid till: ${expiry}; tracker reminder uses the provider validity end, not an issued future invoice due date. Last paid Demand Note: ${billId}, BDT 1472, last payment ${paidDate}. Annual amount BDT 1472 is an estimate based on that last paid one-year registration bill; future renewal quote, fees and tax breakdown were not displayed. Provider auto-renew setting was not shown; tracker uses manual renewal without changing the provider account. Domain registration is separate from any website or free email included under another hosting provider. Sources: ${source} and ${evidence.billSource}. No invoice document inspection used.`,
      }], { session, ordered: true });
      savedIds.push(sub._id);
      await Payment.create([{
        subscription: sub._id, subscriptionName: name, amount: 1472, currency: 'BDT',
        paidDate, dueDate: activation, paidBy: admin._id, providerPaymentId: `BTCL-${billId}`,
        reference: `BTCL Demand Note ${billId}`,
        note: `Provider bill list marks Demand Note ${billId} Paid, total BDT 1472; last payment ${paidDate}. Domain ID ${providerId}; activation ${activation}, valid till ${expiry}. Exact invoice payment deadline and transaction reference not inspected; activation date is the bookkeeping period key, not a verified payment deadline. Administrator is the bookkeeping recorder, not proof of actual payer. Source: ${evidence.billSource}`,
      }], { session, ordered: true });
      await Activity.create([{
        actor: admin._id, actorName: 'Codex (user-requested import)', action: 'added subscription', target: name,
        detail: `BTCL domain validity and paid bill imported. Valid till ${expiry}; Demand Note ${billId}, BDT 1472 Paid. Annual renewal amount is a last-bill estimate.`,
      }], { session, ordered: true });
    }
    assert.equal(await Subscription.countDocuments({ _id: { $in: savedIds } }).session(session), 7);
    assert.equal(await Payment.countDocuments({ subscription: { $in: savedIds } }).session(session), 7);
    await Company.updateOne({ _id: 'workspace' }, { $inc: { revision: 1 } }).session(session);
  });
  const existingNow = await Subscription.find({ _id: { $in: before.map(s => s._id) } }).sort({ _id: 1 }).lean();
  const paymentsNow = await Payment.find({ _id: { $in: previousPayments.map(p => p._id) } }).sort({ _id: 1 }).lean();
  assert.deepEqual(existingNow, before, 'Existing subscriptions must be unchanged');
  assert.deepEqual(paymentsNow, previousPayments, 'Existing payments must be unchanged');
  const saved = await Subscription.find({ _id: { $in: savedIds } }).lean();
  const paid = await Payment.find({ subscription: { $in: savedIds } }).lean();
  for (const [name, providerId, , , expiry, billId, paidDate] of domains) {
    const sub = saved.find(s => s.name === name);
    assert.equal(sub.providerId, providerId);
    assert.equal(sub.nextBillingDate, expiry);
    const payment = paid.find(p => p.providerPaymentId === `BTCL-${billId}`);
    assert.equal(String(payment.subscription), String(sub._id));
    assert.equal(payment.paidDate, paidDate);
    assert.equal(payment.amount, 1472);
  }
  const result = { subscriptionsAdded: saved.length, paidBillsAdded: paid.length, totalPaidBDT: paid.reduce((sum,p) => sum+p.amount,0), existingDataUnchanged: true, annualAmountsAreLastBillEstimates: true, domains: saved.map(s => ({ name: s.name, validTill: s.nextBillingDate })) };
  await fs.writeFile(new URL('./btcl-import-result.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await mongoose.disconnect();
}
