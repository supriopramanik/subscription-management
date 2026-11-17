import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { config } from '../server/src/config.js';
import { Company, User, Subscription, Payment, Activity } from '../server/src/models.js';

const evidence = JSON.parse(await fs.readFile(new URL('./hostinger-verified.json', import.meta.url), 'utf8'));
const scope = { vendor: /^Hostinger(?:\s|$)/i };
const fingerprint = (rows) => JSON.stringify(rows);
assert.equal(evidence.plans.length, 17);
assert.equal(evidence.emails.length, 30);
assert.equal(evidence.websites.length, 40);
assert.equal(new Set(evidence.payments.map(p => p[0])).size, 32);
const apply = process.argv.includes('--apply');

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  assert.equal((await Company.findById('workspace'))?.name, 'Complaiance BD Ltd.');
  const admin = await User.findOne({ active: true, role: 'admin' });
  assert.ok(admin);
  const old = await Subscription.find(scope).sort({ _id: 1 }).lean();
  const oldPayments = await Payment.find({ subscription: { $in: old.map(s => s._id) } }).sort({ _id: 1 }).lean();
  assert.ok(old.every(s => !s.files?.length), 'Attachments need preservation before replacement');
  const others = await Subscription.find({ vendor: { $not: scope.vendor } }).sort({ _id: 1 }).lean();
  const otherPayments = await Payment.find({ subscription: { $nin: old.map(s => s._id) } }).sort({ _id: 1 }).lean();
  if (!apply) {
    console.log(JSON.stringify({ mode: 'review', existing: old.length, existingPayments: oldPayments.length, targetCurrent: 17, includedEmails: 30, includedWebsites: 40, paidTransactions: 32, refunds: evidence.refunds, untouchedSubscriptions: others.length }));
  } else {
    await fs.writeFile(new URL('./hostinger-immediately-before-apply.json', import.meta.url), JSON.stringify({ subscriptions: old, payments: oldPayments }, null, 2));
    const touchedPayments = new Set();
    await mongoose.connection.transaction(async session => {
      const mapped = new Map();
      const kept = new Set();
      for (const [providerId, name, type, amount, nextBillingDate, status, autoRenew, providerStatus, expiration] of evidence.plans) {
        const existing = old.filter(s => s.providerId === providerId || s.name === name || (providerId === '169kEkTu6hEc7FuAw' && s.name === 'Hostinger Hosting - shelterco.uk'));
        assert.ok(existing.length <= 1, `Ambiguous existing subscription: ${name}`);
        let doc = existing.length ? await Subscription.findById(existing[0]._id).session(session) : new Subscription({ owner: admin._id, createdBy: admin._id });
        const includedServices = [];
        let detail = `Provider subscription ID: ${providerId}. Verified ${evidence.observedOn}.\nService: ${type}. Provider expiry: ${expiration}.\nRenewal quote: USD ${amount.toFixed(2)} per 12 months, excluding applicable taxes/fees. Actual historical payments are recorded separately.\n${providerStatus}.\nSource: ${evidence.billingSource}/${providerId}`;
        if (providerId === '169kEkTu6hEc7FuAw') {
          detail += '\nPrimary hosting domain: shelterco.uk. All 40 hosted websites and 30 free email plans are included below, without separate recurring charges. Daily Backup is included free. Renewal taxes/fees shown: USD 0.00. Historical Premium Web Hosting payments refer to this same subscription ID. Pending unpaid Premium hosting and duplicate osakatool orders are excluded from billable subscriptions.';
          for (const [domain, plan, expiresOn, quantity, serviceStatus] of evidence.emails) includedServices.push({ name: `@${domain}`, kind: 'email', plan, expiresOn, quantity: String(quantity || ''), status: serviceStatus, note: 'Included with Business Web Hosting; no separate recurring charge. Source: https://hpanel.hostinger.com/emails' });
          for (const [domain, createdOn, platform, serviceStatus] of evidence.websites) includedServices.push({ name: domain, kind: 'website', plan: platform, createdOn, status: serviceStatus, note: 'Website hosted within this plan. Domain registration, when separately billed, remains its own subscription. Source: https://hpanel.hostinger.com/websites' });
          includedServices.push({ name: 'Daily Backup', kind: 'addon', plan: 'Included free', status: 'Included', expiresOn: expiration });
        }
        if (providerId === '16CbdZVIdggA110zb') detail += '\nKVM 2 VPS: srv1642074.hstgr.cloud. Renewal taxes/fees shown: USD 0.00.';
        if (providerId === 'AzqNYOUpW904t9jf7') detail += '\nReach 100 for osakatoyo.com. Renewal taxes/fees shown: USD 0.00.';
        if (['AzqcRmVbDATWP3yA3', 'Azz2JZVb6lLLK2QQr', '169sugVb8aWxp1jq'].includes(providerId)) includedServices.push({ name: 'Domain WHOIS Privacy Protection', kind: 'addon', plan: 'Included free', status: status === 'cancelled' ? 'Cancelled with domain' : 'Included', expiresOn: expiration });
        if (providerId === '169sugVb8aWxp1jq') detail += '\nMisspelled domain; cancelled and original USD 10.19 payment H_55023032 fully refunded. Refund completion verified; refund date not displayed.';
        if (providerId === 'AzqcRmVbDATWP3yA3') detail += '\nCorrectly spelled domain. Paid USD 10.19 on 2026-11-17; registration remains under review. Next automatic charge date differs from expiration.';
        if (providerId === 'Azz2JZVb6lLLK2QQr') detail += '\nNext automatic charge date differs from expiration. Separate pending duplicate orders are not additional active domains.';
        doc.set({ name, vendor: `Hostinger - ${type}`, providerId, providerStatus, archived: false, bundleId: '', website: type.includes('Domain') ? `https://${name}` : `${evidence.billingSource}/${providerId}`, description: detail, category: type.includes('Reach') ? 'Marketing' : 'Infrastructure', amount, currency: 'USD', cycle: 'yearly', nextBillingDate, billingAnchorDay: Number(nextBillingDate.slice(-2)), status, autoRenew, includedServices });
        await doc.save({ session });
        mapped.set(providerId, doc);
        kept.add(String(doc._id));
      }
      for (const [, providerId, type, , paidDate, amount] of evidence.payments) {
        if (mapped.has(providerId)) continue;
        let doc = old.find(s => s.providerId === providerId);
        doc = doc ? await Subscription.findById(doc._id).session(session) : new Subscription({ owner: admin._id, createdBy: admin._id });
        doc.set({ name: `Historical ${type} (${providerId})`, vendor: `Hostinger - ${type}`, providerId, providerStatus: 'Historical payment record; no current subscription shown', archived: true, bundleId: '', amount, currency: 'USD', cycle: 'once', nextBillingDate: paidDate, status: 'cancelled', autoRenew: false, includedServices: [], category: 'Infrastructure', website: evidence.paymentSource, description: `Historical service preserved for verified payment history. No current renewal date or domain shown in provider history. ${paidDate} is the payment-date archive key, not a renewal date. Provider ID: ${providerId}. Source: ${evidence.paymentSource}` });
        await doc.save({ session });
        mapped.set(providerId, doc);
        kept.add(String(doc._id));
      }
      for (const [providerPaymentId, providerId, service, domain, paidDate, amount] of evidence.payments) {
        const sub = mapped.get(providerId);
        const matches = oldPayments.filter(p => p.providerPaymentId === providerPaymentId || (!p.providerPaymentId && String(p.subscription) === String(sub._id) && p.paidDate === paidDate));
        assert.ok(matches.length <= 1, `Ambiguous payment ${providerPaymentId}`);
        const payment = matches.length ? await Payment.findById(matches[0]._id).session(session) : new Payment({ paidBy: admin._id });
        const priorReference = payment.reference || '';
        const refundedAmount = evidence.refunds.find(r => r[0] === providerPaymentId)?.[1] || 0;
        payment.set({ subscription: sub._id, subscriptionName: sub.name, providerPaymentId, amount, refundedAmount, currency: 'USD', paidDate, dueDate: payment.dueDate || paidDate, reference: priorReference.includes(providerPaymentId) ? priorReference : `${providerPaymentId}${priorReference ? ` / ${priorReference}` : ''}`, note: `Verified Hostinger paid transaction: ${service}${domain ? `, ${domain}` : ''}. Provider subscription: ${providerId}. Actual paid amount USD ${amount.toFixed(2)}. ${matches.length ? 'Original invoice reference and billing-period key preserved.' : 'Exact historical due date not displayed; payment date used as archive period key.'} ${refundedAmount ? `Fully refunded USD ${refundedAmount.toFixed(2)}; refund date not displayed. ` : ''}Imported by administrator as bookkeeping recorder; does not identify actual payer. Source: ${evidence.paymentSource}/${providerPaymentId}` });
        await payment.save({ session });
        touchedPayments.add(String(payment._id));
      }
      assert.ok(oldPayments.every(p => touchedPayments.has(String(p._id))), 'Unmatched existing payments must be reviewed');
      const obsolete = old.filter(s => !kept.has(String(s._id))).map(s => s._id);
      assert.equal(await Payment.countDocuments({ subscription: { $in: obsolete } }).session(session), 0);
      await Subscription.deleteMany({ _id: { $in: obsolete }, ...scope }).session(session);
      assert.equal(await Subscription.countDocuments({ ...scope, archived: { $ne: true } }).session(session), 17);
      assert.equal(await Subscription.countDocuments({ ...scope, archived: true }).session(session), 5);
      assert.equal(await Payment.countDocuments({ subscription: { $in: [...mapped.values()].map(s => s._id) } }).session(session), 32);
      await Activity.create([{ actor: admin._id, actorName: 'Codex (user-requested reorganization)', action: 'Reorganized Hostinger records', target: 'Hostinger', detail: 'Reconciled authenticated provider data: 17 current subscriptions, 40 websites and 30 free email plans nested in Business hosting, 32 paid transactions including one full USD 10.19 refund; five hidden history-only services retained. Other providers unchanged.' }], { session, ordered: true });
      await Company.updateOne({ _id: 'workspace' }, { $inc: { revision: 1 } }).session(session);
    });
    assert.equal(fingerprint(await Subscription.find({ vendor: { $not: scope.vendor } }).sort({ _id: 1 }).lean()), fingerprint(others));
    assert.equal(fingerprint(await Payment.find({ subscription: { $in: others.map(s => s._id) } }).sort({ _id: 1 }).lean()), fingerprint(otherPayments));
    const final = await Subscription.find(scope).lean();
    const payments = await Payment.find({ subscription: { $in: final.map(s => s._id) } }).lean();
    const audit = { current: final.filter(s => !s.archived).length, historyOnly: final.filter(s => s.archived).length, includedEmails: final.flatMap(s => s.includedServices).filter(s => s.kind === 'email').length, includedWebsites: final.flatMap(s => s.includedServices).filter(s => s.kind === 'website').length, payments: payments.length, grossUSD: +(payments.reduce((sum, p) => sum + p.amount, 0)).toFixed(2), refundedUSD: +(payments.reduce((sum, p) => sum + (p.refundedAmount || 0), 0)).toFixed(2), otherProvidersUnchanged: true };
    await fs.writeFile(new URL('./hostinger-reorganization-result.json', import.meta.url), JSON.stringify(audit, null, 2));
    console.log(JSON.stringify(audit));
  }
} finally {
  await mongoose.disconnect();
}
