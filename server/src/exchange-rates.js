import { ExchangeRate } from './models.js';
import { currencies } from './domain.js';

export const FX_SOURCE = 'https://www.exchangerate-api.com';
export const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
export const FX_CHECK_INTERVAL = 60 * 60 * 1000;
const RETRY_INTERVAL = 5 * 60 * 1000;
const LOCK_INTERVAL = 30 * 1000;
const STALE_AFTER = 36 * 60 * 60 * 1000;

export function parseRateResponse(payload, now = new Date()) {
  if (payload?.result !== 'success' || payload.base_code !== 'USD')
    throw new Error('Invalid exchange-rate response');
  const asOf = new Date(payload.time_last_update_unix * 1000);
  const providerNextUpdateAt = new Date(payload.time_next_update_unix * 1000);
  if (
    !Number.isFinite(asOf.getTime()) ||
    asOf > new Date(now.getTime() + 5 * 60 * 1000) ||
    now - asOf > 7 * 24 * 60 * 60 * 1000 ||
    !Number.isFinite(providerNextUpdateAt.getTime()) ||
    providerNextUpdateAt <= asOf ||
    providerNextUpdateAt - asOf > 3 * 24 * 60 * 60 * 1000
  )
    throw new Error('Invalid exchange-rate timestamps');
  const usdRates = {};
  for (const currency of currencies) {
    const value = payload.rates?.[currency];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1e7)
      throw new Error(`Invalid exchange rate for ${currency}`);
    usdRates[currency] = value;
  }
  if (usdRates.USD !== 1) throw new Error('Invalid USD base rate');
  return { usdRates, asOf, providerNextUpdateAt };
}

export function reportingRates(usdRates, baseCurrency) {
  if (!currencies.includes(baseCurrency)) throw new Error('Unsupported reporting currency');
  const base = usdRates?.[baseCurrency];
  if (!Number.isFinite(base) || base <= 0) return { [baseCurrency]: 1 };
  return Object.fromEntries(
    currencies
      .filter((c) => Number.isFinite(usdRates[c]) && usdRates[c] > 0)
      .map((c) => [c, c === baseCurrency ? 1 : Number((base / usdRates[c]).toPrecision(12))])
  );
}

export function rateView(snapshot, baseCurrency, now = new Date()) {
  const hasRates = Boolean(snapshot?.usdRates?.USD && snapshot?.asOf);
  const stale = hasRates && now - new Date(snapshot.asOf) > STALE_AFTER;
  return {
    rates: reportingRates(snapshot?.usdRates, baseCurrency),
    exchangeRates: {
      mode: 'automatic',
      provider: 'ExchangeRate-API',
      sourceUrl: FX_SOURCE,
      status: !hasRates
        ? 'unavailable'
        : stale
          ? 'stale'
          : snapshot.lastError
            ? 'cached'
            : 'current',
      asOf: snapshot?.asOf || null,
      fetchedAt: snapshot?.fetchedAt || null,
      checkedAt: snapshot?.checkedAt || null,
      nextCheckAt: snapshot?.nextCheckAt || null,
      providerNextUpdateAt: snapshot?.providerNextUpdateAt || null,
      lastError: snapshot?.lastError || null,
    },
  };
}

export function createExchangeRateService({
  model = ExchangeRate,
  fetcher = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  let pending = null;
  async function synchronize() {
    const at = now();
    const existing = await model.findById('USD').select('nextCheckAt lockUntil').lean();
    if (existing && (existing.nextCheckAt > at || existing.lockUntil > at)) return;
    // A singleton cache plus atomic lease coordinates refreshes across API replicas.
    try {
      await model.updateOne({ _id: 'USD' }, { $setOnInsert: { _id: 'USD' } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const locked = await model
      .findOneAndUpdate(
        {
          _id: 'USD',
          $and: [
            {
              $or: [
                { nextCheckAt: { $exists: false } },
                { nextCheckAt: null },
                { nextCheckAt: { $lte: at } },
              ],
            },
            {
              $or: [
                { lockUntil: { $exists: false } },
                { lockUntil: null },
                { lockUntil: { $lte: at } },
              ],
            },
          ],
        },
        { $set: { lockUntil: new Date(at.getTime() + LOCK_INTERVAL) } },
        { returnDocument: 'after' }
      )
      .lean();
    if (!locked) return;
    try {
      const response = await fetcher(FX_ENDPOINT, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json' },
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Exchange-rate provider is unavailable');
      const parsed = parseRateResponse(await response.json(), at);
      if (locked.asOf && parsed.asOf < new Date(locked.asOf))
        throw new Error('Exchange-rate response is older than the saved rates');
      await model.updateOne(
        { _id: 'USD', lockUntil: locked.lockUntil },
        {
          $set: {
            ...parsed,
            fetchedAt: at,
            checkedAt: at,
            nextCheckAt: new Date(at.getTime() + FX_CHECK_INTERVAL),
            lastError: null,
            lockUntil: null,
          },
        }
      );
    } catch {
      // Keep the last successful rates. Never replace them with zeros or a guessed rate.
      await model.updateOne(
        { _id: 'USD', lockUntil: locked.lockUntil },
        {
          $set: {
            checkedAt: at,
            nextCheckAt: new Date(at.getTime() + RETRY_INTERVAL),
            lockUntil: null,
            lastError: 'Could not fetch the latest rates. Retrying automatically in 5 minutes.',
          },
        }
      );
    }
  }
  function sync() {
    if (!pending)
      pending = synchronize().finally(() => {
        pending = null;
      });
    return pending;
  }
  async function read(baseCurrency) {
    await sync();
    const snapshot = await model.findById('USD').lean();
    return rateView(snapshot, baseCurrency, now());
  }
  function start() {
    const run = () =>
      sync().catch(() =>
        console.error('Exchange-rate refresh could not access its database cache.')
      );
    run();
    const timer = setInterval(run, 60000);
    timer.unref();
    return async () => {
      clearInterval(timer);
      await pending?.catch(() => {});
    };
  }
  return { read, sync, start };
}
export const exchangeRateService = createExchangeRateService();
