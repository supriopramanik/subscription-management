import assert from 'node:assert/strict';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';

// Verify the single-container web serving contract without connecting to a database.
process.env.SERVE_CLIENT = 'true';
const app = createApp();
const html = await request(app).get('/');
assert.equal(html.status, 200);
assert.match(html.text, /<title>Subtrack/);
const manifest = await readFile(new URL('../../client/dist/index.html', import.meta.url), 'utf8');
const assets = [...manifest.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((m) => m[1]);
assert.ok(assets.length >= 2, 'Built assets were not linked');
for (const asset of assets) assert.equal((await request(app).get(asset)).status, 200);
assert.equal((await request(app).get('/workspace/preview')).status, 200, 'SPA fallback failed');
assert.equal(
  (await request(app).get('/api/workspace')).status,
  401,
  'Static fallback exposed an API route'
);
assert.match(html.headers['content-security-policy'], /https:\/\/res.cloudinary.com/);
assert.match(html.headers['content-security-policy'], /https:\/\/fonts.googleapis.com/);
console.log(
  'Production web serving, SPA fallback, asset delivery, API isolation and CSP checks passed.'
);
