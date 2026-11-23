import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createCanvas } from '@napi-rs/canvas';
import { extractReceipt } from '../../server/src/receipt-extraction.js';

let dom,
  vite,
  createRoot,
  SubscriptionForm,
  makeDemo,
  demoUser,
  root,
  errors,
  resolveRequest,
  savedPayload;
const originalFetch = globalThis.fetch;
const originalCreateURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;
const receiptFields = {
  name: 'Figma',
  amount: 45,
  currency: 'USD',
  cycle: 'monthly',
  nextBillingDate: '2027-01-31',
};
before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:5173' });
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'FormData', 'File'])
    globalThis[key] = dom.window[key];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  ({ SubscriptionForm } = await vite.ssrLoadModule('/src/forms.jsx'));
  ({ makeDemo, demoUser } = await vite.ssrLoadModule('/src/demo.js'));
});
beforeEach(async () => {
  errors = [];
  URL.createObjectURL = () => 'blob:receipt-test';
  URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/subscriptions/extract-receipt');
    assert.ok(options.body instanceof FormData);
    return await new Promise((resolve) => {
      resolveRequest = resolve;
    });
  };
  root = createRoot(document.getElementById('root'), {
    onUncaughtError: (error) => errors.push(error),
  });
  await act(async () =>
    root.render(
      React.createElement(SubscriptionForm, {
        data: makeDemo(),
        user: demoUser,
        onClose() {},
        onSave(payload) {
          savedPayload = payload;
        },
      })
    )
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
});
after(async () => {
  await vite.close();
  dom.window.close();
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateURL;
  URL.revokeObjectURL = originalRevokeURL;
});

async function paste() {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  const image = new File(['receipt'], 'clipboard.png', { type: 'image/png' });
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [{ kind: 'file', type: image.type, getAsFile: () => image }] },
  });
  await act(async () => document.dispatchEvent(event));
  assert.equal(errors.length, 0, errors[0]?.stack);
  assert.match(document.body.textContent, /Reading receipt/);
}
async function upload(type, bytes = 'receipt') {
  const input = document.querySelector('.receipt-upload input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      new File([bytes], type === 'application/pdf' ? 'receipt.pdf' : 'receipt.png', { type }),
    ],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function respond(data, status = 200) {
  await act(async () => resolveRequest({ ok: status < 400, status, json: async () => data }));
  assert.equal(errors.length, 0, errors[0]?.stack);
  assert.ok(document.querySelector('[role="dialog"]'), 'The subscription form must stay open');
}
const nameInput = () => document.querySelector('input[placeholder="e.g. Figma"]');
const fieldInput = (label) =>
  [...document.querySelectorAll('label.field')]
    .find((field) => field.firstElementChild.textContent.startsWith(label))
    .querySelector('input, select');
async function changeField(label, value) {
  const input = fieldInput(label);
  await act(async () => {
    const prototype =
      input.tagName === 'SELECT'
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(
      new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })
    );
  });
}

test('monthly purchase date calculates a future renewal instead of an overdue purchase day', async () => {
  await changeField('Purchase / start date', '2026-11-22');
  assert.equal(fieldInput('Next payment date').value, '2026-12-22');
  await changeField('Billing cycle', 'yearly');
  assert.equal(fieldInput('Next payment date').value, '2027-11-22');
  await changeField('Purchase / start date', '2026-01-31');
  await changeField('Billing cycle', 'monthly');
  assert.equal(fieldInput('Next payment date').value, '2026-02-28');
});

test('provider/manual renewal dates are preserved when the billing cycle is edited', async () => {
  await changeField('Next payment date', '2026-12-20');
  await changeField('Purchase / start date', '2026-11-22');
  await changeField('Billing cycle', 'yearly');
  assert.equal(fieldInput('Next payment date').value, '2026-12-20');
});

test('saving a calculated month-end renewal sends its purchase-day anchor', async () => {
  await changeField('Subscription name', 'Grok');
  await changeField('Amount per billing cycle', '4300');
  await changeField('Purchase / start date', '2026-01-31');
  await act(async () =>
    document
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  assert.equal(savedPayload.nextBillingDate, '2026-02-28');
  assert.equal(savedPayload.billingAnchorDay, 31);
  assert.equal(savedPayload.purchaseDate, undefined);
});

test('receipt purchase dates advance one billing cycle while explicit renewal dates take priority', async () => {
  await paste();
  await respond({ fields: { name: 'Grok', purchaseDate: '2026-11-22', cycle: 'monthly' } });
  assert.equal(fieldInput('Purchase / start date').value, '2026-11-22');
  assert.equal(fieldInput('Next payment date').value, '2026-12-22');
  await paste();
  await respond({
    fields: { purchaseDate: '2026-11-22', cycle: 'monthly', nextBillingDate: '2026-12-21' },
  });
  assert.equal(fieldInput('Next payment date').value, '2026-12-21');
});

test('editing an existing subscription keeps its saved renewal date', async () => {
  const data = makeDemo();
  await act(async () =>
    root.render(
      React.createElement(SubscriptionForm, {
        key: 'edit',
        data,
        user: demoUser,
        sub: { ...data.subscriptions[0], nextBillingDate: '2026-12-22' },
        onClose() {},
        onSave() {},
      })
    )
  );
  assert.equal(fieldInput('Next payment date').value, '2026-12-22');
  await changeField('Billing cycle', 'yearly');
  assert.equal(fieldInput('Next payment date').value, '2026-12-22');
});

function makeReceiptPDF() {
  const stream =
    'BT /F1 24 Tf 40 700 Td (Figma) Tj 0 -50 Td (Total: USD 45.00) Tj 0 -50 Td (Next billing date: 2027-01-31) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test(
  'real image OCR and PDF extraction populate the rendered form',
  { timeout: 95000 },
  async () => {
    const canvas = createCanvas(1000, 400);
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, 1000, 400);
    context.fillStyle = 'black';
    context.font = '34px Arial';
    ['Figma', 'Total: USD 45.00', 'Next billing date: 2027-01-31'].forEach((line, i) =>
      context.fillText(line, 30, 75 + i * 85)
    );
    for (const [type, bytes] of [
      ['image/png', canvas.toBuffer('image/png')],
      ['application/pdf', makeReceiptPDF()],
    ]) {
      let completed;
      globalThis.fetch = (_url, options) => {
        completed = (async () => {
          const file = options.body.get('file');
          const data = await new Promise((resolve, reject) => {
            const reader = new window.FileReader();
            reader.onload = () => resolve(Buffer.from(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
          });
          const result = await extractReceipt({ buffer: data });
          return { ok: true, status: 200, json: async () => result };
        })();
        return completed;
      };
      await upload(type, bytes);
      await act(async () => {
        await completed;
      });
      assert.equal(errors.length, 0, errors[0]?.stack);
      assert.equal(nameInput().value, 'Figma');
      assert.equal(document.querySelector('input[type="number"]').value, '45');
      assert.equal(fieldInput('Next payment date').value, '2027-01-31');
    }
  }
);

test('Ctrl+V autofills without crashing when optional warnings are missing', async () => {
  await paste();
  await respond({ fields: receiptFields, text: 'Figma\nTotal: USD 45' });
  assert.equal(nameInput().value, 'Figma');
  assert.equal(document.querySelector('input[type="number"]').value, '45');
  assert.match(document.body.textContent, /Receipt details filled in/);
});
test('PDF and image file uploads use the same autofill flow', async () => {
  for (const type of ['application/pdf', 'image/png']) {
    await upload(type);
    await respond({ fields: receiptFields, warnings: [], text: 'Figma' });
    assert.equal(nameInput().value, 'Figma');
  }
});
test('malformed field values and warning objects cannot crash the form', async () => {
  await paste();
  await respond({
    fields: {
      name: {},
      vendor: [],
      amount: 'oops',
      currency: {},
      cycle: {},
      nextBillingDate: '2027-02-30',
      owner: 'untrusted-owner',
      seats: -1,
    },
    warnings: [null, {}, 'Check your receipt'],
    text: {},
  });
  assert.equal(nameInput().value, '');
  assert.equal(document.querySelector('input[type="number"]').value, '');
  assert.match(document.body.textContent, /Check your receipt/);
});
test('an incomplete response stays inside the form and a second attempt succeeds', async () => {
  await paste();
  await respond({ text: 'Incomplete response' });
  assert.match(document.querySelector('[role="alert"]').textContent, /incomplete response/);
  assert.equal(document.querySelector('button[type="submit"]').disabled, false);
  await paste();
  await respond({ fields: receiptFields, warnings: null });
  assert.equal(nameInput().value, 'Figma');
});
test('OCR failure shows an error without destroying the workspace', async () => {
  await upload('application/pdf');
  await respond({ error: 'No readable text found.' }, 422);
  assert.match(document.querySelector('[role="alert"]').textContent, /No readable text/);
  assert.equal(document.querySelector('button[type="submit"]').disabled, false);
});
test('preview failure does not stop extraction', async () => {
  URL.createObjectURL = () => {
    throw new Error('Preview unavailable');
  };
  await paste();
  await respond({ fields: receiptFields });
  assert.equal(nameInput().value, 'Figma');
});
test('edits made while reading a receipt are preserved', async () => {
  await paste();
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      nameInput(),
      'My custom subscription'
    );
    nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await respond({ fields: receiptFields });
  assert.equal(nameInput().value, 'My custom subscription');
  assert.equal(document.querySelector('input[type="number"]').value, '45');
});
