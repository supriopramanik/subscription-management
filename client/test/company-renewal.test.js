import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';

test('company details and unknown costs survive editing the renewal date and render in subscription details', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:5173' });
  const originals = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Event']) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value: key === 'window' ? dom.window : dom.window[key],
      configurable: true,
      writable: true,
    });
  }
  originals.set(
    'IS_REACT_ACT_ENVIRONMENT',
    Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  );
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, ws: false },
    appType: 'custom',
  });
  let root;
  try {
    const { createRoot } = await import('react-dom/client');
    const { SubscriptionForm, DetailModal } = await vite.ssrLoadModule('/src/forms.jsx');
    const { makeDemo, demoUser } = await vite.ssrLoadModule('/src/demo.js');
    const data = makeDemo();
    const sub = {
      ...data.subscriptions[0],
      name: 'Example Company',
      amount: null,
      cycle: 'yearly',
      companyDetails: {
        companyType: 'Limited Liability Company (LLC)',
        formationPlan: 'Business formation',
        country: 'United States',
        state: 'New York',
        formationDate: '2024-06-04',
        transactionId: 'TEST-COMPANY',
        owners: [
          {
            name: 'Example Owner',
            role: 'Owner',
            ownership: 100,
            email: 'owner@example.com',
            address: '',
            country: '',
          },
        ],
      },
    };
    data.subscriptions = [sub];
    let saved;
    root = createRoot(document.getElementById('root'));
    const props = {
      sub,
      data,
      user: demoUser,
      onClose() {},
      onSave(value) {
        saved = value;
      },
    };
    await act(async () => root.render(React.createElement(SubscriptionForm, props)));
    const field = (label) =>
      [...document.querySelectorAll('label.field')]
        .find((item) => item.firstElementChild.textContent.startsWith(label))
        .querySelector('input');
    assert.equal(field('Amount per billing cycle').disabled, true);
    assert.equal(field('Amount per billing cycle').value, '');
    assert.equal(field('Formation date').value, '2024-06-04');
    await act(async () => {
      const input = field('Next payment date');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        input,
        '2028-06-01'
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      document
        .querySelector('form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    );
    assert.equal(saved.amount, null);
    assert.equal(saved.nextBillingDate, '2028-06-01');
    assert.deepEqual(saved.companyDetails, sub.companyDetails);
    await act(async () =>
      root.render(
        React.createElement(DetailModal, { ...props, sub: { ...sub, ...saved }, onEdit() {} })
      )
    );
    const text = document.body.textContent;
    for (const value of [
      'Company Details',
      'New York',
      'TEST-COMPANY',
      'Example Owner',
      '100%',
      'owner@example.com',
      'Amount not provided',
      'Update renewal',
    ])
      assert.ok(text.includes(value), `Missing ${value}`);
    assert.ok(!text.includes('Mark paid'));
    const updatedSub = { ...sub, amount: 99 };
    await act(async () =>
      root.render(React.createElement(SubscriptionForm, { ...props, sub: updatedSub }))
    );
    assert.equal(field('Amount per billing cycle').disabled, false);
    assert.equal(field('Amount per billing cycle').value, '99');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
