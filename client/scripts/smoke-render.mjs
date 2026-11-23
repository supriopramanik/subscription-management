import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';

// Render real screens to catch component/runtime errors. This is not a visual browser test.
const vite = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const pages = await vite.ssrLoadModule('/src/pages.jsx');
  const forms = await vite.ssrLoadModule('/src/forms.jsx');
  const { SubscriptionCard, ServiceIcon } = await vite.ssrLoadModule('/src/components.jsx');
  const { makeDemo, demoUser } = await vite.ssrLoadModule('/src/demo.js');
  const data = makeDemo(),
    noop = () => {};
  const grok = {
    ...data.subscriptions[0],
    name: 'Grok',
    vendor: 'X Premium',
    website: 'https://grok.com',
    logo: '',
  };
  const regularGrok = renderToString(
    React.createElement(SubscriptionCard, {
      sub: grok,
      now: '2026-11-23',
      onOpen: noop,
      onPay: noop,
    })
  );
  assert.ok(regularGrok.includes('src="/site-icons/grok.com.png"'));
  assert.ok(!regularGrok.includes('src="/site-icons/x.com.png"'));
  const tvGrok = renderToString(
    React.createElement(SubscriptionCard, {
      sub: grok,
      now: '2026-11-23',
      onOpen: noop,
      onPay: noop,
      displayCard: true,
    })
  );
  assert.ok(tvGrok.includes('src="/site-icons/grok.com.png"'));
  assert.ok(tvGrok.includes('src="/site-icons/x.com.png"'));
  assert.ok(tvGrok.includes('alt="X source logo"'));
  console.log('Grok keeps its service icon while the TV provider icon shows X.');
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
  const tvMarkup = renderToString(React.createElement(pages.Overview, { ...props, tv: true }));
  const liveCount = data.subscriptions.filter((s) => ['active', 'trial'].includes(s.status)).length;
  assert.equal((tvMarkup.match(/class="subscription-card /g) || []).length, liveCount);
  assert.ok(tvMarkup.includes('subscription-scroll-viewport'));
  assert.equal(tvMarkup.includes('Scroll down'), liveCount > 12);
  assert.equal(tvMarkup.includes('Scroll up'), liveCount > 12);
  const overflowMarkup = renderToString(
    React.createElement(pages.Overview, {
      ...props,
      tv: true,
      data: {
        ...data,
        subscriptions: Array.from({ length: 13 }, (_, i) => ({
          ...data.subscriptions[i % data.subscriptions.length],
          id: `tv-${i}`,
          status: 'active',
        })),
      },
    })
  );
  assert.ok(overflowMarkup.includes('Scroll down'));
  assert.ok(overflowMarkup.includes('Scroll up'));
  assert.ok(!tvMarkup.includes('forecast-panel'));
  assert.ok(!tvMarkup.includes('category-panel'));
  assert.ok(!tvMarkup.includes('Billed in USD'));
  assert.ok(!tvMarkup.includes('Monthly commitment'));
  assert.ok(!tvMarkup.includes('Paid this month'));
  assert.ok(tvMarkup.includes('Overdue renewals'));
  assert.ok(tvMarkup.includes('Renewing in 30 days'));
  assert.ok(tvMarkup.includes('Renewal date'));
  assert.ok(!/\$|BDT|AED/.test(tvMarkup), 'TV overview must not expose monetary amounts');
  const tvStatusData = {
    ...data,
    subscriptions: ['active', 'paused', 'cancelled'].map((status) => ({
      ...data.subscriptions[0],
      id: `tv-status-${status}`,
      name: `TV ${status} service`,
      status,
      nextBillingDate: '2020-01-01',
    })),
  };
  const filteredTv = renderToString(
    React.createElement(pages.Overview, { ...props, data: tvStatusData, tv: true })
  );
  assert.ok(
    filteredTv.includes('TV active service'),
    'Active overdue services must remain visible'
  );
  assert.ok(!filteredTv.includes('TV paused service'));
  assert.ok(!filteredTv.includes('TV cancelled service'));
  assert.ok(
    !filteredTv.includes('tv-service-emblem live'),
    'Main icons must not have a green status dot'
  );
  const standardStatus = renderToString(
    React.createElement(pages.Overview, { ...props, data: tvStatusData })
  );
  assert.ok(standardStatus.includes('TV paused service'));
  assert.ok(standardStatus.includes('TV cancelled service'));
  const renderIcon = (sub) => renderToString(React.createElement(ServiceIcon, { sub }));
  assert.ok(
    renderIcon({ name: 'Google One', website: 'google.com' }).includes(
      '/api/service-icon?domain=google.com'
    )
  );
  assert.ok(
    renderIcon({ name: 'Hosted domain', website: 'https://gadgethub.bd' }).includes(
      '/site-icons/gadgethub.bd.png'
    )
  );
  assert.ok(
    renderIcon({ name: 'ChatGPT Plus', website: 'https://chatgpt.com' }).includes(
      '/providers/openai.png'
    )
  );
  const customIcon = renderIcon({
    name: 'Google One',
    website: 'google.com',
    logo: 'data:image/png;base64,AAAA',
  });
  assert.ok(customIcon.includes('data:image/png;base64,AAAA'));
  assert.ok(!customIcon.includes('/api/service-icon'));
  assert.ok(renderIcon({ name: 'My offline tool' }).includes('<span>MY</span>'));
  for (const [vendor, label, file] of [
    ['Hostinger - Business Web Hosting', 'Hostinger', 'hostinger.ico'],
    ['Namecheap - .COM Domain', 'Namecheap', 'namecheap.png'],
    ['OpenAI – ChatGPT Plus', 'OpenAI', 'openai.png'],
    ['Tasjeel.ae - .AE Domain', 'Tasjeel.ae', 'tasjeel.png'],
    ['BTCL - .BD Domain', 'BTCL', 'btcl-mark.png'],
    ['Limda Host - Hosting', 'Limda Host', 'limda.ico'],
  ]) {
    const card = renderToString(
      React.createElement(SubscriptionCard, {
        sub: {
          ...data.subscriptions[0],
          name: 'unrelated-domain.example',
          website: 'https://unrelated-domain.example',
          vendor,
        },
        now: '2026-11-17',
        onOpen: noop,
        displayCard: true,
      })
    );
    assert.ok(
      card.includes(`alt="${label} source logo"`),
      `${vendor} must show its billing provider logo`
    );
    assert.ok(card.includes(`/providers/${file}`));
    assert.ok(card.includes('tv-service-emblem'), 'Original service icon must remain');
    await access(new URL(`../public/providers/${file}`, import.meta.url));
  }
  const overviewMarkup = renderToString(React.createElement(pages.Overview, props));
  assert.ok(overviewMarkup.includes('forecast-panel'));
  assert.ok(overviewMarkup.includes('category-panel'));
  assert.ok(overviewMarkup.replaceAll('<!-- -->', '').includes('Billed in USD'));
  console.log('TV overview renders every subscription in a manually scrollable region.');
  const empty = { ...data, subscriptions: [], payments: [], paidThisMonth: [], activities: [] };
  for (const name of ['Overview', 'Subscriptions', 'Reports', 'CalendarPage']) {
    const markup = renderToString(React.createElement(pages[name], { ...props, data: empty }));
    assert.ok(!markup.includes('NaN'), `${name} empty state contains a calculation error`);
  }
  console.log('All screens and empty-state render checks passed.');
  const domain = {
    ...data.subscriptions[0],
    id: 'bundle-domain',
    bundleId: 'bundle-domain',
    name: 'example.com',
    vendor: 'Limda Host - Domain',
    amount: 1857,
    currency: 'BDT',
    cycle: 'yearly',
    nextBillingDate: '2027-07-18',
  };
  const hosting = {
    ...domain,
    id: 'bundle-hosting',
    name: 'Hosting - example.com',
    vendor: 'Limda Host - Hosting',
    amount: 1800,
    nextBillingDate: '2027-08-25',
  };
  const bundleData = { ...data, subscriptions: [domain, hosting] };
  for (const screen of ['Overview', 'Subscriptions']) {
    const markup = renderToString(
      React.createElement(pages[screen], { ...props, data: bundleData })
    );
    assert.equal(
      (markup.match(/class="subscription-card /g) || []).length,
      1,
      `${screen} must show one bundled card`
    );
    assert.ok(markup.includes('3,657'));
  }
  for (const selected of [domain, hosting]) {
    const markup = renderToString(
      React.createElement(forms.DetailModal, { ...props, data: bundleData, sub: selected })
    );
    assert.ok(markup.includes('Included plans'));
    assert.ok(markup.includes('1,857'));
    assert.ok(markup.includes('1,800'));
    assert.ok(markup.includes('18 Jul 2027'));
    assert.ok(markup.includes('25 Aug 2027'));
  }
  console.log('Bundled plans render one card and retain both plan prices and renewal dates.');
  const hostingWithServices = {
    ...domain,
    bundleId: '',
    name: 'Business Hosting',
    amount: 203.88,
    currency: 'USD',
    includedServices: [
      {
        name: 'included.example.com',
        kind: 'email',
        plan: 'Free Business Email',
        quantity: '1/100',
        expiresOn: '2027-04-11',
      },
      { name: 'site.example.com', kind: 'website', plan: 'PHP/HTML', createdOn: '2026-01-01' },
      { name: 'Daily Backup', kind: 'addon', plan: 'Included free' },
    ],
  };
  const includedData = { ...data, subscriptions: [hostingWithServices] };
  const includedMarkup = renderToString(
    React.createElement(pages.Subscriptions, {
      ...props,
      data: includedData,
      search: 'included.example.com',
    })
  );
  assert.equal((includedMarkup.match(/class="subscription-card /g) || []).length, 1);
  const includedDetail = renderToString(
    React.createElement(forms.DetailModal, {
      ...props,
      data: includedData,
      sub: hostingWithServices,
    })
  );
  assert.ok(includedDetail.includes('Included in this plan'));
  assert.ok(includedDetail.includes('Free Business Email'));
  assert.ok(includedDetail.includes('Daily Backup'));
  const tvDetail = renderToString(
    React.createElement(forms.DetailModal, {
      ...props,
      data: includedData,
      sub: { ...hostingWithServices, description: 'Price: $203.88' },
      hideAmounts: true,
    })
  );
  assert.ok(!tvDetail.includes('$203.88'));
  assert.ok(!tvDetail.includes('detail-price'));
  assert.ok(!tvDetail.includes('Mark paid'));
  assert.ok(!tvDetail.includes('Edit details'));
  console.log(
    'Included email, websites and extras remain searchable under one billed subscription.'
  );
} finally {
  await vite.close();
}
