import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { extractReceiptFields, receiptDate } from '../src/receipt-fields.js';
import { extractReceipt } from '../src/receipt-extraction.js';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

const lines = [
  'Hostinger',
  'Subscription: Business Hosting',
  'Plan: Business',
  'Subtotal: USD 100.00',
  'Total paid: USD 129.99',
  'Billing cycle: yearly',
  'Next billing date: 2027-11-22',
  'Visa ending in 4242',
];
test('extracts subscription fields, prefers total and keeps only masked payment details', () => {
  const { fields } = extractReceiptFields(lines.join('\n'));
  assert.deepEqual(fields, {
    name: 'Business Hosting',
    vendor: 'Business',
    website: 'https://hostinger.com',
    amount: 129.99,
    currency: 'USD',
    cycle: 'yearly',
    nextBillingDate: '2027-11-22',
    paymentMethod: 'Visa •• 4242',
  });
});
test('leaves ambiguous values empty instead of inventing renewal dates or dollar currency', () => {
  const { fields, warnings } = extractReceiptFields(
    'Receipt\nPayment date: 2026-11-22\nTotal: $19.99\nNext billing date: 03/04/2027'
  );
  assert.equal(fields.amount, 19.99);
  assert.equal(fields.currency, undefined);
  assert.equal(fields.nextBillingDate, undefined);
  assert.ok(warnings.length);
  assert.equal(receiptDate('2027-02-30'), undefined);
  assert.equal(receiptDate('30 February 2027'), undefined);
  assert.equal(extractReceiptFields('Total: EUR 19,99').fields.amount, undefined);
  assert.equal(extractReceiptFields('Total: USD -20').fields.amount, undefined);
  assert.equal(receiptDate('22 November 2027'), '2027-11-22');
  assert.equal(receiptDate('Nov 22,2027'), '2027-11-22');
  assert.equal(receiptDate('22/11/2027'), '2027-11-22');
});
test('supports Bengali digits and detects conflicting invoice totals', () => {
  assert.equal(extractReceiptFields('Vendor: Example\nমোট: ৳ ১,২৫০.৫০').fields.amount, 1250.5);
  assert.equal(extractReceiptFields('মোট: ৳ ১২৫০').fields.currency, 'BDT');
  assert.equal(extractReceiptFields('Total: USD 20\nTotal: USD 30').fields.amount, undefined);
});

test('receipt purchase dates are returned separately from renewal dates', () => {
  const { fields } = extractReceiptFields(
    'Grok\nPayment date: 22 November 2026\nBilling cycle: monthly\nTotal: BDT 4300'
  );
  assert.equal(fields.purchaseDate, '2026-11-22');
  assert.equal(fields.nextBillingDate, undefined);
  assert.equal(fields.cycle, 'monthly');
});

test('paid domain invoices use the service domain and full invoice amount, not the zero balance', () => {
  const { fields, warnings } = extractReceiptFields(`Hostinger International Ltd.
INVOICE
Invoice Amount # $9.99 (USD)
Next Billing Date # Nov 22, 2027
DESCRIPTION PRICE DISCOUNT TOTAL EXCL. VAT VAT AMOUNT (USD)
.SI Domain (billed every year)
example.si $10.99 x 1 ($1.00) $9.99 $0.00 $9.99
Nov 22, 2026 to Nov 22, 2027
Total excl. VAT $9.99
Total $9.99
Payments ($9.99)
Amount Due (USD) $0.00`);
  assert.deepEqual(fields, {
    name: 'example.si',
    website: 'https://example.si',
    amount: 9.99,
    currency: 'USD',
    cycle: 'yearly',
    vendor: 'Hostinger - .SI Domain',
    nextBillingDate: '2027-11-22',
  });
  assert.equal(warnings.length, 0);
});

test('payment-detail screenshots recognize every-year billing and the service period end', () => {
  const { fields, warnings } = extractReceiptFields(`Payment details
Payment ID: H_123 Invoice ID: HCY-123
Services Subscription ID Period Unit price Discount Amount
.SI Domain (billed every year)
example.si
169w6uVbgZFJR8jQ
2026-11-22 – 2027-11-22 $10.99 $1.00 $9.99
Payment summary
Subtotal $9.99
Taxes & fees $0.00
Total $9.99`);
  assert.equal(fields.name, 'example.si');
  assert.equal(fields.amount, 9.99);
  assert.equal(fields.cycle, 'yearly');
  assert.equal(fields.nextBillingDate, '2027-11-22');
  assert.ok(warnings.some((warning) => /currency/.test(warning)));
  assert.ok(warnings.some((warning) => /period end/.test(warning)));
});

test('OCR can join the supplier address and renewal label onto the same line', () => {
  const { fields } = extractReceiptFields(`Hostinger International Ltd.
Cyprus Next Billing Date # Nov 22,2027
.SI Domain (billed every year)
example.si
Invoice Amount # $9.99 (USD)
Amount Due (USD) $0.00`);
  assert.equal(fields.nextBillingDate, '2027-11-22');
  assert.equal(fields.amount, 9.99);
  assert.equal(fields.name, 'example.si');
});

test('multiple service domains do not silently select one renewal date', () => {
  const { fields, warnings } = extractReceiptFields(`Hostinger
.SI Domain (billed every year)
first.si
2026-11-22 – 2027-11-22
.COM Domain (billed every year)
second.com
2026-12-22 – 2027-12-22
Total: USD 20.00`);
  assert.equal(fields.nextBillingDate, undefined);
  assert.ok(warnings.some((warning) => /multiple services/.test(warning)));
});
test('rejects empty or unsupported documents', async () => {
  await assert.rejects(extractReceipt(), { status: 400 });
  await assert.rejects(extractReceipt({ buffer: Buffer.from('not a receipt') }), { status: 400 });
});

function pdf(objects) {
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}
function receiptImage() {
  const canvas = createCanvas(1200, 850);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 1200, 850);
  context.fillStyle = 'black';
  context.font = '32px Arial';
  lines.forEach((line, i) => context.fillText(line, 50, 75 + i * 85));
  return canvas;
}
test('reads a real PNG receipt with offline OCR', { timeout: 95000 }, async () => {
  const result = await extractReceipt({ buffer: receiptImage().toBuffer('image/png') });
  assert.equal(result.fields.name, 'Business Hosting', JSON.stringify(result));
  assert.equal(result.fields.amount, 129.99);
  assert.equal(result.fields.nextBillingDate, '2027-11-22');
});
test('extracts text from a real multipage-capable PDF reader', { timeout: 95000 }, async () => {
  const stream = `BT /F1 16 Tf 40 750 Td ${lines.map((line, i) => `${i ? '0 -40 Td ' : ''}(${line}) Tj`).join('\n')} ET`;
  const bytes = pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]);
  const result = await extractReceipt({ buffer: bytes });
  assert.equal(result.fields.amount, 129.99, JSON.stringify(result));
  assert.equal(result.fields.nextBillingDate, '2027-11-22');
});
test('renders a scanned PDF and reads it with OCR', { timeout: 95000 }, async () => {
  const image = receiptImage().toBuffer('image/jpeg').toString('latin1');
  const stream = 'q 600 0 0 425 0 0 cm /Im1 Do Q';
  const bytes = pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 425] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    `<< /Type /XObject /Subtype /Image /Width 1200 /Height 850 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n${image}\nendstream`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]);
  const result = await extractReceipt({ buffer: bytes });
  assert.equal(result.fields.amount, 129.99, JSON.stringify(result));
});

test(
  'development watch mode ignores Node dependency messages and waits for the receipt result',
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'subtrack-watch-test-'));
    const fixture = join(directory, 'receipt.mjs');
    const bytes = receiptImage().toBuffer('image/png');
    await writeFile(
      fixture,
      `import { extractReceipt } from ${JSON.stringify(new URL('../src/receipt-extraction.js', import.meta.url).href)};
const result = await extractReceipt({buffer:Buffer.from(${JSON.stringify(bytes.toString('base64'))}, 'base64')});
console.log('RECEIPT_RESULT '+JSON.stringify(result));`
    );
    const child = spawn(process.execPath, ['--watch', '--watch-preserve-output', fixture], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stopped = new Promise((resolve) => child.once('close', resolve));
    let timer;
    try {
      const result = await new Promise((resolve, reject) => {
        let stdout = '',
          stderr = '';
        timer = setTimeout(
          () => reject(new Error(`Watch-mode receipt timed out: ${stderr}`)),
          20000
        );
        child.on('error', reject);
        child.stderr.on('data', (data) => {
          stderr += data;
        });
        child.stdout.on('data', (data) => {
          stdout += data;
          const match = stdout.match(/^RECEIPT_RESULT (.+)\r?$/m);
          if (match) resolve(JSON.parse(match[1]));
        });
      });
      assert.equal(result.fields?.name, 'Business Hosting', JSON.stringify(result));
      assert.equal(result.fields.amount, 129.99);
      assert.equal(result.fields.nextBillingDate, '2027-11-22');
      assert.ok(Array.isArray(result.warnings));
      assert.equal(typeof result.text, 'string');
    } finally {
      clearTimeout(timer);
      child.kill();
      await stopped;
      assert.ok(resolvePath(directory).startsWith(join(tmpdir(), 'subtrack-watch-test-')));
      await rm(directory, { recursive: true, force: true });
    }
  }
);
