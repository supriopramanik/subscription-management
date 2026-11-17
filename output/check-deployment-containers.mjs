import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomUUID } from 'node:crypto';

const prefix = `subtrack-check-${randomUUID().slice(0, 8)}`;
const network = `${prefix}-network`;
const containers = [];
let mongo;
let networkCreated = false;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function start(name, image, extra = []) {
  docker('run', '-d', '--name', name, '--network', network, '--health-interval=2s', '--health-start-period=2s', ...extra, image);
  containers.push(name);
}
async function healthy(name) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const state = JSON.parse(docker('inspect', '--format', '{{json .State}}', name));
    if (state.Health?.Status === 'healthy') return;
    if (state.Status === 'exited' || state.Health?.Status === 'unhealthy') {
      throw new Error(`${name}: ${state.Status}; ${docker('logs', '--tail', '20', name)}`);
    }
    await delay(1500);
  }
  throw new Error(`${name}: did not become healthy`);
}
try {
  // Disposable local replica set only. This script never reads .env or production credentials.
  mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.17' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = `${mongo.getUri('container_deployment_check', 'host.docker.internal')}&directConnection=true`;
  docker('network', 'create', network);
  networkCreated = true;
  const api = `${prefix}-api`, web = `${prefix}-web`, combined = `${prefix}-combined`;
  const env = ['-e', `MONGODB_URI=${uri}`, '-e', 'APP_ORIGIN=https://deployment-check.example', '-e', 'TRUST_PROXY=1'];
  start(api, 'subtrack-server:deploy-fix', ['--network-alias', 'server', ...env]);
  start(combined, 'subtrack-combined:deploy-fix', env);
  await Promise.all([healthy(api), healthy(combined)]);
  start(web, 'subtrack-client:deploy-fix');
  await healthy(web);
  assert.equal(JSON.parse(docker('exec', web, 'wget', '-q', '-O', '-', 'http://127.0.0.1:8080/api/health')).status, 'ok');
  const html = docker('exec', web, 'wget', '-q', '-O', '-', 'http://127.0.0.1:8080/');
  assert.match(html, /Subtrack/);
  for (const asset of ['/providers/btcl-mark.png', '/site-icons/gadgethub.bd.png']) {
    docker('exec', web, 'wget', '-q', '-O', '/dev/null', `http://127.0.0.1:8080${asset}`);
  }
  docker('exec', combined, 'node', '-e', "fetch('http://127.0.0.1:4000/').then(async r=>{if(!r.ok || !(await r.text()).includes('Subtrack'))process.exit(1)})");
  console.log(JSON.stringify({ serverContainer: 'healthy', clientContainer: 'healthy', combinedContainer: 'healthy', nginxApiProxy: 'passed', logoAssets: 'passed', database: 'disposable local replica set only' }));
} finally {
  for (const name of containers.reverse()) { try { docker('rm', '-f', name); } catch {} }
  if (networkCreated) { try { docker('network', 'rm', network); } catch {} }
  if (mongo) await mongo.stop();
}
