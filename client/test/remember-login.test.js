import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';

test('Remember me restores the email after sign-out, clears on opt-out and never saves passwords', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost:5173/',
  });
  const originals = new Map();
  const install = (key, value) => {
    if (!originals.has(key)) originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  };
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'localStorage'])
    install(key, key === 'window' ? dom.window : dom.window[key]);
  install('IS_REACT_ACT_ENVIRONMENT', true);
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, ws: false },
    appType: 'custom',
  });
  let root;
  try {
    const { createRoot } = await import('react-dom/client');
    const { AuthScreen } = await vite.ssrLoadModule('/src/forms.jsx');
    const { readRememberedLogin } = await vite.ssrLoadModule('/src/remember-login.js');
    let successCount = 0;
    const props = { onSuccess: () => successCount++, onDemo() {}, onRetry() {} };
    const render = async () => {
      root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(AuthScreen, props)));
    };
    const returnToLogin = async () => {
      await act(async () => root.unmount());
      await render();
    };
    const input = (name) => document.querySelector(`input[name="${name}"]`);
    const fill = async (name, value) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
          input(name),
          value
        );
        input(name).dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    install('fetch', async (url, options) => {
      assert.equal(url, '/api/auth/login');
      assert.equal(JSON.parse(options.body).password, 'Test-password-2026');
      return { ok: true, status: 200, json: async () => ({ user: { id: 'admin' } }) };
    });
    const submit = async () =>
      act(async () => {
        document
          .querySelector('form')
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    await render();
    assert.equal(input('rememberMe').checked, true);
    await fill('email', 'admin@example.com');
    await fill('password', 'Test-password-2026');
    await submit();
    assert.equal(successCount, 1);
    assert.deepEqual(JSON.parse(localStorage.getItem('subtrack.remember-login')), {
      enabled: true,
      email: 'admin@example.com',
    });
    await returnToLogin();
    assert.equal(input('email').value, 'admin@example.com');
    assert.equal(input('rememberMe').checked, true);
    assert.equal(input('password').value, '');
    assert.equal(input('password').autocomplete, 'current-password');
    await act(async () => input('rememberMe').click());
    await returnToLogin();
    assert.equal(input('rememberMe').checked, false);
    assert.equal(input('email').value, '');
    await fill('email', 'other@example.com');
    await fill('password', 'Test-password-2026');
    await submit();
    assert.equal(successCount, 2);
    await returnToLogin();
    assert.equal(input('email').value, '');
    assert.equal(input('rememberMe').checked, false);
    localStorage.setItem('subtrack.remember-login', '{invalid');
    assert.deepEqual(readRememberedLogin(), { enabled: true, email: '' });
    install('localStorage', {
      getItem() {
        throw new Error('Blocked');
      },
      setItem() {
        throw new Error('Blocked');
      },
    });
    await returnToLogin();
    await fill('email', 'admin@example.com');
    await fill('password', 'Test-password-2026');
    await submit();
    assert.equal(successCount, 3, 'Storage restrictions must not block sign-in');
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
