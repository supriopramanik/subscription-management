export const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'CAD', 'AUD'];
export const COLORS = ['#b7ef70', '#91b5ff', '#c5a0f5', '#f2bc75', '#ff8f96', '#74d6ca', '#c5cfdb'];
export const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Manager',
  member: 'Member',
  viewer: 'Viewer',
};
export const CYCLES = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
  once: 'one time',
};
export const idOf = (value) => (typeof value === 'object' ? value?.id || value?._id : value);
export function money(amount, currency = 'BDT', compact = false) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: compact || Number.isInteger(amount) ? 0 : 2,
    ...(compact && amount >= 100000 ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  }).format(amount || 0);
}
export function today(timezone = 'Asia/Dhaka') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function offsetDate(days, from = today()) {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const daysUntil = (date, now = today()) =>
  Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${now}T12:00:00Z`)) / 86400000);
export const dateLabel = (date, options = {}) =>
  new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...options,
    timeZone: 'UTC',
  });
export function dueLabel(date, now) {
  const d = daysUntil(date, now);
  return d < 0
    ? `${Math.abs(d)}d overdue`
    : d === 0
      ? 'Due today'
      : d === 1
        ? 'Tomorrow'
        : `In ${d} days`;
}
export function monthlyAmount(s) {
  return (
    s.amount *
    ({ weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0 }[s.cycle] ?? 0)
  );
}
export const isLive = (s) => ['active', 'trial'].includes(s.status);
export const canEdit = (user, sub) =>
  ['admin', 'manager'].includes(user.role) ||
  (user.role === 'member' && idOf(sub.owner) === idOf(user));
export function convert(amount, currency, company) {
  const rate = currency === company.baseCurrency ? 1 : company.rates[currency];
  return rate ? amount * rate : null;
}
export function rebaseRates(rates, baseCurrency) {
  const base = rates?.[baseCurrency];
  if (!Number.isFinite(base) || base <= 0) return { [baseCurrency]: 1 };
  return Object.fromEntries(
    Object.entries(rates)
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .map(([currency, value]) => [currency, currency === baseCurrency ? 1 : value / base])
  );
}
export function statsFor(data) {
  const now = today(data.company.timezone),
    live = data.subscriptions.filter(isLive);
  const missing = [
    ...new Set(
      live
        .filter((s) => convert(s.amount, s.currency, data.company) === null)
        .map((s) => s.currency)
    ),
  ];
  const monthly = live.reduce(
    (sum, s) => sum + (convert(monthlyAmount(s), s.currency, data.company) || 0),
    0
  );
  const renewals = live
    .filter((s) => daysUntil(s.nextBillingDate, now) <= 7)
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));
  const paid = data.paidThisMonth.reduce(
    (sum, p) => sum + (convert(p.total, p._id, data.company) || 0),
    0
  );
  const paidMissing = data.paidThisMonth.some(
    (p) => convert(p.total, p._id, data.company) === null
  );
  const categories = Object.entries(
    live.reduce((map, s) => {
      map[s.category] =
        (map[s.category] || 0) + (convert(monthlyAmount(s), s.currency, data.company) || 0);
      return map;
    }, {})
  )
    .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  return {
    now,
    live,
    monthly,
    renewals,
    paid,
    missing,
    paidMissing,
    categories,
    overdue: live.filter((s) => s.nextBillingDate < now),
  };
}
export function advanceDate(date, cycle, anchor = Number(date.slice(-2))) {
  if (cycle === 'once') return date;
  if (cycle === 'weekly') return offsetDate(7, date);
  const d = new Date(`${date}T12:00:00Z`),
    m = { monthly: 1, quarterly: 3, yearly: 12 }[cycle];
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + m);
  d.setUTCDate(
    Math.min(anchor, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())
  );
  return d.toISOString().slice(0, 10);
}
export function forecast(subscriptions, company, monthCount = 6, from = today(company.timezone)) {
  const start = new Date(`${from.slice(0, 7)}-01T12:00:00Z`);
  const months = Array.from({ length: monthCount }, (_, i) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    return {
      key: d.toISOString().slice(0, 7),
      name: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      amount: 0,
    };
  });
  for (const s of subscriptions.filter(isLive)) {
    let date = s.nextBillingDate,
      count = 0;
    while (date.slice(0, 7) <= months[months.length - 1].key && count++ < 5000) {
      if (date >= from) {
        const month = months.find((m) => m.key === date.slice(0, 7));
        if (month) month.amount += convert(s.amount, s.currency, company) || 0;
      }
      if (s.cycle === 'once' || !s.autoRenew) break;
      const next = advanceDate(
        date,
        s.cycle,
        s.billingAnchorDay || Number(s.nextBillingDate.slice(-2))
      );
      if (next <= date) break;
      date = next;
    }
  }
  return months.map((m) => ({ ...m, amount: Math.round(m.amount) }));
}
export function calendarOccurrences(subscriptions, month, company) {
  const start = `${month}-01`,
    endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0);
  const end = endDate.toISOString().slice(0, 10),
    occurrences = [];
  for (const s of subscriptions.filter(isLive)) {
    let date = s.nextBillingDate,
      count = 0;
    while (date <= end && count++ < 5000) {
      if (date >= start) occurrences.push({ ...s, occurrenceDate: date });
      if (s.cycle === 'once' || !s.autoRenew) break;
      const next = advanceDate(
        date,
        s.cycle,
        s.billingAnchorDay || Number(s.nextBillingDate.slice(-2))
      );
      if (next <= date) break;
      date = next;
    }
  }
  return occurrences;
}
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
    ...(options.body && !(options.body instanceof FormData)
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  if (response.status === 204) return null;
  const result = await response
    .json()
    .catch(() => ({ error: 'The server returned an unexpected response' }));
  if (!response.ok)
    throw Object.assign(new Error(result.error || 'Request failed'), { status: response.status });
  return result;
}
export function exportCsv(filename, rows) {
  const cell = (value) => {
    let v = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
    return `"${v.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
