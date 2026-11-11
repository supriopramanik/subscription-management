import React, { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CreditCard, Download, RefreshCw } from 'lucide-react';
import { Button, Empty, ErrorNote, SearchBox, Spinner } from './components';
import { api, dateLabel, exportCsv, idOf, money } from './lib';

export function PaymentHistory({ data, demo, subscriptionId, compact = false }) {
  const limit = compact ? 8 : 20;
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [result, setResult] = useState({ payments: [], total: 0 }),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError('');
    if (demo) {
      const payments = data.payments.filter(
        (p) =>
          (!subscriptionId || idOf(p.subscription) === subscriptionId) &&
          (!search ||
            `${p.subscriptionName} ${p.reference}`.toLowerCase().includes(search.toLowerCase()))
      );
      setResult({
        payments: payments.slice((page - 1) * limit, page * limit),
        total: payments.length,
      });
      setBusy(false);
    } else {
      const params = new URLSearchParams({
        page,
        limit,
        search,
        ...(subscriptionId ? { subscription: subscriptionId } : {}),
      });
      api(`/payments?${params}`)
        .then((value) => {
          if (!cancelled) setResult(value);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [page, search, subscriptionId, demo, data.payments, retry, limit]);
  function exportPage() {
    exportCsv('payments-page.csv', [
      [
        'Subscription',
        'Amount',
        'Currency',
        'Due date',
        'Paid date',
        'Recorded by',
        'Reference',
        'Note',
      ],
      ...result.payments.map((p) => [
        p.subscriptionName,
        p.amount,
        p.currency,
        p.dueDate,
        p.paidDate,
        p.paidBy?.name,
        p.reference,
        p.note,
      ]),
    ]);
  }
  const pages = Math.max(1, Math.ceil(result.total / limit));
  return (
    <div className={compact ? 'history-compact' : 'panel payments-panel'}>
      {!compact && (
        <div className="panel-header">
          <div>
            <h2>
              Payment history <span className="count-badge">{result.total}</span>
            </h2>
            <p>All recorded payments · prices in original currency</p>
          </div>
          <Button
            variant="ghost"
            icon={Download}
            onClick={exportPage}
            disabled={busy || !result.payments.length}
          >
            Export page
          </Button>
        </div>
      )}
      <div className="history-search">
        <SearchBox
          value={query}
          onChange={(value) => {
            setQuery(value);
          }}
          placeholder="Find a payment or reference…"
        />
      </div>
      {error ? (
        <div className="history-error">
          <ErrorNote error={error} />
          <Button variant="secondary" onClick={() => setRetry((v) => v + 1)} icon={RefreshCw}>
            Retry payments
          </Button>
        </div>
      ) : busy ? (
        <Spinner label="Loading payment history…" />
      ) : !result.payments.length ? (
        <Empty
          icon={CreditCard}
          title={search ? 'No matching payments' : 'A clean slate'}
          text={
            search
              ? 'Try another subscription name or reference.'
              : 'Mark a subscription as paid to start its payment history.'
          }
        />
      ) : compact ? (
        <div className="payment-list">
          {result.payments.map((p) => (
            <div className="payment-history-row" key={p.id}>
              <span className="payment-check">
                <Check size={17} />
              </span>
              <div>
                <strong>{dateLabel(p.paidDate, { year: 'numeric' })}</strong>
                <small>
                  {p.reference || 'Payment recorded'} · {p.paidBy?.name || 'Team member'}
                </small>
                {p.note && <small>{p.note}</small>}
                <small>Due {dateLabel(p.dueDate, { year: 'numeric' })}</small>
              </div>
              <b>{money(p.amount, p.currency)}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Subscription</th>
                <th>Amount</th>
                <th>Payment date</th>
                <th>Billing due date</th>
                <th>Recorded by</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {result.payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.subscriptionName}</strong>
                  </td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>{dateLabel(p.paidDate, { year: 'numeric' })}</td>
                  <td>{dateLabel(p.dueDate, { year: 'numeric' })}</td>
                  <td>{p.paidBy?.name || 'Team member'}</td>
                  <td>{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!error && (
        <div className="pagination">
          <span>
            {busy
              ? 'Loading…'
              : `${result.total ? (page - 1) * limit + 1 : 0}–${Math.min(page * limit, result.total)} of ${result.total} payments`}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous payment page"
              disabled={busy || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              className="icon-button"
              aria-label="Next payment page"
              disabled={busy || page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
