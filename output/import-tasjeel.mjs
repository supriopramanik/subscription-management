import mongoose from 'mongoose';
import { config } from '../server/src/config.js';
import { Company, User, Subscription, Payment, Activity } from '../server/src/models.js';

// Transcribed from the authenticated Tasjeel UI and Paid invoices at the user's request.
// Dates use ISO format. Invoice line amounts and transaction dates were verified individually.
const domains = [
  ['altrade.ae',116059,'2025-04-09','2027-04-09',false,['2026-10-07','2027-01-05','YE1']],
  ['galaxyagro.ae',120914,'2025-05-23','2027-05-23',false,['2026-11-02','2027-01-31','YR2']],
  ['galaxyco.ae',109517,'2025-02-04','2027-02-04',false,null],
  ['galaxyhvac.ae',138191,'2025-10-19','2027-10-19',false,null],
  ['galaxysolution.ae',79369,'2024-02-05','2027-02-05',false,null],
  ['galaxyspaces.ae',171313,'2026-07-20','2027-07-20',false,['2026-09-18','2026-12-17','YR2']],
  ['globalpro.ae',166784,'2026-06-14','2027-06-14',false,['2026-10-13','2027-01-11','YR2']],
  ['gulfcool.ae',138193,'2025-10-19','2027-10-19',false,null],
  ['gulffire.ae',138192,'2025-10-19','2027-10-19',false,null],
  ['gulfmfg.ae',154891,'2026-03-03','2027-03-03',false,['2026-11-03','2027-02-01','YR2']],
  ['libertyme.ae',153199,'2026-02-18','2027-02-18',true,['2026-11-08','2027-02-06','YR1']],
  ['primegadgets.ae',158100,'2026-04-06','2027-04-06',false,['2026-11-14','2027-02-12','YR1']],
  ['safetyshops.ae',171312,'2026-07-20','2027-07-20',true,['2026-09-19','2026-12-18','YR1']],
];
// Domain, period start/due date, actual payment date, AED amount, invoice number, invoice ID, period end.
const payments = [
  ['galaxysolution.ae','2024-02-05','2024-02-05',129,'TJ216942',223614,'2025-02-04'],
  ['galaxyco.ae','2025-02-04','2025-02-04',129,'TJ284662',304754,'2026-02-03'],
  ['galaxysolution.ae','2025-02-05','2025-01-27',145,'TJ282714',296616,'2026-02-04'],
  ['altrade.ae','2025-04-09','2025-04-09',129,'TJ299139',321479,'2026-04-08'],
  ['galaxyagro.ae','2025-05-23','2025-05-23',129,'TJ309673',334055,'2026-05-22'],
  ['galaxyhvac.ae','2025-10-19','2025-10-19',129,'TJ349450',381367,'2026-10-18'],
  ['gulffire.ae','2025-10-19','2025-10-19',129,'TJ349451',381368,'2026-10-18'],
  ['gulfcool.ae','2025-10-19','2025-10-19',129,'TJ349452',381369,'2026-10-18'],
  ['galaxyco.ae','2026-02-04','2026-02-02',145,'TJ381036',408127,'2027-02-03'],
  ['galaxysolution.ae','2026-02-05','2026-02-02',145,'TJ381037',408548,'2027-02-04'],
  ['libertyme.ae','2026-02-18','2026-02-18',129,'TJ386309',425081,'2027-02-17'],
  ['gulfmfg.ae','2026-03-03','2026-03-03',129,'TJ390813',430145,'2027-03-02'],
  ['primegadgets.ae','2026-04-06','2026-04-06',129,'TJ400310',441345,'2027-04-05'],
  ['altrade.ae','2026-04-09','2026-04-09',145,'TJ401334',432363,'2027-04-08'],
  ['galaxyagro.ae','2026-05-23','2026-05-16',145,'TJ413125',447956,'2027-05-22'],
  ['globalpro.ae','2026-06-14','2026-06-14',129,'TJ421959',468077,'2027-06-13'],
  ['galaxyspaces.ae','2026-07-20','2026-07-20',129,'TJ433868',482294,'2027-07-19'],
  ['safetyshops.ae','2026-07-20','2026-07-20',129,'TJ433868',482294,'2027-07-19'],
  ['galaxyhvac.ae','2026-10-19','2026-10-12',145,'TJ462605',517170,'2027-10-18'],
  ['gulffire.ae','2026-10-19','2026-10-12',145,'TJ462605',517170,'2027-10-18'],
  ['gulfcool.ae','2026-10-19','2026-10-12',145,'TJ462605',517170,'2027-10-18'],
];

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const company = await Company.findById('workspace');
  if (company?.name !== 'Complaiance BD Ltd.') throw new Error('Unexpected workspace');
  const owner = await User.findOne({ active: true, role: 'admin' });
  if (!owner) throw new Error('No active administrator');
  await mongoose.connection.transaction(async (session) => {
    for (const [name, providerId, registered, next, autoRenew, ssl] of domains) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (await Subscription.exists({ name: { $regex: `^${escaped}$`, $options: 'i' } }).session(session)) {
        throw new Error(`Existing record found; import stopped to prevent duplicates: ${name}`);
      }
      const source = `https://my.tasjeel.ae/clientarea.php?action=domaindetails&id=${providerId}`;
      const sslNote = ssl
        ? `SSL observed valid on 2026-11-17: start ${ssl[0]}, expiry ${ssl[1]}, issuer ${ssl[2]}. Certificate metadata is informational, not an additional paid subscription.`
        : 'SSL check: no SSL detected by the provider on 2026-11-17; this is an observation, not a separate subscription.';
      const history = payments.filter((p) => p[0] === name);
      const [sub] = await Subscription.create([{
        name, vendor: 'Tasjeel.ae - .AE Domain', website: `https://${name}`,
        category: 'Infrastructure', department: 'Operations', owner: owner._id, createdBy: owner._id,
        amount: 145, currency: 'AED', cycle: 'yearly', nextBillingDate: next,
        billingAnchorDay: Number(next.slice(-2)), status: 'active', seats: 1,
        paymentMethod: 'Credit/Debit Card', autoRenew, color: '#f05091',
        description: `Provider: Tasjeel.ae (https://tasjeel.ae). Imported at user request from the authenticated account on 2026-11-17. Provider domain ID: ${providerId}. Registration date: ${registered}. Next due date: ${next}. First payment: AED 129.00. Current recurring amount: AED 145.00 every 1 year. Payment method: Credit/Debit Card. Provider status: Active. Auto-renew: ${autoRenew ? 'ON' : 'OFF'} (current account setting verified during import). ${sslNote} ${history.length} paid domain invoice lines imported with billing-period start and actual transaction date. Cancelled invoice 507176 excluded. Source: ${source}`,
      }], { session });
      await Payment.create(history.map(([, dueDate, paidDate, amount, reference, invoiceId, end]) => ({
        subscription: sub._id, subscriptionName: name, amount, currency: 'AED', dueDate, paidDate,
        paidBy: owner._id, reference: `Tasjeel ${reference}`,
        note: `Imported by Codex at user request from a Paid invoice. Coverage ${dueDate} to ${end}; paid date verified in the invoice transaction table. Amount is this domain's invoice line, not the combined invoice total. Invoice lists no separate tax or credit charge. Workspace administrator is bookkeeping recorder, not evidence of original payer. Source: https://my.tasjeel.ae/viewinvoice.php?id=${invoiceId}`,
      })), { session, ordered: true });
      await Activity.create([{
        actorName: 'Codex (user-requested import)', action: 'added subscription', target: name,
        detail: `Tasjeel.ae: AED 145 / yearly; next due ${next}; ${history.length} paid invoice lines imported.`,
      }], { session });
    }
  });
  const saved = await Subscription.find({ name: { $in: domains.map((d) => d[0]) } })
    .select('name amount currency nextBillingDate autoRenew description').lean();
  const history = await Payment.aggregate([
    { $match: { subscription: { $in: saved.map((s) => s._id) } } },
    { $group: { _id: null, count: { $sum: 1 }, totalAed: { $sum: '$amount' } } },
  ]);
  if (saved.length !== 13 || history[0]?.count !== 21) throw new Error('Verification count mismatch');
  console.log(JSON.stringify({
    count: saved.length, yearlyAed: saved.reduce((sum, s) => sum + s.amount, 0), history,
    autoRenewOn: saved.filter((s) => s.autoRenew).map((s) => s.name),
    detailsSaved: saved.every((s) => s.description.includes('Registration date:') && s.description.includes('SSL')),
  }));
} finally {
  await mongoose.disconnect();
}
