import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';

test('saving a company name updates the sidebar initials, company profile and browser title', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost:5173/#settings',
    pretendToBeVisual: true,
  });
  const originals = new Map();
  const install = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  };
  for (const key of [
    'window',
    'document',
    'HTMLElement',
    'Event',
    'location',
    'history',
    'localStorage',
    'navigator',
    'innerWidth',
    'innerHeight',
  ])
    install(key, key === 'window' ? dom.window : dom.window[key]);
  install('addEventListener', dom.window.addEventListener.bind(dom.window));
  install('removeEventListener', dom.window.removeEventListener.bind(dom.window));
  install('IS_REACT_ACT_ENVIRONMENT', true);
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, ws: false },
    appType: 'custom',
  });
  let root;
  try {
    const { createRoot } = await import('react-dom/client');
    const { makeDemo, demoUser } = await vite.ssrLoadModule('/src/demo.js');
    const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
    const workspace = makeDemo();
    workspace.company.name = 'Global Oparation';
    let user = { ...demoUser, name: workspace.company.name, companyAccount: true };
    install('fetch', async (url, options = {}) => {
      let body;
      if (url === '/api/auth/status')
        body = { setupRequired: false, companyName: workspace.company.name };
      else if (url === '/api/auth/me') body = { user };
      else if (url === '/api/workspace') body = workspace;
      else if (url === '/api/company' && options.method === 'PUT') {
        Object.assign(workspace.company, JSON.parse(options.body));
        user = { ...user, name: workspace.company.name };
        body = { company: workspace.company, user };
      } else throw new Error(`Unexpected test request: ${url}`);
      return { ok: true, status: 200, json: async () => structuredClone(body) };
    });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(App)));
    assert.match(document.querySelector('.profile-button').textContent, /Global Oparation/);
    assert.equal(document.querySelector('.company-avatar').textContent, 'GO');
    assert.equal(document.title, 'Subtrack · Global Oparation');
    const input = [...document.querySelectorAll('label.field')]
      .find((label) => label.firstElementChild.textContent.startsWith('Company name'))
      .querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        input,
        'Future Company'
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    );
    assert.match(document.querySelector('.workspace-switch').textContent, /Future Company/);
    assert.match(document.querySelector('.profile-button').textContent, /Future Company/);
    assert.equal(document.querySelector('.company-avatar').textContent, 'FC');
    assert.equal(document.title, 'Subtrack · Future Company');
    assert.ok(!document.querySelector('.profile-button').textContent.includes('Complaiance'));
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
