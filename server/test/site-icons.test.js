import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteIcons } from '../src/site-icons.js';
import { publicDomain, domainForService, websiteForSave } from '../../shared/site-icons.mjs';

test('domain discovery uses the website, recognizes names and rejects private addresses', () => {
  assert.equal(websiteForSave('google.com'), 'https://google.com');
  assert.equal(domainForService({ name: 'Google One' }), 'google.com');
  assert.equal(domainForService({ name: 'gadgethub.bd - Domain' }), 'gadgethub.bd');
  assert.equal(
    domainForService({ name: 'Wrong name', website: 'https://www.google.com/products?a=b' }),
    'www.google.com'
  );
  for (const domain of [
    'localhost',
    '127.0.0.1',
    '[::1]',
    'router.local',
    'foo.internal',
    'https://user:secret@google.com',
    'javascript:alert(1)',
    'not a domain',
  ])
    assert.equal(publicDomain(domain), '');
});

test('favicon lookup contacts only its fixed service, shares requests and caches missing icons', async () => {
  const calls = [];
  const icons = createSiteIcons({
    fetchImpl: async (url) => {
      calls.push(url);
      return url.includes('missing.com')
        ? new Response('', { status: 404 })
        : new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'content-type': 'image/png' },
          });
    },
  });
  const [a, b] = await Promise.all([icons('google.com'), icons('google.com')]);
  assert.deepEqual(a, b);
  assert.equal(a.bytes.length, 4);
  await icons('google.com');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/www\.google\.com\/s2\/favicons\?/);
  assert.equal(await icons('missing.com'), null);
  assert.equal(await icons('missing.com'), null);
  assert.equal(calls.length, 2);
  assert.equal(await icons('127.0.0.1'), null);
  assert.equal(await icons('google.com&other=1'), null);
  assert.equal(calls.length, 2);
});

test('HTML responses, large icons and network failures use the initials fallback', async () => {
  for (const fetchImpl of [
    async () => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
    async () =>
      new Response(new Uint8Array(256 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
    async () => {
      throw new Error('offline');
    },
  ])
    assert.equal(await createSiteIcons({ fetchImpl })('google.com'), null);
});
