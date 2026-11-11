import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Layers3,
  CalendarDays,
  Wallet,
  CreditCard,
  Download,
  SlidersHorizontal,
  Grid2X2,
  List,
  ChevronLeft,
  ChevronRight,
  Users,
  ShieldCheck,
  Check,
  Activity,
  Search,
  Target,
  CircleHelp,
  ExternalLink,
} from 'lucide-react';
import {
  Button,
  Select,
  ServiceIcon,
  Status,
  Avatar,
  SubscriptionCard,
  RenewalsList,
  Empty,
  Field,
  ErrorNote,
  RoleBadge,
  SearchBox,
} from './components';
import { PaymentHistory } from './history';
import { AutomaticRates } from './exchange-rates';
import {
  CURRENCIES,
  COLORS,
  CYCLES,
  ROLE_LABELS,
  money,
  dateLabel,
  dueLabel,
  daysUntil,
  monthlyAmount,
  convert,
  statsFor,
  forecast,
  isLive,
  today,
  canEdit,
  idOf,
  calendarOccurrences,
  exportCsv,
} from './lib';

function ChartTooltip({ active, payload, label, currency }) {
  return active && payload?.length ? (
    <div className="chart-tooltip">
      <small>{label} · projected renewals</small>
      <strong>{money(payload[0].value, currency)}</strong>
    </div>
  ) : null;
}
export function ForecastChart({ data, months = 6 }) {
  const chart = useMemo(() => forecast(data.subscriptions, data.company, months), [data, months]);
  return (
    <div className="forecast-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chart}
          margin={{ top: 16, right: 6, bottom: 0, left: -12 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 5" stroke="#29332f" vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#8d9b93', fontSize: 12 }}
            dy={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#77867d', fontSize: 11 }}
            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
            width={54}
          />
          <Tooltip
            cursor={{ fill: '#b7ef7009' }}
            content={<ChartTooltip currency={data.company.baseCurrency} />}
          />
          <Bar dataKey="amount" radius={[5, 5, 0, 0]} maxBarSize={54} isAnimationActive={false}>
            {chart.map((_, i) => (
              <Cell
                key={i}
                fill={i === 0 ? '#b7ef70' : '#547848'}
                fillOpacity={i === 0 ? 1 : 0.65 + i * 0.035}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function CategoryChart({ stats, currency }) {
  return stats.categories.length ? (
    <>
      <div className="donut-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={stats.categories}
              dataKey="value"
              innerRadius="69%"
              outerRadius="94%"
              paddingAngle={4}
              stroke="none"
              cornerRadius={4}
              isAnimationActive={false}
            >
              {stats.categories.map((c) => (
                <Cell key={c.name} fill={c.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => money(v, currency)}
              contentStyle={{
                background: '#26322c',
                border: '1px solid #405044',
                borderRadius: 10,
                color: '#fff',
              }}
              itemStyle={{ color: '#fff' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <small>MONTHLY TOTAL</small>
          <strong>{money(stats.monthly, currency, true)}</strong>
          <span>{stats.categories.length} categories</span>
        </div>
      </div>
      <div className="category-legend">
        {stats.categories.slice(0, 4).map((c) => (
          <div key={c.name}>
            <span>
              <i style={{ background: c.color }} />
              {c.name}
            </span>
            <b>{stats.monthly ? Math.round((c.value / stats.monthly) * 100) : 0}%</b>
          </div>
        ))}
      </div>
    </>
  ) : (
    <Empty
      title="A clearer breakdown"
      text="Your spending categories will appear as you add subscriptions."
    />
  );
}
function Metric({ label, value, note, icon: Icon, children, accent = false }) {
  return (
    <section className={`metric-card ${accent ? 'accent' : ''}`}>
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-bottom">
        {children}
        <span>{note}</span>
      </div>
    </section>
  );
}
export function RatesWarning({ stats, data, onSettings }) {
  return stats.missing.length || stats.paidMissing ? (
    <div className="rates-warning">
      <CircleHelp size={17} />
      <span>
        {data.company.baseCurrency}-equivalent totals exclude currencies awaiting an automatic rate
        sync
        {stats.missing.length ? ` (${stats.missing.join(', ')})` : ''}. Original prices remain
        unchanged.
      </span>
      <button className="text-button" onClick={onSettings}>
        View rates <ArrowRight size={13} />
      </button>
    </div>
  ) : null;
}

export function Overview({ data, user, onOpen, onPay, onAdd, navigate, tv }) {
  const stats = statsFor(data),
    [months, setMonths] = useState(6),
    [displayPage, setDisplayPage] = useState(0),
    currency = data.company.baseCurrency;
  const sorted = [...data.subscriptions].sort(
    (a, b) =>
      Number(isLive(b)) - Number(isLive(a)) || a.nextBillingDate.localeCompare(b.nextBillingDate)
  );
  const displayPages = Math.max(1, Math.ceil(sorted.length / 8));
  useEffect(() => {
    if (!tv || displayPages < 2) return;
    const timer = setInterval(() => setDisplayPage((p) => (p + 1) % displayPages), 20000);
    return () => clearInterval(timer);
  }, [tv, displayPages]);
  const cards = tv
    ? sorted.slice((displayPage % displayPages) * 8, (displayPage % displayPages) * 8 + 8)
    : sorted.slice(0, 6);
  const projection = forecast(data.subscriptions, data.company, months).reduce(
    (sum, m) => sum + m.amount,
    0
  );
  const budget = data.company.monthlyBudget,
    budgetPercent = budget ? Math.round((stats.monthly / budget) * 100) : 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE BIG PICTURE</div>
          <h1>
            Workspace overview<span className="heading-dot">.</span>
          </h1>
          <p>Every subscription in sync. Every renewal in sight.</p>
        </div>
        <div className="date-chip">
          <CalendarDays size={16} />
          {dateLabel(stats.now, { weekday: 'short', year: 'numeric' })}
          <span className="live-indicator">
            <i />
            Live
          </span>
        </div>
      </div>
      <RatesWarning
        stats={stats}
        data={data}
        onSettings={() => navigate(user.role === 'admin' ? 'settings' : 'reports')}
      />
      <div className="metrics-grid">
        <Metric
          label="Monthly commitment"
          value={money(stats.monthly, currency)}
          note={
            stats.missing.length
              ? 'Partial total · rates needed'
              : 'Normalized across billing cycles'
          }
          icon={Wallet}
          accent
        >
          <span className="metric-tag">{currency}</span>
        </Metric>
        <Metric
          label="Active subscriptions"
          value={stats.live.length.toString().padStart(2, '0')}
          note={`${new Set(stats.live.map((s) => s.department)).size} departments connected`}
          icon={Layers3}
        >
          <span className="mini-dots">
            {COLORS.slice(0, 3).map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
        </Metric>
        <Metric
          label="Renewals to watch"
          value={stats.renewals.length.toString().padStart(2, '0')}
          note="Due within 7 days, incl. overdue"
          icon={CalendarDays}
        >
          {stats.overdue.length ? (
            <span className="metric-tag amber">{stats.overdue.length} overdue</span>
          ) : (
            <span className="metric-tag">On your radar</span>
          )}
        </Metric>
        <Metric
          label="Paid this month"
          value={money(stats.paid, currency)}
          note={stats.paidMissing ? 'Partial total · rates needed' : 'Recorded payments only'}
          icon={CreditCard}
        >
          <span className="metric-tag neutral">
            <Check size={11} /> Tracked
          </span>
        </Metric>
      </div>
      <div className="analytics-grid">
        <section className="panel forecast-panel">
          <div className="panel-header">
            <div>
              <h2>
                What’s ahead<span className="subtle-tag">FORECAST</span>
              </h2>
              <p>
                Upcoming payments in {currency}
                {stats.missing.length ? ' · partial total' : ''}
              </p>
            </div>
            <Select
              aria-label="Forecast period"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              <option value={3}>Next 3 months</option>
              <option value={6}>Next 6 months</option>
              <option value={12}>Next 12 months</option>
            </Select>
          </div>
          <div className="forecast-total">
            <strong>{money(projection, currency)}</strong>
            <span>remaining scheduled renewals</span>
          </div>
          <ForecastChart data={data} months={months} />
          <div className="chart-footnote">
            <span>
              <i /> Projected payments
            </span>
            <small>From today · assumes current plans and rates</small>
          </div>
        </section>
        <section className="panel category-panel">
          <div className="panel-header">
            <div>
              <h2>Where it goes</h2>
              <p>Your monthly spend, by category</p>
            </div>
            <span className="icon-surface">
              <Wallet size={16} />
            </span>
          </div>
          <div className="category-chart-content">
            <CategoryChart stats={stats} currency={currency} />
          </div>
        </section>
      </div>
      <div className="overview-bottom">
        <section className="subscriptions-section">
          <div className="section-heading">
            <div>
              <h2>
                Your subscriptions <span className="count-badge">{data.subscriptions.length}</span>
              </h2>
              <p>The tools that keep your company moving.</p>
            </div>
            <button className="text-button" onClick={() => navigate('subscriptions')}>
              View all <ArrowUpRight size={16} />
            </button>
          </div>
          {cards.length ? (
            <div className={`cards-grid ${tv ? 'tv-cards' : ''}`}>
              {cards.map((s) => (
                <SubscriptionCard
                  key={s.id}
                  sub={s}
                  now={stats.now}
                  onOpen={onOpen}
                  onPay={onPay}
                  editable={!tv && canEdit(user, s)}
                  compact
                />
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty
                title="Your workspace starts here"
                text="Add your first subscription to bring your spending, renewals and team into one view."
                action={
                  user.role !== 'viewer' ? (
                    <Button icon={Plus} onClick={onAdd}>
                      Add first subscription
                    </Button>
                  ) : null
                }
              />
            </div>
          )}
        </section>
        <aside className="renewals-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>
                  Coming up next <span className="tiny-dot" />
                </h2>
                <p>Keep your next 7 days clear.</p>
              </div>
              <CalendarDays size={18} className="muted" />
            </div>
            <RenewalsList
              items={stats.renewals}
              now={stats.now}
              onOpen={onOpen}
              limit={tv ? 5 : 4}
            />
            <button className="panel-footer-button" onClick={() => navigate('calendar')}>
              Open renewal calendar <ArrowRight size={15} />
            </button>
          </section>
          <section className="budget-panel">
            <div>
              <span className="icon-surface">
                <Target size={18} />
              </span>
              <strong>Room to grow.</strong>
            </div>
            {budget ? (
              <>
                <p>
                  {budgetPercent <= 100
                    ? `${Math.max(0, 100 - budgetPercent)}% of your monthly budget is available.`
                    : `Monthly commitment is ${budgetPercent - 100}% above budget.`}
                </p>
                <div className="budget-track">
                  <i
                    className={budgetPercent > 100 ? 'over-budget' : ''}
                    style={{ width: `${Math.min(100, budgetPercent)}%` }}
                  />
                </div>
                <div className="budget-labels">
                  <span>{money(stats.monthly, currency, true)}</span>
                  <span>of {money(budget, currency, true)}</span>
                </div>
              </>
            ) : (
              <>
                <p>Set a monthly budget to give your spending a clear direction.</p>
                {user.role === 'admin' && (
                  <button className="text-button" onClick={() => navigate('settings')}>
                    Set your budget <ArrowUpRight size={14} />
                  </button>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
      <footer className="workspace-footer">
        <span>
          <ShieldCheck size={13} /> Private to {data.company.name}
        </span>
        <span>
          {tv ? 'Auto-refreshing every 60 seconds' : 'A clearer view. A smarter workspace.'}
        </span>
      </footer>
    </>
  );
}

export function Subscriptions({ data, user, search, onSearch, onOpen, onPay, onAdd }) {
  const [status, setStatus] = useState('all'),
    [category, setCategory] = useState('all'),
    [department, setDepartment] = useState('all'),
    [sort, setSort] = useState('renewal'),
    [view, setView] = useState('grid');
  const stats = statsFor(data);
  const items = useMemo(
    () =>
      data.subscriptions
        .filter(
          (s) =>
            (!search ||
              [s.name, s.vendor, s.department, s.owner?.name]
                .join(' ')
                .toLowerCase()
                .includes(search.toLowerCase())) &&
            (status === 'all' || s.status === status) &&
            (category === 'all' || s.category === category) &&
            (department === 'all' || s.department === department)
        )
        .sort((a, b) =>
          sort === 'name'
            ? a.name.localeCompare(b.name)
            : sort === 'cost'
              ? (convert(monthlyAmount(b), b.currency, data.company) || 0) -
                (convert(monthlyAmount(a), a.currency, data.company) || 0)
              : a.nextBillingDate.localeCompare(b.nextBillingDate)
        ),
    [data, search, status, category, department, sort]
  );
  function exportItems() {
    exportCsv('subscriptions.csv', [
      [
        'Name',
        'Plan',
        'Amount',
        'Currency',
        'Billing cycle',
        'Next billing',
        'Status',
        'Category',
        'Department',
        'Owner',
        'Seats',
        'Auto renew',
      ],
      ...items.map((s) => [
        s.name,
        s.vendor,
        s.amount,
        s.currency,
        s.cycle,
        s.nextBillingDate,
        s.status,
        s.category,
        s.department,
        s.owner?.name,
        s.seats,
        s.autoRenew,
      ]),
    ]);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR TOOLKIT, ORGANIZED</div>
          <h1>
            Subscriptions<span className="heading-dot">.</span>
          </h1>
          <p>One home for everything your company subscribes to.</p>
        </div>
        <Button variant="secondary" icon={Download} onClick={exportItems}>
          Export CSV
        </Button>
      </div>
      <div className="status-tabs">
        {[
          ['all', 'All subscriptions'],
          ['active', 'Active'],
          ['trial', 'Free trials'],
          ['paused', 'Paused'],
          ['cancelled', 'Cancelled'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={status === key ? 'active' : ''}
            onClick={() => setStatus(key)}
          >
            {label}
            <span>
              {key === 'all'
                ? data.subscriptions.length
                : data.subscriptions.filter((s) => s.status === key).length}
            </span>
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <SearchBox value={search} onChange={onSearch} />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {[
            ...new Set([...data.company.categories, ...data.subscriptions.map((s) => s.category)]),
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="Filter by department"
        >
          <option value="all">All departments</option>
          {[
            ...new Set([
              ...data.company.departments,
              ...data.subscriptions.map((s) => s.department),
            ]),
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort subscriptions"
        >
          <option value="renewal">Next renewal</option>
          <option value="name">Name A–Z</option>
          <option value="cost">Monthly cost ↓</option>
        </Select>
        <div className="view-switch">
          <button
            aria-label="Card view"
            aria-pressed={view === 'grid'}
            className={view === 'grid' ? 'active' : ''}
            onClick={() => setView('grid')}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            aria-label="Table view"
            aria-pressed={view === 'table'}
            className={view === 'table' ? 'active' : ''}
            onClick={() => setView('table')}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      <div className="results-label">
        <span>
          {items.length} subscription{items.length === 1 ? '' : 's'}
          {search ? ` matching “${search}”` : ''}
        </span>
        <span>
          <i className="live-dot" /> All prices in original currency
        </span>
      </div>
      {!items.length ? (
        <div className="panel">
          <Empty
            icon={Search}
            title={
              data.subscriptions.length ? 'No matches this time' : 'Make room for your first tool'
            }
            text={
              data.subscriptions.length
                ? 'Try a different search or clear your filters.'
                : 'Add a subscription and start building a clearer picture.'
            }
            action={
              data.subscriptions.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onSearch('');
                    setCategory('all');
                    setDepartment('all');
                    setStatus('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : user.role !== 'viewer' ? (
                <Button icon={Plus} onClick={onAdd}>
                  Add subscription
                </Button>
              ) : null
            }
          />
        </div>
      ) : view === 'grid' ? (
        <div className="all-cards-grid">
          {items.map((s) => (
            <SubscriptionCard
              key={s.id}
              sub={s}
              now={stats.now}
              onOpen={onOpen}
              onPay={onPay}
              editable={canEdit(user, s)}
            />
          ))}
        </div>
      ) : (
        <div className="panel table-container">
          <table>
            <thead>
              <tr>
                <th>Subscription</th>
                <th>Cost / cycle</th>
                <th>Next payment</th>
                <th>Owner</th>
                <th>Department</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="table-service" onClick={() => onOpen(s)}>
                      <ServiceIcon sub={s} size="small" />
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.vendor || s.category}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <strong>{money(s.amount, s.currency)}</strong>
                    <small>per {CYCLES[s.cycle]}</small>
                  </td>
                  <td>
                    <span>{dateLabel(s.nextBillingDate)}</span>
                    <small
                      className={isLive(s) && s.nextBillingDate < stats.now ? 'text-danger' : ''}
                    >
                      {isLive(s) ? dueLabel(s.nextBillingDate, stats.now) : 'Not scheduled'}
                    </small>
                  </td>
                  <td>
                    <span className="inline-person">
                      <Avatar person={s.owner} size="tiny" />
                      {s.owner?.name}
                    </span>
                  </td>
                  <td>{s.department}</td>
                  <td>
                    <Status value={s.status} />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      onClick={() => onOpen(s)}
                      aria-label={`View ${s.name}`}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function CalendarPage({ data, onOpen }) {
  const now = today(data.company.timezone),
    [month, setMonth] = useState(now.slice(0, 7)),
    [selected, setSelected] = useState(now);
  const occurrences = useMemo(
    () => calendarOccurrences(data.subscriptions, month, data.company),
    [data, month]
  );
  const monthDate = new Date(`${month}-01T12:00:00Z`),
    startOffset = (monthDate.getUTCDay() + 6) % 7;
  const dates = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(monthDate);
    d.setUTCDate(i - startOffset + 1);
    return d.toISOString().slice(0, 10);
  });
  function move(n) {
    const d = new Date(monthDate);
    d.setUTCMonth(d.getUTCMonth() + n);
    const value = d.toISOString().slice(0, 7);
    setMonth(value);
    setSelected(`${value}-01`);
  }
  const dayItems = occurrences.filter((s) => s.occurrenceDate === selected);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STAY ONE STEP AHEAD</div>
          <h1>
            Renewal calendar<span className="heading-dot">.</span>
          </h1>
          <p>Your payment schedule, without the surprises.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setMonth(now.slice(0, 7));
            setSelected(now);
          }}
        >
          Today
        </Button>
      </div>
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="panel-header">
            <h2>
              {monthDate.toLocaleDateString('en-GB', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </h2>
            <div className="calendar-controls">
              <button className="icon-button" onClick={() => move(-1)} aria-label="Previous month">
                <ChevronLeft size={19} />
              </button>
              <button className="icon-button" onClick={() => move(1)} aria-label="Next month">
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="calendar-weekdays">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {dates.map((d) => {
              const items = occurrences.filter((s) => s.occurrenceDate === d);
              return (
                <div
                  key={d}
                  className={`calendar-day ${d.slice(0, 7) !== month ? 'outside' : ''} ${d === selected ? 'selected' : ''} ${d === now ? 'today' : ''}`}
                >
                  <button
                    className="day-select"
                    aria-label={`Select ${d}`}
                    aria-pressed={d === selected}
                    onClick={() => setSelected(d)}
                  >
                    <span>{Number(d.slice(-2))}</span>
                    {items.length > 0 && <small>{items.length}</small>}
                  </button>
                  <div className="day-events">
                    {items.slice(0, 3).map((s) => (
                      <button
                        key={s.id}
                        style={{ '--service-color': s.color }}
                        onClick={() => onOpen(s)}
                        title={`${s.name} · ${money(s.amount, s.currency)}`}
                      >
                        <i />
                        {s.name}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <button className="more-events" onClick={() => setSelected(d)}>
                        +{items.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="calendar-note">
            <span>
              <i className="live-dot" /> Scheduled & projected renewals
            </span>
            <small>Future cycles follow current auto-renew settings.</small>
          </div>
        </section>
        <aside className="panel calendar-agenda">
          <div className="panel-header">
            <div>
              <h2>{dateLabel(selected, { weekday: 'short' })}</h2>
              <p>
                {dayItems.length} scheduled payment{dayItems.length === 1 ? '' : 's'}
              </p>
            </div>
            <CalendarDays size={19} className="muted" />
          </div>
          {dayItems.length ? (
            <div className="agenda-list">
              {dayItems.map((s) => (
                <button key={s.id} onClick={() => onOpen(s)}>
                  <ServiceIcon sub={s} />
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.department}</small>
                    <b>{money(s.amount, s.currency)}</b>
                  </div>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={CalendarDays}
              title="A little breathing room"
              text="No subscription payments scheduled for this day."
            />
          )}
          <div className="agenda-summary">
            <small>THIS MONTH</small>
            <strong>{occurrences.length} renewals</strong>
            <p>Across {new Set(occurrences.map((s) => s.id)).size} subscriptions</p>
          </div>
        </aside>
      </div>
    </>
  );
}

export function Reports({ data, user, navigate, demo }) {
  const stats = statsFor(data),
    currency = data.company.baseCurrency,
    [group, setGroup] = useState('department');
  const grouped = Object.entries(
    stats.live.reduce((all, s) => {
      const key = s[group];
      if (!all[key]) all[key] = { count: 0, amount: 0, unconverted: false };
      all[key].count++;
      const amount = convert(monthlyAmount(s), s.currency, data.company);
      if (amount === null) all[key].unconverted = true;
      else all[key].amount += amount;
      return all;
    }, {})
  ).sort((a, b) => b[1].amount - a[1].amount);
  const yearly = stats.monthly * 12;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE THE NUMBERS MAKE SENSE</div>
          <h1>
            Spending insights<span className="heading-dot">.</span>
          </h1>
          <p>A closer look at what your tools cost, and where it goes.</p>
        </div>
        <Button
          variant="secondary"
          icon={Download}
          onClick={() =>
            exportCsv('recent-payments.csv', [
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
              ...data.payments.map((p) => [
                p.subscriptionName,
                p.amount,
                p.currency,
                p.dueDate,
                p.paidDate,
                p.paidBy?.name,
                p.reference,
                p.note,
              ]),
            ])
          }
        >
          Export recent payments
        </Button>
      </div>
      <RatesWarning
        stats={stats}
        data={data}
        onSettings={() => navigate(user.role === 'admin' ? 'settings' : 'reports')}
      />
      <div className="report-metrics">
        <Metric
          label="Monthly commitment"
          value={money(stats.monthly, currency)}
          note="Normalized recurring costs"
          icon={Wallet}
          accent
        />
        <Metric
          label="Annualized commitment"
          value={money(yearly, currency)}
          note="Monthly commitment × 12"
          icon={CalendarDays}
        />
        <Metric
          label="Average per subscription"
          value={money(stats.monthly / (stats.live.length || 1), currency)}
          note="Across active plans and free trials"
          icon={Layers3}
        />
      </div>
      <div className="analytics-grid">
        <section className="panel forecast-panel">
          <div className="panel-header">
            <div>
              <h2>A view of the year ahead</h2>
              <p>Scheduled payments from today · {currency}</p>
            </div>
          </div>
          <ForecastChart data={data} months={12} />
          <div className="chart-footnote">
            <span>
              <i /> Projected renewals
            </span>
            <small>Current plans and automatically synced reference rates</small>
          </div>
        </section>
        <section className="panel category-panel">
          <div className="panel-header">
            <div>
              <h2>Spend distribution</h2>
              <p>Monthly cost by category</p>
            </div>
          </div>
          <div className="category-chart-content">
            <CategoryChart stats={stats} currency={currency} />
          </div>
        </section>
      </div>
      <section className="panel report-breakdown">
        <div className="panel-header">
          <div>
            <h2>Follow the spend</h2>
            <p>Monthly recurring commitment, normalized to {currency}</p>
          </div>
          <Select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Group spending"
          >
            <option value="department">By department</option>
            <option value="category">By category</option>
            <option value="currency">By original currency</option>
          </Select>
        </div>
        {grouped.length ? (
          <div className="breakdown-list">
            {grouped.map(([name, value], i) => (
              <div key={name} className="breakdown-row">
                <span className="breakdown-name">
                  <i style={{ background: COLORS[i % COLORS.length] }} />
                  <strong>{name}</strong>
                  <small>{value.count} tools</small>
                </span>
                <div className="breakdown-track">
                  <i
                    style={{
                      width: `${stats.monthly ? (value.amount / stats.monthly) * 100 : 0}%`,
                      background: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
                <b>
                  {money(value.amount, currency)}
                  {value.unconverted && <small>Rate needed</small>}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Insights are on their way"
            text="Add subscriptions to see where your company spends."
          />
        )}
      </section>
      <PaymentHistory data={data} demo={demo} />
    </>
  );
}

export function Team({ users, company, onAdd, onEdit }) {
  const [search, setSearch] = useState('');
  const people = users.filter((p) =>
    [p.name, p.email, p.department].join(' ').toLowerCase().includes(search.toLowerCase())
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE PEOPLE BEHIND THE TOOLS</div>
          <h1>
            Your team<span className="heading-dot">.</span>
          </h1>
          <p>The right access for everyone at {company.name}.</p>
        </div>
        <Button icon={Plus} onClick={onAdd}>
          Add employee
        </Button>
      </div>
      <div className="role-cards">
        {Object.entries(ROLE_LABELS).map(([key, label]) => (
          <div className="panel" key={key}>
            <ShieldCheck size={20} />
            <strong>
              {label}
              <span>{users.filter((u) => u.role === key && u.active).length}</span>
            </strong>
            <p>
              {
                {
                  admin: 'Workspace & team control',
                  manager: 'Manage all subscriptions',
                  member: 'Manage assigned subscriptions',
                  viewer: 'View the shared workspace',
                }[key]
              }
            </p>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              Workspace members <span className="count-badge">{users.length}</span>
            </h2>
            <p>Manage employee accounts and permissions.</p>
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="Find a team member…" />
        </div>
        {people.length ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Account status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={idOf(p)}>
                    <td>
                      <div className="table-service">
                        <Avatar person={p} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>{p.department}</td>
                    <td>
                      <RoleBadge role={p.role} />
                    </td>
                    <td>
                      <span className={`status ${p.active ? 'active' : 'paused'}`}>
                        <i />
                        {p.active
                          ? p.mustChangePassword
                            ? 'Password change required'
                            : 'Active'
                          : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button className="text-button" onClick={() => onEdit(p)}>
                        Manage <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Users}
            title="No team members found"
            text="Try another name, email or department."
          />
        )}
      </section>
      <div className="info-note">
        <ShieldCheck size={17} /> Employee accounts use temporary passwords. New members choose
        their own password at first sign-in.
      </div>
    </>
  );
}

export function ActivityPage({ data }) {
  const [filter, setFilter] = useState('');
  const items = data.activities.filter((a) =>
    [a.actorName, a.action, a.target].join(' ').toLowerCase().includes(filter.toLowerCase())
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">NOTHING LOST IN THE LOOP</div>
          <h1>
            Workspace activity<span className="heading-dot">.</span>
          </h1>
          <p>A shared trail of changes, payments and team updates.</p>
        </div>
        <span className="muted small-text">Latest 100 events · {data.company.timezone}</span>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>The latest in your workspace</h2>
          <SearchBox value={filter} onChange={setFilter} placeholder="Search activity…" />
        </div>
        {items.length ? (
          <div className="activity-list">
            {items.map((a) => (
              <div className="activity-row" key={a.id}>
                <span className={`activity-icon ${a.action.includes('payment') ? 'payment' : ''}`}>
                  {a.action.includes('payment') ? (
                    <CreditCard size={18} />
                  ) : a.action.includes('employee') ? (
                    <Users size={18} />
                  ) : (
                    <Activity size={18} />
                  )}
                </span>
                <div>
                  <p>
                    <strong>{a.actorName || 'Team member'}</strong> {a.action} <b>{a.target}</b>
                  </p>
                  {a.detail && <small>{a.detail}</small>}
                </div>
                <time dateTime={a.createdAt}>
                  {new Date(a.createdAt).toLocaleString('en-GB', {
                    timeZone: data.company.timezone,
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Activity} title="Quiet for now" text="Workspace changes will appear here." />
        )}
      </section>
    </>
  );
}

export function Settings({ company, onSave, onRefreshRates }) {
  const [form, setForm] = useState({
    name: company.name,
    baseCurrency: company.baseCurrency,
    timezone: company.timezone,
    monthlyBudget: company.monthlyBudget,
    categoriesText: company.categories.join(', '),
    departmentsText: company.departments.join(', '),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await onSave({
        ...form,
        monthlyBudget: Number(form.monthlyBudget),
        categories: [
          ...new Set(
            form.categoriesText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          ),
        ],
        departments: [
          ...new Set(
            form.departmentsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          ),
        ],
      });
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOUR WORKSPACE</div>
          <h1>
            Workspace settings<span className="heading-dot">.</span>
          </h1>
          <p>A few thoughtful defaults. A clearer picture for everyone.</p>
        </div>
      </div>
      <form className="settings-form" onSubmit={submit}>
        <ErrorNote error={error} />
        <section className="panel settings-section">
          <div className="settings-description">
            <span className="icon-surface">
              <Users size={20} />
            </span>
            <h2>Company details</h2>
            <p>The basics your team will see throughout the workspace.</p>
          </div>
          <div className="settings-fields">
            <Field label="Company name" required>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <div className="form-grid">
              <Field label="Reporting currency">
                <Select
                  value={form.baseCurrency}
                  onChange={(e) => set('baseCurrency', e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Timezone">
                <input
                  value={form.timezone}
                  onChange={(e) => set('timezone', e.target.value)}
                  required
                  placeholder="Asia/Dhaka"
                />
              </Field>
            </div>
            <Field
              label={`Monthly budget (${form.baseCurrency})`}
              hint="Set 0 to leave the budget unset."
            >
              <input
                type="number"
                value={form.monthlyBudget}
                onChange={(e) => set('monthlyBudget', e.target.value)}
                required
                min="0"
                max="1000000000000"
                step="0.01"
              />
            </Field>
          </div>
        </section>
        <section className="panel settings-section">
          <div className="settings-description">
            <span className="icon-surface">
              <Wallet size={20} />
            </span>
            <h2>Currency rates</h2>
            <p>
              Original purchase prices stay unchanged. Online reference rates keep dashboard totals
              and forecasts up to date.
            </p>
            <span className="subtle-tag">AUTOMATICALLY UPDATED</span>
          </div>
          <AutomaticRates
            company={company}
            baseCurrency={form.baseCurrency}
            onRefresh={onRefreshRates}
          />
        </section>
        <section className="panel settings-section">
          <div className="settings-description">
            <span className="icon-surface">
              <Layers3 size={20} />
            </span>
            <h2>Keep things organized</h2>
            <p>
              Categories and departments help everyone find their tools and understand spending.
            </p>
          </div>
          <div className="settings-fields">
            <Field label="Categories" hint="Separate names with commas. Up to 30 categories.">
              <textarea
                value={form.categoriesText}
                onChange={(e) => set('categoriesText', e.target.value)}
                rows={3}
                required
              />
            </Field>
            <Field label="Departments" hint="Separate names with commas. Up to 30 departments.">
              <textarea
                value={form.departmentsText}
                onChange={(e) => set('departmentsText', e.target.value)}
                rows={3}
                required
              />
            </Field>
          </div>
        </section>
        <div className="settings-save">
          {saved && (
            <span className="saved-indicator" role="status">
              <Check size={16} /> Workspace settings saved
            </span>
          )}
          <Button type="submit" busy={busy} icon={Check}>
            Save workspace settings
          </Button>
        </div>
      </form>
    </>
  );
}
