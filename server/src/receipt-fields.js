// Conservative extraction: unknown values stay empty for the user to review.
import { currencies, dateString } from './domain.js';
import { publicDomain } from '../../shared/site-icons.mjs';

export function receiptDate(value) {
  const iso = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  let date;
  if (iso) date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  else {
    const named = value.match(
      /\b(?:\d{1,2}[\s-]+[A-Za-z]{3,9}[,\s-]+20\d{2}|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*|\s+)20\d{2})\b/
    );
    const numeric = value.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
    if (named) {
      const parsed = new Date(named[0] + ' 12:00:00 UTC');
      const day = Number(named[0].match(/\b\d{1,2}\b/)?.[0]);
      if (!Number.isNaN(+parsed) && parsed.getUTCDate() === day)
        date = parsed.toISOString().slice(0, 10);
    } else if (numeric && (+numeric[1] > 12 || +numeric[2] > 12 || numeric[1] === numeric[2])) {
      const [, a, b, y] = numeric;
      date =
        +b > 12
          ? `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
          : `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
  }
  return date && dateString.safeParse(date).success ? date : undefined;
}

export function extractReceiptFields(raw) {
  const text = raw
    .replace(/[০-৯]/g, (n) => '০১২৩৪৫৬৭৮৯'.indexOf(n))
    .replace(/\r/g, '')
    .slice(0, 80000);
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const fields = {};
  const warnings = [];
  const label = (pattern) => {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern);
      if (match) return (match[1]?.trim() || lines[i + 1] || '').slice(0, 120);
    }
  };
  const name = label(
    /^(?:subscription(?: name)?|service(?: name)?|product(?: name)?)\s*[:\-]\s*(.*)$/i
  );
  const vendor = label(/^(?:vendor|merchant|sold by|supplier|provider)\s*[:\-]\s*(.*)$/i);
  const known = [
    ['Hostinger', 'hostinger.com'],
    ['Namecheap', 'namecheap.com'],
    ['OpenAI', 'openai.com'],
    ['ChatGPT', 'chatgpt.com'],
    ['Figma', 'figma.com'],
    ['Canva', 'canva.com'],
    ['Notion', 'notion.so'],
    ['GitHub', 'github.com'],
    ['Google Workspace', 'workspace.google.com'],
    ['Microsoft 365', 'microsoft.com'],
    ['Adobe', 'adobe.com'],
    ['Dropbox', 'dropbox.com'],
    ['Slack', 'slack.com'],
    ['Zoom', 'zoom.us'],
    ['Tasjeel', 'tasjeel.ae'],
    ['BTCL', 'btcl.gov.bd'],
  ].find(([brand]) => new RegExp(`\\b${brand}\\b`, 'i').test(text));
  const heading =
    lines[0] &&
    !/\d|^(?:invoice|receipt|payment|tax invoice|bill to|sold to|order|thank you)\b/i.test(
      lines[0]
    ) &&
    lines[0].length <= 120
      ? lines[0]
      : undefined;
  if (name || known || vendor || heading) fields.name = name || known?.[0] || vendor || heading;
  const plan = label(/^plan(?: name)?\s*[:\-]\s*(.*)$/i);
  if (plan || vendor) fields.vendor = plan || vendor;
  const website = label(/^website\s*:\s*(.*)$/i)?.match(
    /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i
  )?.[0];
  if (website || known)
    fields.website = website
      ? /^https?:/i.test(website)
        ? website
        : `https://${website}`
      : `https://${known[1]}`;

  // Prefer explicit grand/paid totals over subtotal, tax, balance or line items.
  const totals = lines
    .flatMap((line, index) => {
      const match = line.match(
        /^(invoice amount|grand total|total paid|amount paid|total amount|amount due|total due|total|সর্বমোট|মোট)(?=\s|:|$)\s*[:#\-]?\s*(.*)$/i
      );
      if (!match) return [];
      const value = match[2] || lines[index + 1] || '';
      if (/^(?:excl\.?|exclud|before|without|tax|VAT)\b/i.test(value)) return [];
      // Decimal commas and negative/refund totals need manual review.
      if (/-\s*\d|\d,\d{2}(?![\d,])/.test(value)) return [];
      const number = value.match(
        /(?:^|[^\d])((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)(?![\d.])/
      );
      if (!number) return [];
      return [
        {
          value,
          amount: Number(number[1].replace(/,/g, '')),
          rank: /invoice amount|grand|paid|সর্বমোট/i.test(match[1])
            ? 3
            : /amount due|total due/i.test(match[1])
              ? 1
              : 2,
        },
      ];
    })
    .sort((a, b) => b.rank - a.rank);
  if (totals.length && totals[0].amount <= 1e10) {
    const best = totals.filter((t) => t.rank === totals[0].rank);
    if (new Set(best.map((t) => t.amount)).size === 1) fields.amount = totals[0].amount;
    else warnings.push('Multiple different totals found. Choose the amount for this subscription.');
  }
  const currencyText = totals[0]?.value || text;
  const findCurrency = (value) => [
    ...new Set(currencies.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(value))),
  ];
  const codes = findCurrency(currencyText).length ? findCurrency(currencyText) : findCurrency(text);
  if (codes.length === 1) fields.currency = codes[0];
  else if (!codes.length) {
    if (/৳|\bTk\.?\b|টাকা/i.test(text)) fields.currency = 'BDT';
    else if (/€/.test(text)) fields.currency = 'EUR';
    else if (/£/.test(text)) fields.currency = 'GBP';
    else if (/₹/.test(text)) fields.currency = 'INR';
    // A bare dollar sign could be USD, CAD, AUD or SGD.
  }
  if (fields.amount !== undefined && !fields.currency)
    warnings.push('Check the purchase currency; it could not be identified reliably.');
  const billing =
    label(
      /^(?:billing cycle|billing frequency|billing period|subscription period|term)\s*:\s*(.*)$/i
    ) || text;
  const cycles = [
    ['yearly', /\b(?:yearly|annually|annual|12 months?|1 year|every year|per year)\b/i],
    ['quarterly', /\b(?:quarterly|3 months?)\b/i],
    ['monthly', /\b(?:monthly|per month|1 month|every month)\b/i],
    ['weekly', /\b(?:weekly|per week|1 week|every week)\b/i],
    ['once', /\b(?:one[ -]time|lifetime)\b/i],
  ].filter(([, pattern]) => pattern.test(billing));
  if (cycles.length === 1) fields.cycle = cycles[0][0];
  // In domain/hosting invoices the purchased website is in the service row,
  // while the supplier's website describes the billing provider.
  const services = new Map();
  for (let i = 0; i < lines.length; i++) {
    if (!/\b(?:domain|hosting)\b/i.test(lines[i])) continue;
    for (const line of lines.slice(i, i + 3)) {
      const domain = line.match(/(?:^|\s)((?:[a-z0-9-]+\.)+[a-z]{2,63})(?=\s|$)/i)?.[1];
      if (domain && publicDomain(domain))
        services.set(publicDomain(domain), lines[i].split(/\s*\(/)[0]);
    }
  }
  if (services.size === 1 && !name) {
    const [domain, service] = [...services][0];
    fields.name = domain;
    fields.website = `https://${domain}`;
    fields.vendor = [known?.[0] || vendor, service].filter(Boolean).join(' - ').slice(0, 120);
  } else if (services.size > 1) {
    warnings.push(
      'This invoice contains multiple services. Check which subscription the total belongs to.'
    );
  }
  const ranges = [
    ...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\s*(?:to|[–—−-])\s*(20\d{2}-\d{2}-\d{2})\b/gi),
  ];
  const namedDate = '[A-Za-z]{3,9}\\s+\\d{1,2}(?:,\\s*|\\s+)20\\d{2}';
  ranges.push(
    ...text.matchAll(new RegExp(`\\b(${namedDate})\\s+(?:to|[–—−-])\\s+(${namedDate})\\b`, 'gi'))
  );
  const ends = [
    ...new Set(
      ranges
        .filter((range) => {
          const start = receiptDate(range[1]),
            end = receiptDate(range[2]);
          return start && end && end > start;
        })
        .map((range) => receiptDate(range[2]))
    ),
  ];
  const due = label(
    /(?:^|\s)(?:next (?:payment|billing|renewal)(?: date)?|renewal date|renews(?: on)?|due date|payment due(?: date)?|expires(?: on)?|expiry date)(?:\s*[:#]\s*|\s+)(.*)$/i
  );
  if (due) {
    const parsed = receiptDate(due);
    if (parsed) fields.nextBillingDate = parsed;
    else warnings.push('The renewal date is unclear. Please enter the next payment date.');
  } else if (ends.length === 1 && services.size <= 1) {
    fields.nextBillingDate = ends[0];
    warnings.push(
      'Next payment date was taken from the service period end. Please confirm the renewal date.'
    );
  } else
    warnings.push(
      'No renewal date found. Review the date calculated from the purchase/start date and billing cycle.'
    );
  const purchased = label(
    /(?:^|\s)(?:purchase date|purchased(?: on)?|payment date|paid(?: on| date)|invoice (?:date|issued)(?: date)?)(?:\s*[:#]\s*|\s+)(.*)$/i
  );
  if (purchased) {
    const parsed = receiptDate(purchased);
    if (parsed) fields.purchaseDate = parsed;
  }
  const seats = label(/^(?:seats|licenses|licences|quantity|qty)\s*:\s*(.*)$/i);
  if (
    seats &&
    /^\d+\b/.test(seats) &&
    +seats.match(/^\d+/)[0] > 0 &&
    +seats.match(/^\d+/)[0] <= 100000
  )
    fields.seats = +seats.match(/^\d+/)[0];
  const payment = text.match(
    /\b(Visa|Mastercard|Amex)\b[^\n]{0,30}?(?:ending(?: in)?|[*•x]{2,})\s*(\d{4})\b/i
  );
  if (payment) fields.paymentMethod = `${payment[1]} •• ${payment[2]}`;
  else if (/\bbkash\b/i.test(text)) fields.paymentMethod = 'bKash';
  else if (/\bnagad\b/i.test(text)) fields.paymentMethod = 'Nagad';
  else if (/\bpaypal\b/i.test(text)) fields.paymentMethod = 'PayPal';
  return { fields, warnings };
}
