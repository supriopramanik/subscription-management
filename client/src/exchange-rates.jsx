import React, { useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button, ErrorNote, Field } from './components';
import { CURRENCIES, rebaseRates } from './lib';

export function rateTime(value, timezone = 'Asia/Dhaka') {
  if (!value || Number.isNaN(Date.parse(value))) return 'Waiting for first sync';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
export function RateAttribution() {
  return (
    <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">
      Rates by Exchange Rate API
    </a>
  );
}
export function AutomaticRates({ company, baseCurrency, onRefresh }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const fx = company.exchangeRates;
  const rates = rebaseRates(company.rates, baseCurrency);
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      await onRefresh?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-fields automatic-rates">
      <div className="fx-panel-heading">
        <div>
          <span className={`fx-state-badge ${fx?.status || 'unavailable'}`}>
            <i />
            {{
              current: 'Automatic sync active',
              cached: 'Using last saved rates',
              stale: 'Saved rates are out of date',
              unavailable: 'Waiting for rates',
              demo: 'Demo rates only',
            }[fx?.status] || 'Waiting for rates'}
          </span>
          <p>Reference rates update automatically. No manual entry or API key needed.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={RefreshCw}
          busy={busy}
          disabled={!onRefresh || fx?.status === 'demo'}
          onClick={refresh}
        >
          Check latest
        </Button>
      </div>
      <ErrorNote error={error} />
      {fx?.lastError && (
        <div className="info-note fx-warning">
          <AlertCircle size={16} />
          <span>
            {fx.lastError}{' '}
            {fx.asOf
              ? 'Dashboard totals use the last successfully saved rates.'
              : 'Foreign-currency totals remain excluded until a successful sync.'}
          </span>
        </div>
      )}
      {fx?.status === 'stale' && !fx.lastError && (
        <div className="info-note fx-warning">
          These reference rates are older than 36 hours. Using the last saved rates while automatic
          checks continue.
        </div>
      )}
      <dl className="fx-metadata">
        <div>
          <dt>Provider rate timestamp</dt>
          <dd>{rateTime(fx?.asOf, company.timezone)}</dd>
        </div>
        <div>
          <dt>Last server check</dt>
          <dd>{fx?.checkedAt ? rateTime(fx.checkedAt, company.timezone) : 'Not checked yet'}</dd>
        </div>
        <div>
          <dt>Next automatic check</dt>
          <dd>
            {fx?.nextCheckAt ? rateTime(fx.nextCheckAt, company.timezone) : 'On server startup'}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <RateAttribution />
          </dd>
        </div>
      </dl>
      <div className="info-note">
        1 unit of the purchase currency = this many {baseCurrency}. The server checks hourly; the
        free source publishes new reference rates daily. Actual bank or card rates may differ.
      </div>
      <div className="rates-grid">
        {CURRENCIES.filter((c) => c !== baseCurrency).map((c) => (
          <Field key={c} label={`1 ${c} → ${baseCurrency}`}>
            <input
              type="text"
              readOnly
              aria-label={`Automatic ${c} to ${baseCurrency} exchange rate`}
              value={
                rates[c]
                  ? new Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(rates[c])
                  : ''
              }
              placeholder="Awaiting automatic sync"
            />
          </Field>
        ))}
      </div>
    </div>
  );
}
