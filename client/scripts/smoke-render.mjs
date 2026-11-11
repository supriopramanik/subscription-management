import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Render real screens to catch component/runtime errors. This is not a visual browser test.
const vite = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const pages = await vite.ssrLoadModule('/src/pages.jsx');
  const forms = await vite.ssrLoadModule('/src/forms.jsx');
  const { makeDemo, demoUser } = await vite.ssrLoadModule('/src/demo.js');
  const data = makeDemo(),
    noop = () => {};
  const props = {
    data,
    user: demoUser,
    demo: true,
    company: data.company,
    users: data.people,
    search: '',
    onSearch: noop,
    onOpen: noop,
    onPay: noop,
    onAdd: noop,
    navigate: noop,
    onEdit: noop,
    onSave: noop,
    onClose: noop,
  };
  const screens = [
    'Overview',
    'Subscriptions',
    'CalendarPage',
    'Reports',
    'Team',
    'ActivityPage',
    'Settings',
  ];
  for (const name of screens) {
    const markup = renderToString(React.createElement(pages[name], props));
    assert.ok(markup.length > 500, `${name} did not render`);
    assert.ok(!markup.includes('NaN'), `${name} contains a calculation error`);
    console.log(`Rendered ${name}`);
  }
  for (const name of [
    'AuthScreen',
    'SubscriptionForm',
    'PaymentForm',
    'DetailModal',
    'EmployeeForm',
    'PasswordForm',
    'EmailForm',
  ]) {
    const markup = renderToString(
      React.createElement(forms[name], {
        ...props,
        ...(name === 'PaymentForm' || name === 'DetailModal' ? { sub: data.subscriptions[0] } : {}),
        onDemo: noop,
        onRetry: noop,
        onSuccess: noop,
      })
    );
    assert.ok(markup.length > 500, `${name} did not render`);
    console.log(`Rendered ${name}`);
  }
  // The empty real workspace must also render without missing demo-only fields.
  const empty = { ...data, subscriptions: [], payments: [], paidThisMonth: [], activities: [] };
  for (const name of ['Overview', 'Subscriptions', 'Reports', 'CalendarPage']) {
    const markup = renderToString(React.createElement(pages[name], { ...props, data: empty }));
    assert.ok(!markup.includes('NaN'), `${name} empty state contains a calculation error`);
  }
  console.log('All screens and empty-state render checks passed.');
} finally {
  await vite.close();
}
