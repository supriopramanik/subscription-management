import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ArrowUpRight,
  Check,
  ChevronDown,
  Search,
  LoaderCircle,
  Layers3,
  Globe,
  Bell,
  CalendarDays,
  RefreshCw,
} from 'lucide-react';
import { CYCLES, dateLabel, dueLabel, daysUntil, idOf, money, ROLE_LABELS, initials } from './lib';
import { providerForSubscription } from './provider-icons';
import { domainForService } from '../../shared/site-icons.mjs';
import cachedSiteIcons from './site-icon-cache.json';

function ProviderIcon({ sub }) {
  const provider = providerForSubscription(sub);
  const [failedIcon, setFailedIcon] = useState('');
  const label = provider?.name || sub.vendor?.split(' - ')[0] || 'Service provider';
  return (
    <span
      className={`tv-provider-icon ${provider?.name === 'BTCL' ? 'wide' : ''}`}
      title={`Source: ${label}`}
    >
      {provider && failedIcon !== provider.icon ? (
        <img
          src={provider.icon}
          alt={`${label} source logo`}
          width="32"
          height="32"
          onError={() => setFailedIcon(provider.icon)}
        />
      ) : (
        <Globe size={24} role="img" aria-label={`${label} source`} />
      )}
    </span>
  );
}

export function Mark({ small = false }) {
  return (
    <span className={`brand-mark ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M23 9H12a5 5 0 0 0 0 10h8a3 3 0 0 1 0 6H8M9 6v5m14 11v5"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
export function ServiceIcon({ sub, size = '' }) {
  const domain = domainForService(sub);
  const automatic = /(^|\.)(chatgpt\.com|openai\.com)$/.test(domain)
    ? '/providers/openai.png'
    : /(^|\.)hostinger\.com$/.test(domain)
      ? '/providers/hostinger.ico'
      : /(^|\.)namecheap\.com$/.test(domain)
        ? '/providers/namecheap.png'
        : /(^|\.)tasjeel\.ae$/.test(domain)
          ? '/providers/tasjeel.png'
          : /(^|\.)btcl\.(?:com|gov)\.bd$/.test(domain)
            ? '/providers/btcl-mark.png'
            : /(^|\.)limda\.net$/.test(domain)
              ? '/providers/limda.ico'
              : domain
                ? cachedSiteIcons[domain] ||
                  `/api/service-icon?domain=${encodeURIComponent(domain)}`
                : '';
  const [failed, setFailed] = useState([]);
  const source = [sub.logo, automatic].find((src) => src && !failed.includes(src));
  return (
    <span
      className={`service-icon ${size} ${source ? 'has-image' : ''}`}
      style={{ '--service-color': sub.color || '#b7ef70' }}
    >
      {source ? (
        <img
          key={source}
          src={source}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed((previous) => [...previous, source])}
        />
      ) : (
        <span>{sub.name?.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}
export function Avatar({ person, size = '' }) {
  return (
    <span className={`avatar ${size}`} title={person?.name || 'Unassigned'}>
      {initials(person?.name)}
    </span>
  );
}
export function Status({ value }) {
  return (
    <span className={`status ${value}`}>
      <i />
      {value === 'trial' ? 'Free trial' : value?.[0]?.toUpperCase() + value?.slice(1)}
    </span>
  );
}
export function Spinner({ label = 'Loading workspace…' }) {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function Empty({ icon: Icon = Layers3, title, text, action }) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Button({
  children,
  icon: Icon,
  variant = 'primary',
  className = '',
  busy,
  disabled,
  ...props
}) {
  return (
    <button className={`button ${variant} ${className}`} disabled={disabled || busy} {...props}>
      {busy ? <LoaderCircle size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}
export function Field({ label, children, hint, required }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Select({ children, className = '', ...props }) {
  return (
    <span className={`select-wrap ${className}`}>
      <select {...props}>{children}</select>
      <ChevronDown size={14} />
    </span>
  );
}
export function SearchBox({ value, onChange, placeholder = 'Search subscriptions…', inputRef }) {
  return (
    <div className="search-box">
      <Search size={17} />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button className="icon-button tiny" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const oldFocus = document.activeElement,
      oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, button, select, textarea')?.focus();
    function key(e) {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const focusable = [
          ...ref.current.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
          ),
        ].filter((x) => x.offsetParent !== null);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', key);
      oldFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function SubscriptionCard({
  sub,
  now,
  onOpen,
  onPay,
  editable,
  compact,
  hideAmounts = false,
  displayCard = false,
}) {
  const days = daysUntil(sub.nextBillingDate, now),
    live = ['active', 'trial'].includes(sub.status);
  if (displayCard) {
    const timing = !live
      ? sub.status === 'paused'
        ? 'Renewal is on hold'
        : 'This service is not renewing'
      : days < 0
        ? 'Renewal is overdue by'
        : days === 0
          ? 'Renewal is due today'
          : 'Renews in';
    return (
      <article
        className="subscription-card compact tv-service-card"
        style={{ '--service-color': sub.color }}
      >
        <button className="card-main" onClick={() => onOpen(sub)} aria-label={`View ${sub.name}`}>
          <div className="tv-service-heading">
            <div className="tv-service-title">
              <h3>{sub.name}</h3>
              <p>{sub.vendor || sub.category}</p>
            </div>
            <div className="tv-service-emblem">
              <ServiceIcon sub={sub} />
            </div>
          </div>
          <ProviderIcon sub={sub} />
          <div
            className={`tv-service-timing ${live && days < 0 ? 'late' : live && days <= 7 ? 'soon' : ''}`}
          >
            <span>
              {timing}
              {live && days !== 0 && (
                <>
                  {' '}
                  <strong>
                    {Math.abs(days)} {Math.abs(days) === 1 ? 'day' : 'days'}
                  </strong>
                </>
              )}
            </span>
            <span className="tv-service-date">
              <CalendarDays size={14} />
              Renewal date · {dateLabel(sub.nextBillingDate, { year: 'numeric' })}
            </span>
          </div>
          <div className="tv-service-meta">
            <span className="tv-service-category">{sub.category}</span>
            <Status value={sub.status} />
          </div>
        </button>
        <div className="card-footer tv-service-footer">
          <span>
            <Bell size={15} />
            {live ? 'Renewal tracked' : 'Reminders inactive'}
          </span>
          <span>
            <RefreshCw size={14} />
            Auto-renew {sub.autoRenew && live ? 'on' : 'off'}
          </span>
        </div>
      </article>
    );
  }
  return (
    <article
      className={`subscription-card ${compact ? 'compact' : ''}`}
      style={{ '--service-color': sub.color }}
    >
      <button className="card-main" onClick={() => onOpen(sub)} aria-label={`View ${sub.name}`}>
        <div className="card-heading">
          <ServiceIcon sub={sub} />
          <Status value={sub.status} />
        </div>
        <h3>
          {sub.name}
          <ArrowUpRight size={15} />
        </h3>
        <p>{sub.vendor || sub.category}</p>
        {hideAmounts ? (
          <div className="card-price card-renewal-date">
            <small>Renewal date</small>
            {dateLabel(sub.nextBillingDate, { year: 'numeric' })}
          </div>
        ) : (
          <div className="card-price">
            {money(sub.amount, sub.currency)}
            <small> / {CYCLES[sub.cycle]}</small>
          </div>
        )}
        {sub.plans && <div className="card-plan-summary">Includes {sub.plans.length} plans</div>}
        {sub.includedServices?.length > 0 && (
          <div className="card-plan-summary">
            Includes{' '}
            {sub.includedServices.filter((s) => s.kind === 'website').length > 0 &&
              `${sub.includedServices.filter((s) => s.kind === 'website').length} websites · `}
            {sub.includedServices.filter((s) => s.kind === 'email').length > 0 &&
              `${sub.includedServices.filter((s) => s.kind === 'email').length} email plans · `}
            {sub.includedServices.filter((s) => s.kind === 'addon').length} extras
          </div>
        )}
      </button>
      <div className="card-footer">
        <div className={`renewal-label ${live && days <= 3 ? (days < 0 ? 'late' : 'soon') : ''}`}>
          <span className="dot" />
          {live
            ? dueLabel(sub.nextBillingDate, now)
            : sub.status === 'paused'
              ? 'On hold'
              : 'Not renewing'}
        </div>
        {editable && sub.amount !== null && live && days <= 7 ? (
          <button className="text-button pay-link" onClick={() => onPay(sub)}>
            <Check size={13} />
            Mark paid
          </button>
        ) : (
          <Avatar person={sub.owner} size="tiny" />
        )}
      </div>
    </article>
  );
}
export function RenewalsList({ items, now, onOpen, limit = 5, hideAmounts = false }) {
  return items.length ? (
    <div className="renewal-list">
      {items.slice(0, limit).map((s) => (
        <button
          className="renewal-item"
          key={`${s.id}-${s.occurrenceDate || ''}`}
          onClick={() => onOpen(s)}
        >
          <ServiceIcon sub={s} size="small" />
          <div>
            <strong>{s.name}</strong>
            <small className={daysUntil(s.nextBillingDate, now) < 0 ? 'text-danger' : ''}>
              {dueLabel(s.nextBillingDate, now)}
            </small>
          </div>
          <span>
            {!hideAmounts && money(s.amount, s.currency)}
            <small>{dateLabel(s.nextBillingDate)}</small>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <Empty title="All caught up" text="No renewals coming up in the next 7 days." />
  );
}
export function ErrorNote({ error }) {
  return error ? (
    <div className="error-note" role="alert">
      {error}
    </div>
  ) : null;
}
export function RoleBadge({ role }) {
  return <span className={`role-badge ${role}`}>{ROLE_LABELS[role]}</span>;
}
