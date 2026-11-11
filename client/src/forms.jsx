import React, { useState } from 'react';
import {
  Check,
  Upload,
  ExternalLink,
  FileText,
  Trash2,
  Download,
  Pencil,
  CreditCard,
  ShieldCheck,
  LockKeyhole,
  ArrowRight,
  Eye,
  EyeOff,
  Monitor,
  X,
} from 'lucide-react';
import {
  Modal,
  Field,
  Select,
  Button,
  ErrorNote,
  ServiceIcon,
  Status,
  Avatar,
  Mark,
  Empty,
} from './components';
import { PaymentHistory } from './history';
import {
  api,
  CURRENCIES,
  COLORS,
  CYCLES,
  idOf,
  money,
  dateLabel,
  today,
  canEdit,
  ROLE_LABELS,
} from './lib';

export function AuthScreen({ setup, onSuccess, onDemo, unavailable, onRetry }) {
  const [form, setForm] = useState({
    companyName: 'Complaiance BD Ltd.',
    name: '',
    email: '',
    password: '',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [show, setShow] = useState(false);
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api(setup ? '/auth/setup' : '/auth/login', {
        method: 'POST',
        body: form,
      });
      onSuccess(user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-main">
        <a className="brand" href="/" aria-label="Subtrack home">
          <Mark />
          <span>
            subtrack<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="auth-form-wrap">
          <div className="eyebrow">
            <span className="live-dot" /> YOUR COMPANY, CONNECTED
          </div>
          <h1>{setup ? 'A little setup.\nA lot more clarity.' : 'Welcome back.'}</h1>
          <p className="auth-intro">
            {setup
              ? 'Create your company workspace and take control of every subscription, renewal and expense.'
              : 'Your subscriptions, your team, your next move. It’s all right here.'}
          </p>
          {unavailable ? (
            <>
              <ErrorNote error={unavailable} />
              <Button onClick={onRetry}>Retry connection</Button>
            </>
          ) : (
            <form onSubmit={submit}>
              <ErrorNote error={error} />
              {setup && (
                <>
                  <Field label="Company name" required>
                    <input
                      name="companyName"
                      value={form.companyName}
                      onChange={change}
                      required
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Your full name" required>
                    <input
                      name="name"
                      autoComplete="name"
                      value={form.name}
                      onChange={change}
                      placeholder="Emon Ahmed"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </Field>
                </>
              )}
              <Field label="Work email" required>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={form.email}
                  onChange={change}
                  placeholder="you@company.com"
                  required
                  maxLength={254}
                />
              </Field>
              <Field
                label="Password"
                required
                hint={
                  setup
                    ? 'At least 10 characters. This will be your administrator password.'
                    : undefined
                }
              >
                <div className="password-input">
                  <input
                    type={show ? 'text' : 'password'}
                    name="password"
                    autoComplete={setup ? 'new-password' : 'current-password'}
                    value={form.password}
                    onChange={change}
                    placeholder={setup ? 'Create a strong password' : 'Enter your password'}
                    required
                    minLength={setup ? 10 : 1}
                    maxLength={72}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              <Button type="submit" busy={busy} className="full-width" icon={ArrowRight}>
                {setup ? 'Create workspace' : 'Sign in to workspace'}
              </Button>
            </form>
          )}
          <div className="auth-divider">
            <span>take a look around first</span>
          </div>
          <Button variant="secondary" onClick={onDemo} className="full-width" icon={Monitor}>
            Explore the demo workspace
          </Button>
          {!setup && (
            <p className="auth-admin-note">
              Need access or forgot your password? Contact your company administrator.
            </p>
          )}
        </div>
        <footer>
          <ShieldCheck size={14} /> Private workspace · Role-based access
        </footer>
      </div>
      <div className="auth-visual">
        <span className="auth-orbit orbit-one" />
        <span className="auth-orbit orbit-two" />
        <div className="auth-visual-content">
          <span className="pill">LESS ADMIN. MORE PERSPECTIVE.</span>
          <h2>
            Every subscription.
            <br />
            One clear picture<span>.</span>
          </h2>
          <p>
            A shared view of what your company runs on.
            <br />
            Built for your desk. Ready for the big screen.
          </p>
          <div className="auth-sample">
            <div className="auth-sample-head">
              <span>
                <span className="live-dot" /> Workspace at a glance
              </span>
              <small>ILLUSTRATION</small>
            </div>
            <div className="sample-metric">
              <span>One place for every renewal</span>
              <strong>
                Always in view
                <ArrowRight size={23} />
              </strong>
            </div>
            <div className="sample-bars">
              {[35, 54, 42, 76, 60, 94, 72, 100, 88, 115, 93, 132].map((h, i) => (
                <span key={i} style={{ height: h }} />
              ))}
            </div>
            <div className="sample-services">
              {['Figma', 'Notion', 'GitHub', 'Slack'].map((name, i) => (
                <ServiceIcon key={name} sub={{ name, color: COLORS[i] }} />
              ))}
              <span>
                All your tools.
                <br />
                <strong>Working together.</strong>
              </span>
            </div>
          </div>
          <div className="auth-feature-row">
            <span>
              <Check size={15} /> Keep your team in sync
            </span>
            <span>
              <Check size={15} /> Stay ahead of renewals
            </span>
          </div>
        </div>
        <div className="auth-visual-bottom">
          COMPLAIANCE BD LTD.<span>SUBSCRIPTION OPERATIONS, SIMPLIFIED.</span>
        </div>
      </div>
    </div>
  );
}

export function SubscriptionForm({ sub, data, user, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    name: '',
    vendor: '',
    website: '',
    description: '',
    category: data.company.categories[0],
    department: user.department || data.company.departments[0],
    owner: idOf(user),
    amount: '',
    currency: data.company.baseCurrency,
    cycle: 'monthly',
    nextBillingDate: today(data.company.timezone),
    status: 'active',
    seats: 1,
    paymentMethod: '',
    autoRenew: true,
    color: COLORS[0],
    ...sub,
    ...(sub ? { owner: idOf(sub.owner) } : {}),
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ ...form, amount: Number(form.amount), seats: Number(form.seats) }, sub);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={sub ? 'Edit subscription' : 'Add a subscription'}
      subtitle="A little detail now. No surprises later."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="modal-body">
        <ErrorNote error={error} />
        <div className="form-service-preview">
          <ServiceIcon sub={{ ...form, name: form.name || 'S' }} />
          <div>
            <strong>{form.name || 'Your next subscription'}</strong>
            <p>Make it easy to spot on the dashboard</p>
          </div>
          <div className="color-options" role="group" aria-label="Subscription color">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
                style={{ background: c }}
                onClick={() => set('color', c)}
              >
                {form.color === c && <Check size={13} />}
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <Field label="Subscription name" required>
            <input
              autoComplete="off"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Figma"
              required
              maxLength={120}
            />
          </Field>
          <Field label="Plan / vendor">
            <input
              value={form.vendor}
              onChange={(e) => set('vendor', e.target.value)}
              placeholder="e.g. Professional plan"
              maxLength={120}
            />
          </Field>
          <Field label="Amount per billing cycle" required>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="0.00"
              required
              min="0"
              max="10000000000"
              step="0.01"
            />
          </Field>
          <Field label="Purchase currency" required>
            <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Billing cycle" required>
            <Select value={form.cycle} onChange={(e) => set('cycle', e.target.value)}>
              {Object.keys(CYCLES).map((c) => (
                <option key={c} value={c}>
                  {c === 'once' ? 'One time' : c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next payment date" required>
            <input
              type="date"
              value={form.nextBillingDate}
              onChange={(e) => set('nextBillingDate', e.target.value)}
              required
            />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {[...new Set([form.category, ...data.company.categories])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select value={form.department} onChange={(e) => set('department', e.target.value)}>
              {[...new Set([form.department, ...data.company.departments])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Subscription owner">
            <Select
              disabled={user.role === 'member'}
              value={form.owner}
              onChange={(e) => set('owner', e.target.value)}
            >
              {data.people.map((p) => (
                <option key={idOf(p)} value={idOf(p)}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {['active', 'trial', 'paused', 'cancelled'].map((s) => (
                <option key={s} value={s}>
                  {s === 'trial' ? 'Free trial' : s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Seats / licenses">
            <input
              type="number"
              value={form.seats}
              onChange={(e) => set('seats', e.target.value)}
              min="1"
              max="100000"
              required
            />
          </Field>
          <Field label="Payment method" hint="A label only. Never enter full card or bank details.">
            <input
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
              placeholder="Company Visa •• 4242"
              maxLength={120}
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://example.com"
            />
          </Field>
          <label className="toggle-field">
            <div>
              <strong>Automatically renews</strong>
              <small>Include future billing cycles in forecasts</small>
            </div>
            <input
              type="checkbox"
              checked={form.autoRenew}
              onChange={(e) => set('autoRenew', e.target.checked)}
            />
            <span className="switch" />
          </label>
        </div>
        <Field label="Notes">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What is this for? Anything the team should know?"
            rows={3}
            maxLength={2000}
          />
        </Field>
        {!sub && (
          <div className="info-note">
            <Upload size={16} /> You can upload a logo, invoices and documents after saving.
          </div>
        )}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} icon={Check}>
            {sub ? 'Save changes' : 'Add subscription'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PaymentForm({ sub, company, onClose, onSave }) {
  const [form, setForm] = useState({
    paidDate: today(company.timezone),
    reference: '',
    note: '',
    dueDate: sub.nextBillingDate,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(sub, form);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Record a payment"
      subtitle="Keep a clear record of what’s been paid."
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <div className="payment-summary">
          <ServiceIcon sub={sub} />
          <div>
            <strong>{sub.name}</strong>
            <small>Billing period due {dateLabel(sub.nextBillingDate, { year: 'numeric' })}</small>
          </div>
          <b>{money(sub.amount, sub.currency)}</b>
        </div>
        <ErrorNote error={error} />
        <Field label="Payment date" required>
          <input
            type="date"
            required
            max={today(company.timezone)}
            value={form.paidDate}
            onChange={(e) => setForm({ ...form, paidDate: e.target.value })}
          />
        </Field>
        <Field label="Invoice / transaction reference">
          <input
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            maxLength={200}
            placeholder="e.g. INV-001 or bank reference"
          />
        </Field>
        <Field label="Note">
          <textarea
            rows={3}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            maxLength={1000}
            placeholder="Optional payment details"
          />
        </Field>
        <div className="info-note">
          <CreditCard size={17} />
          This records a payment you already made. Your next billing date advances by one cycle.
        </div>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} icon={Check}>
            Confirm payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DetailModal({
  sub,
  data,
  user,
  demo,
  onClose,
  onEdit,
  onPay,
  onDelete,
  onUpload,
  onRemoveFile,
}) {
  const [tab, setTab] = useState('overview'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const editable = canEdit(user, sub),
    payments = data.payments.filter((p) => idOf(p.subscription) === sub.id);
  async function upload(e, kind) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onUpload(sub, file, kind);
    } catch (e) {
      setError(e.message);
    } finally {
      e.target.value = '';
      setBusy(false);
    }
  }
  return (
    <Modal title="Subscription details" onClose={onClose} wide>
      <div className="detail-hero">
        <ServiceIcon sub={sub} size="large" />
        <div>
          <h2>{sub.name}</h2>
          <p>{sub.vendor || sub.category}</p>
        </div>
        <div className="detail-price">
          {money(sub.amount, sub.currency)}
          <small>per {CYCLES[sub.cycle]}</small>
        </div>
      </div>
      <div className="detail-tabs" role="tablist">
        {['overview', 'files', 'payments'].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            key={t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
            {t === 'files' && <span>{sub.files.length}</span>}
          </button>
        ))}
      </div>
      <div className="modal-body">
        <ErrorNote error={error} />
        {tab === 'overview' && (
          <>
            <dl className="detail-grid">
              <div>
                <dt>Status</dt>
                <dd>
                  <Status value={sub.status} />
                </dd>
              </div>
              <div>
                <dt>Next payment</dt>
                <dd>{dateLabel(sub.nextBillingDate, { year: 'numeric' })}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>
                  <Avatar person={sub.owner} size="tiny" />
                  {sub.owner?.name || 'Unassigned'}
                </dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{sub.department}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{sub.category}</dd>
              </div>
              <div>
                <dt>Seats / licenses</dt>
                <dd>{sub.seats}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>{sub.paymentMethod || 'Not specified'}</dd>
              </div>
              <div>
                <dt>Auto renewal</dt>
                <dd>{sub.autoRenew ? 'Enabled' : 'Disabled'}</dd>
              </div>
            </dl>
            {sub.description && (
              <div className="detail-note">
                <h4>Team notes</h4>
                <p>{sub.description}</p>
              </div>
            )}
            {sub.website && (
              <a
                className="external-link"
                href={sub.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit service website <ExternalLink size={14} />
              </a>
            )}
          </>
        )}
        {tab === 'files' && (
          <>
            <div className="section-label">
              <div>
                <h3>Logos & documents</h3>
                <p>Attachments stay private to your company workspace.</p>
              </div>
            </div>
            <div className="upload-controls">
              {editable && (
                <>
                  <label className={`button secondary ${busy ? 'disabled' : ''}`}>
                    <Upload size={15} /> Upload document
                    <input
                      type="file"
                      disabled={busy || demo}
                      hidden
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.xlsx"
                      onChange={(e) => upload(e, 'attachment')}
                    />
                  </label>
                  <label className={`button ghost ${busy ? 'disabled' : ''}`}>
                    <Upload size={15} /> Change logo
                    <input
                      type="file"
                      disabled={busy || demo}
                      hidden
                      accept=".jpg,.jpeg,.png,.webp,.gif"
                      onChange={(e) => upload(e, 'logo')}
                    />
                  </label>
                </>
              )}
            </div>
            <p className="muted small-text">
              PDF, images, DOCX or XLSX. Up to 10 MB per file; 20 documents per subscription.
              {demo
                ? ' Uploads are available in your real workspace.'
                : !data.uploadsEnabled
                  ? ' Cloudinary credentials need to be configured.'
                  : ''}
            </p>
            {sub.files.length ? (
              <div className="file-list">
                {sub.files.map((f) => (
                  <div className="file-row" key={f.id}>
                    <FileText size={20} />
                    <div>
                      <strong>{f.name}</strong>
                      <small>{(f.size / 1024).toFixed(1)} KB</small>
                    </div>
                    <a
                      className="icon-button"
                      href={`/api/subscriptions/${sub.id}/files/${f.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Download ${f.name}`}
                    >
                      <Download size={17} />
                    </a>
                    {editable && (
                      <button
                        className="icon-button danger"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError('');
                          try {
                            await onRemoveFile(sub, f);
                          } catch (e) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        aria-label={`Remove ${f.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={FileText}
                title="Room for the paperwork"
                text="Keep invoices, receipts and supporting documents together here."
              />
            )}
          </>
        )}
        {tab === 'payments' && (
          <PaymentHistory data={data} demo={demo} subscriptionId={sub.id} compact />
        )}
        <div className="modal-actions detail-actions">
          {['admin', 'manager'].includes(user.role) && (
            <Button variant="danger-ghost" icon={Trash2} onClick={() => onDelete(sub)}>
              Delete
            </Button>
          )}
          <span className="spacer" />
          {editable && (
            <Button variant="secondary" icon={Pencil} onClick={() => onEdit(sub)}>
              Edit details
            </Button>
          )}
          {editable && ['active', 'trial'].includes(sub.status) && (
            <Button icon={Check} onClick={() => onPay(sub)}>
              Mark paid
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function EmployeeForm({ employee, company, onClose, onSave }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'member',
    department: company.departments[0],
    active: true,
    ...employee,
    password: '',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(
        { ...form, ...(employee && !form.password ? { password: undefined } : {}) },
        employee
      );
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={employee ? 'Manage employee' : 'Add a team member'}
      subtitle="Give the right people the right level of access."
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <ErrorNote error={error} />
        <Field label="Full name" required>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </Field>
        <Field label="Work email" required>
          <input
            type="email"
            value={form.email}
            disabled={!!employee}
            onChange={(e) => set('email', e.target.value)}
            required
            maxLength={254}
          />
        </Field>
        <div className="form-grid">
          <Field label="Role">
            <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select value={form.department} onChange={(e) => set('department', e.target.value)}>
              {[...new Set([form.department, ...company.departments])].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="role-explanation">
          <ShieldCheck size={18} />
          <p>
            {
              {
                admin: 'Full workspace access, including settings and employee management.',
                manager: 'Manage all subscriptions, record payments and upload documents.',
                member: 'View the workspace. Add and manage subscriptions assigned to them.',
                viewer: 'View dashboards, subscriptions and files. No changes allowed.',
              }[form.role]
            }
          </p>
        </div>
        <Field
          label={employee ? 'Reset temporary password (optional)' : 'Temporary password'}
          required={!employee}
          hint="Share this privately with the employee. They must change it at first sign-in."
        >
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            required={!employee}
            minLength={10}
            maxLength={72}
            placeholder={
              employee ? 'Leave empty to keep current password' : 'At least 10 characters'
            }
          />
        </Field>
        {employee && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />{' '}
            Account is active
          </label>
        )}
        <div className="info-note">
          <LockKeyhole size={17} /> No email is sent. Share the sign-in link and temporary password
          directly.
        </div>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} type="submit" icon={Check}>
            {employee ? 'Save employee' : 'Create account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function EmailForm({ user, onClose, onSave }) {
  const [form, setForm] = useState({ email: '', currentPassword: '' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Change your email"
      subtitle="Use your new email to sign in. Other sessions will be signed out."
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <ErrorNote error={error} />
        <Field label="Current email">
          <input type="email" value={user.email} readOnly />
        </Field>
        <Field label="New email" hint="Choose an email address you can access.">
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            maxLength={254}
            required
          />
        </Field>
        <Field label="Current password">
          <input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            maxLength={256}
            required
          />
        </Field>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} type="submit" icon={Check}>
            Update email
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PasswordForm({ required, onClose, onSave, onLogout }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) return setError('New passwords do not match');
    setBusy(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={required ? 'Make this account yours' : 'Change your password'}
      subtitle={
        required
          ? 'Replace your temporary password before entering the workspace.'
          : 'Other sessions will be signed out after this change.'
      }
      onClose={required ? () => {} : onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <ErrorNote error={error} />
        <Field label={required ? 'Temporary password' : 'Current password'}>
          <input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            required
          />
        </Field>
        <Field label="New password" hint="At least 10 characters; no more than 72 UTF-8 bytes.">
          <input
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            required
            minLength={10}
            maxLength={72}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
            minLength={10}
            maxLength={72}
          />
        </Field>
        <div className="modal-actions">
          {required ? (
            <Button type="button" variant="secondary" onClick={onLogout}>
              Sign out
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button busy={busy} type="submit" icon={Check}>
            Update password
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmModal({ title, text, confirm = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p className="confirm-text">{text}</p>
        <ErrorNote error={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
