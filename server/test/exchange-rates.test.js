import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ExchangeRate } from '../src/models.js';
import {
  createExchangeRateService,
  parseRateResponse,
  reportingRates,
  rateView,
  FX_CHECK_INTERVAL,
  FX_ENDPOINT,
} from '../src/exchange-rates.js';

const initialTime = new Date('2026-11-11T06:00:00Z');
const quotes = {
  USD: 1,
  BDT: 125,
  EUR: 0.9,
  GBP: 0.75,
  INR: 90,
  AED: 3.67,
  SGD: 1.3,
  CAD: 1.4,
  AUD: 1.5,
};
const payload = (at = initialTime) => ({
  result: 'success',
  base_code: 'USD',
  time_last_update_unix: Math.floor((at.getTime() - 3600000) / 1000),
  time_next_update_unix: Math.floor((at.getTime() + 82800000) / 1000),
  rates: { ...quotes },
});
let replica;
before(
  async () => {
    replica = await MongoMemoryReplSet.create({
      binary: { version: '8.0.17' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(replica.getUri(), { dbName: 'subtrack_disposable_fx_test' });
    await ExchangeRate.init();
  },
  { timeout: 240000 }
);
beforeEach(async () => {
  await ExchangeRate.deleteMany({});
});
after(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});

test('online USD quotes convert to purchase-currency to reporting-currency rates', () => {
  const parsed = parseRateResponse(payload(), initialTime);
  const bdt = reportingRates(parsed.usdRates, 'BDT');
  assert.equal(bdt.BDT, 1);
  assert.equal(bdt.USD, 125);
  assert.ok(Math.abs(bdt.EUR - 125 / 0.9) < 1e-8);
  const usd = reportingRates(parsed.usdRates, 'USD');
  assert.equal(usd.USD, 1);
  assert.equal(usd.BDT, 0.008);
});
test('bad, incomplete, inverted-base and implausibly dated responses are rejected', () => {
  for (const invalid of [
    { ...payload(), result: 'error' },
    { ...payload(), base_code: 'BDT' },
    { ...payload(), rates: { ...quotes, BDT: 0 } },
    { ...payload(), rates: { ...quotes, EUR: '0.9' } },
    { ...payload(), rates: { USD: 1 } },
    { ...payload(), time_last_update_unix: 1 },
    { ...payload(), time_last_update_unix: initialTime.getTime() / 1000 + 100000 },
  ])
    assert.throws(() => parseRateResponse(invalid, initialTime));
});
test('a first successful fetch is persisted, reused for one hour and shared across services', async () => {
  let calls = 0,
    clock = new Date(initialTime);
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, FX_ENDPOINT);
    assert.ok(options.signal);
    return { ok: true, json: async () => payload(clock) };
  };
  const service = createExchangeRateService({ fetcher, now: () => new Date(clock) });
  const first = await service.read('BDT');
  assert.equal(first.rates.USD, 125);
  assert.equal(first.exchangeRates.status, 'current');
  assert.equal(calls, 1);
  await service.read('USD');
  await service.sync();
  const afterRestart = createExchangeRateService({ fetcher, now: () => new Date(clock) });
  await afterRestart.read('BDT');
  assert.equal(calls, 1);
  clock = new Date(clock.getTime() + FX_CHECK_INTERVAL + 1);
  await afterRestart.read('BDT');
  assert.equal(calls, 2);
  assert.equal(await ExchangeRate.countDocuments(), 1);
});
test('simultaneous requests across independent API instances make one source request', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return { ok: true, json: async () => payload() };
  };
  const a = createExchangeRateService({ fetcher, now: () => initialTime });
  const b = createExchangeRateService({ fetcher, now: () => initialTime });
  await Promise.all([a.sync(), a.sync(), b.sync(), b.sync()]);
  assert.equal(calls, 1);
  assert.equal((await b.read('BDT')).rates.USD, 125);
});
test('network failures preserve the last successful snapshot and schedule a short retry', async () => {
  let clock = new Date(initialTime),
    unavailable = false,
    calls = 0;
  const service = createExchangeRateService({
    now: () => new Date(clock),
    fetcher: async () => {
      calls++;
      if (unavailable) throw new Error('Offline');
      return { ok: true, json: async () => payload(clock) };
    },
  });
  const first = await service.read('BDT');
  unavailable = true;
  clock = new Date(clock.getTime() + FX_CHECK_INTERVAL + 1);
  const offline = await service.read('BDT');
  assert.equal(offline.rates.USD, first.rates.USD);
  assert.equal(offline.exchangeRates.status, 'cached');
  assert.equal(
    new Date(offline.exchangeRates.asOf).getTime(),
    new Date(first.exchangeRates.asOf).getTime()
  );
  assert.equal(new Date(offline.exchangeRates.nextCheckAt) - clock, 300000);
  await service.read('BDT');
  assert.equal(calls, 2);
  unavailable = false;
  clock = new Date(clock.getTime() + 300001);
  assert.equal((await service.read('BDT')).exchangeRates.status, 'current');
});
test('first-fetch failure leaves foreign currencies unknown and never invents rates', async () => {
  const service = createExchangeRateService({
    now: () => initialTime,
    fetcher: async () => {
      throw new Error('Offline');
    },
  });
  const result = await service.read('BDT');
  assert.deepEqual(result.rates, { BDT: 1 });
  assert.equal(result.exchangeRates.status, 'unavailable');
  assert.ok(result.exchangeRates.lastError);
});
test('an invalid source response cannot corrupt saved rates', async () => {
  let clock = new Date(initialTime),
    corrupt = false;
  const service = createExchangeRateService({
    now: () => clock,
    fetcher: async () => ({
      ok: true,
      json: async () => (corrupt ? { ...payload(clock), rates: { USD: 1 } } : payload(clock)),
    }),
  });
  await service.read('BDT');
  corrupt = true;
  clock = new Date(clock.getTime() + FX_CHECK_INTERVAL + 1);
  const result = await service.read('BDT');
  assert.equal(result.rates.USD, 125);
  assert.equal(result.exchangeRates.status, 'cached');
});
test('old cached rates are flagged instead of being labelled current', () => {
  const result = rateView(
    { usdRates: quotes, asOf: new Date('2026-11-09T00:00:00Z') },
    'BDT',
    initialTime
  );
  assert.equal(result.exchangeRates.status, 'stale');
  assert.equal(result.rates.USD, 125);
});
