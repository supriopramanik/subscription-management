import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Layers3,
  CalendarDays,
  ChartNoAxesCombined,
  Users,
  Activity,
  Settings2,
  Bell,
  Search,
  Maximize2,
  Minimize2,
  Plus,
  ChevronDown,
  ArrowUpRight,
  CircleHelp,
  LogOut,
  KeyRound,
  Mail,
  Menu,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Monitor,
  ArrowRight,
} from 'lucide-react';
import { Mark, Avatar, Button, Modal, Spinner, RenewalsList, Empty, RoleBadge } from './components';
import {
  AuthScreen,
  SubscriptionForm,
  PaymentForm,
  DetailModal,
  EmployeeForm,
  PasswordForm,
  EmailForm,
  ConfirmModal,
} from './forms';
import {
  Overview,
  Subscriptions,
  CalendarPage,
  Reports,
  Team,
  ActivityPage,
  Settings,
} from './pages';
import { api, idOf, statsFor, ROLE_LABELS, today, advanceDate, rebaseRates } from './lib';
import { makeDemo, demoUser } from './demo';
import {
  readDisplayMode,
  rememberDisplayChoice,
  useDisplayFit,
  useDisplayPreference,
} from './use-display';

const navItems = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'subscriptions', label: 'Subscriptions', icon: Layers3 },
  { key: 'calendar', label: 'Renewal calendar', icon: CalendarDays },
  { key: 'reports', label: 'Spending insights', icon: ChartNoAxesCombined },
];
const titleMap = {
  overview: 'Overview',
  subscriptions: 'Subscriptions',
  calendar: 'Renewal calendar',
  reports: 'Spending insights',
  team: 'Team members',
  activity: 'Activity log',
  settings: 'Workspace settings',
};

export default function App() {
  const initialDemo = new URLSearchParams(location.search).get('demo') === '1';
  const [demo, setDemo] = useState(initialDemo),
    [user, setUser] = useState(initialDemo ? demoUser : null),
    [data, setData] = useState(initialDemo ? makeDemo : null);
  const [initializing, setInitializing] = useState(!initialDemo),
    [setup, setSetup] = useState(false),
    [unavailable, setUnavailable] = useState('');
  const [route, setRoute] = useState(
    titleMap[location.hash.slice(1)] ? location.hash.slice(1) : 'overview'
  );
  const [modal, setModal] = useState(null),
    [search, setSearch] = useState(''),
    [toast, setToast] = useState(null),
    [syncError, setSyncError] = useState(''),
    [syncedAt, setSyncedAt] = useState(new Date());
  const [team, setTeam] = useState(initialDemo ? makeDemo().people : []),
    [mobileNav, setMobileNav] = useState(false),
    [profileMenu, setProfileMenu] = useState(false),
    [tv, setTv] = useState(readDisplayMode);
  const displayRef = useRef(null);
  useDisplayPreference(tv);
  const displayStyle = useDisplayFit(
    tv && !initializing && !!user && !user.mustChangePassword && !!data,
    displayRef
  );
  const toastTimer = useRef(null),
    searchRef = useRef(null),
    refreshId = useRef(0),
    profileRef = useRef(null);
  const notify = useCallback((message, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const navigate = useCallback((name) => {
    if (name !== 'overview') {
      rememberDisplayChoice(false);
      setTv(false);
    }
    setRoute(name);
    location.hash = name;
    setMobileNav(false);
    setProfileMenu(false);
  }, []);
  async function initialize() {
    setInitializing(true);
    setUnavailable('');
    try {
      const state = await api('/auth/status');
      setSetup(state.setupRequired);
      if (!state.setupRequired) {
        try {
          const response = await api('/auth/me');
          setUser(response.user);
        } catch (e) {
          if (e.status !== 401) throw e;
        }
      }
    } catch {
      setUnavailable(
        'The API is not reachable. Check that the server and MongoDB are running, then retry. You can still explore the demo.'
      );
    } finally {
      setInitializing(false);
    }
  }
  useEffect(() => {
    if (!initialDemo) initialize();
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    const handler = () => {
      const next = location.hash.slice(1);
      if (titleMap[next]) setRoute(next);
    };
    addEventListener('hashchange', handler);
    return () => removeEventListener('hashchange', handler);
  }, []);
  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current;
    try {
      const result = await api('/workspace');
      if (requestId === refreshId.current) {
        setData(result);
        setSyncedAt(new Date());
        setSyncError('');
      }
    } catch (e) {
      if (e.status === 401) {
        setUser(null);
        setData(null);
        setModal(null);
        notify('Your session has expired. Please sign in again.', 'error');
      } else {
        setSyncError(e.message);
        throw e;
      }
    }
  }, [notify]);
  useEffect(() => {
    if (user && !user.mustChangePassword && !demo) {
      refresh().catch(() => {});
      const timer = setInterval(() => {
        if (!document.hidden) refresh().catch(() => {});
      }, 60000);
      return () => {
        clearInterval(timer);
        ++refreshId.current;
      };
    }
  }, [idOf(user), user?.mustChangePassword, demo, refresh]);
  useEffect(() => {
    if (route === 'team' && user?.role === 'admin' && !demo)
      api('/team')
        .then((r) => setTeam(r.users))
        .catch((e) => notify(e.message, 'error'));
  }, [route, user?.role, demo, notify]);
  useEffect(() => {
    function key(e) {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) &&
        !modal
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    function click(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileMenu(false);
    }
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', click);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', click);
    };
  }, [modal]);

  async function logout() {
    if (!demo) {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch (e) {
        notify(e.message, 'error');
        return;
      }
    }
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setUser(null);
    setData(null);
    setDemo(false);
    setModal(null);
    setProfileMenu(false);
    setSearch('');
    ++refreshId.current;
    history.replaceState(null, '', location.pathname);
    setRoute('overview');
    initialize();
  }
  function enterDemo() {
    const sample = makeDemo();
    setDemo(true);
    setData(sample);
    setUser(demoUser);
    setTeam(sample.people);
    setRoute('overview');
    setUnavailable('');
    const params = new URLSearchParams(location.search);
    params.set('demo', '1');
    history.replaceState(null, '', `?${params}#overview`);
  }
  async function toggleTv() {
    rememberDisplayChoice(!tv);
    if (tv) {
      setTv(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    } else {
      navigate('overview');
      setTv(true);
      setModal(null);
      setMobileNav(false);
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        notify('Display mode is on. Use your browser fullscreen control for an edge-to-edge view.');
      }
    }
  }
  async function afterSave(message) {
    notify(message);
    await refresh().catch(() => {
      notify(
        `${message} Refresh failed; use the refresh button to reload your workspace.`,
        'error'
      );
    });
  }
  function demoUpdate(updater, action, target) {
    setData((prev) => {
      const next = updater(prev);
      return {
        ...next,
        activities: [
          {
            id: crypto.randomUUID(),
            actorName: user.name,
            action,
            target,
            createdAt: new Date().toISOString(),
            detail: 'Demo workspace only',
          },
          ...next.activities,
        ].slice(0, 100),
      };
    });
    notify('Updated in demo only. Your company data is unchanged.');
  }
  async function saveSubscription(form, previous) {
    if (demo) {
      const sub = {
        ...form,
        id: previous?.id || crypto.randomUUID(),
        owner: data.people.find((p) => idOf(p) === form.owner),
        files: previous?.files || [],
        createdAt: previous?.createdAt || new Date().toISOString(),
        billingAnchorDay: Number(form.nextBillingDate.slice(-2)),
      };
      demoUpdate(
        (d) => ({
          ...d,
          subscriptions: previous
            ? d.subscriptions.map((s) => (s.id === sub.id ? sub : s))
            : [sub, ...d.subscriptions],
        }),
        previous ? 'updated subscription' : 'added subscription',
        sub.name
      );
    } else {
      await api(previous ? `/subscriptions/${previous.id}` : '/subscriptions', {
        method: previous ? 'PUT' : 'POST',
        body: form,
      });
      await afterSave(previous ? 'Subscription updated' : 'Subscription added');
    }
  }
  async function recordPayment(sub, form) {
    if (demo)
      demoUpdate(
        (d) => {
          const payment = {
            ...form,
            id: crypto.randomUUID(),
            subscription: sub.id,
            subscriptionName: sub.name,
            amount: sub.amount,
            currency: sub.currency,
            paidBy: user,
          };
          const payments = [payment, ...d.payments];
          const paidThisMonth = Object.entries(
            payments
              .filter((p) => p.paidDate.slice(0, 7) === today(d.company.timezone).slice(0, 7))
              .reduce((a, p) => {
                a[p.currency] = (a[p.currency] || 0) + p.amount;
                return a;
              }, {})
          ).map(([_id, total]) => ({ _id, total }));
          return {
            ...d,
            payments,
            paidThisMonth,
            subscriptions: d.subscriptions.map((s) =>
              s.id === sub.id
                ? {
                    ...s,
                    nextBillingDate: advanceDate(s.nextBillingDate, s.cycle, s.billingAnchorDay),
                    status: s.cycle === 'once' ? 'cancelled' : s.autoRenew ? 'active' : 'paused',
                  }
                : s
            ),
          };
        },
        'recorded payment',
        sub.name
      );
    else {
      await api(`/subscriptions/${sub.id}/payments`, { method: 'POST', body: form });
      await afterSave('Payment recorded. Next billing date updated.');
    }
  }
  async function deleteSubscription(sub) {
    if (demo) {
      if (data.payments.some((p) => idOf(p.subscription) === sub.id))
        throw new Error('This subscription has payment history. Cancel it instead.');
      demoUpdate(
        (d) => ({ ...d, subscriptions: d.subscriptions.filter((s) => s.id !== sub.id) }),
        'deleted subscription',
        sub.name
      );
    } else {
      const result = await api(`/subscriptions/${sub.id}`, { method: 'DELETE' });
      await afterSave(
        result.cleanupPending
          ? 'Subscription deleted. Some Cloudinary files need manual cleanup.'
          : 'Subscription deleted'
      );
    }
  }
  async function saveEmployee(form, employee) {
    if (demo) {
      const person = {
        ...form,
        id: employee?.id || crypto.randomUUID(),
        mustChangePassword: !employee || !!form.password,
      };
      delete person.password;
      setTeam((t) => (employee ? t.map((p) => (p.id === person.id ? person : p)) : [...t, person]));
      demoUpdate(
        (d) => ({
          ...d,
          people: employee
            ? d.people.map((p) => (p.id === person.id ? person : p)).filter((p) => p.active)
            : [...d.people, person],
        }),
        employee ? 'updated employee' : 'added employee',
        form.name
      );
    } else {
      await api(employee ? `/team/${idOf(employee)}` : '/team', {
        method: employee ? 'PATCH' : 'POST',
        body: form,
      });
      if (employee && idOf(employee) === idOf(user) && (form.role !== user.role || form.password)) {
        setModal(null);
        setUser(null);
        setData(null);
        notify('Your account was updated. Please sign in again.');
        return;
      }
      const result = await api('/team');
      setTeam(result.users);
      await afterSave(
        employee
          ? 'Employee updated'
          : 'Employee account created. Share their temporary password privately.'
      );
    }
  }
  async function saveCompany(form) {
    if (demo)
      demoUpdate(
        (d) => ({
          ...d,
          company: {
            ...d.company,
            ...form,
            rates: rebaseRates(d.company.rates, form.baseCurrency),
          },
        }),
        'updated workspace settings',
        form.name
      );
    else {
      await api('/company', { method: 'PUT', body: form });
      await afterSave('Workspace settings saved');
    }
  }
  async function refreshCurrencyRates() {
    if (demo) return;
    const result = await api('/company/rates/refresh', { method: 'POST' });
    await refresh();
    if (result.exchangeRates.status === 'current')
      notify('Automatic rates are up to date. The source publishes daily; checks run hourly.');
    else
      notify(
        result.exchangeRates.lastError ||
          'Saved rates are being used while automatic checks continue.',
        'error'
      );
  }
  async function savePassword(form) {
    if (demo) throw new Error('Password changes are available in your real workspace.');
    const result = await api('/auth/password', { method: 'POST', body: form });
    setUser(result.user);
    notify('Password changed. Other sessions have been signed out.');
  }
  async function saveEmail(form) {
    if (demo) throw new Error('Email changes are available in your real workspace.');
    const result = await api('/auth/email', { method: 'POST', body: form });
    setUser(result.user);
    await afterSave(
      'Email changed. Use your new email to sign in. Other sessions have been signed out.'
    );
  }
  async function uploadFile(sub, file, kind) {
    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    const result = await api(`/subscriptions/${sub.id}/files`, { method: 'POST', body });
    await afterSave(
      result.cleanupPending
        ? 'Uploaded. The previous logo needs manual Cloudinary cleanup.'
        : kind === 'logo'
          ? 'Logo updated'
          : 'Document uploaded'
    );
  }
  async function removeFile(sub, file) {
    const result = await api(`/subscriptions/${sub.id}/files/${file.id}`, { method: 'DELETE' });
    await afterSave(
      result.cleanupPending
        ? 'Document removed. The Cloudinary asset needs manual cleanup.'
        : 'Document removed'
    );
  }

  if (initializing)
    return (
      <div className="initial-loading">
        <Mark />
        <Spinner label="Connecting your workspace…" />
      </div>
    );
  if (!user)
    return (
      <>
        <AuthScreen
          setup={setup}
          unavailable={unavailable}
          onRetry={initialize}
          onSuccess={(u) => {
            setUser(u);
            setUnavailable('');
          }}
          onDemo={enterDemo}
        />
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </>
    );
  if (user.mustChangePassword)
    return (
      <div className="initial-loading">
        <Mark />
        <PasswordForm required onClose={() => {}} onSave={savePassword} onLogout={logout} />
      </div>
    );
  if (!data)
    return (
      <div className="initial-loading">
        <Mark />
        {syncError ? (
          <>
            <p className="text-danger">{syncError}</p>
            <Button onClick={() => refresh().catch(() => {})}>Retry workspace</Button>
            <Button variant="ghost" onClick={logout}>
              Sign out
            </Button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  const stats = statsFor(data),
    isAdmin = user.role === 'admin',
    currentRoute = tv
      ? 'overview'
      : ['team', 'settings'].includes(route) && !isAdmin
        ? 'overview'
        : route;
  const sharedProps = {
    data,
    user,
    demo,
    navigate,
    onOpen: (sub) => setModal({ type: 'detail', id: sub.id }),
    onPay: (sub) => setModal({ type: 'payment', sub }),
    onAdd: () => setModal({ type: 'subscription' }),
  };
  const currentSub = modal?.id ? data.subscriptions.find((s) => s.id === modal.id) : null;
  return (
    <div ref={displayRef} style={displayStyle} className={`app-layout ${tv ? 'tv-mode' : ''}`}>
      {mobileNav && (
        <button
          className="sidebar-overlay"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')}>
          <Mark />
          <span>
            subtrack<span className="brand-dot">.</span>
          </span>
        </button>
        <button
          className="workspace-switch"
          onClick={() => (isAdmin ? navigate('settings') : setModal({ type: 'help' }))}
        >
          <span className="company-avatar">CB</span>
          <span>
            <strong>{data.company.name}</strong>
            <small>Company workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={currentRoute === key ? 'active' : ''}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {key === 'subscriptions' && <small>{data.subscriptions.length}</small>}
              {key === 'calendar' && stats.overdue.length > 0 && <i className="nav-alert" />}
            </button>
          ))}
        </nav>
        <div className="nav-label team-label">TEAM & CONTROL</div>
        <nav>
          {isAdmin && (
            <button
              className={currentRoute === 'team' ? 'active' : ''}
              onClick={() => navigate('team')}
            >
              <Users size={19} />
              <span>Team members</span>
            </button>
          )}
          <button
            className={currentRoute === 'activity' ? 'active' : ''}
            onClick={() => navigate('activity')}
          >
            <Activity size={19} />
            <span>Activity log</span>
          </button>
          {isAdmin && (
            <button
              className={currentRoute === 'settings' ? 'active' : ''}
              onClick={() => navigate('settings')}
            >
              <Settings2 size={19} />
              <span>Settings</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="display-mode-card">
            <span className="display-mini-icon">
              <Monitor size={22} />
            </span>
            <strong>Made for the big picture.</strong>
            <p>
              Give your workspace a place
              <br />
              on the big screen.
            </p>
            <button onClick={toggleTv}>
              Launch display mode <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="help-link" onClick={() => setModal({ type: 'help' })}>
            <CircleHelp size={17} /> Workspace guide <ArrowUpRight size={14} />
          </button>
          <div className="profile-area" ref={profileRef}>
            {profileMenu && (
              <div className="profile-menu">
                <span>{user.email}</span>
                <RoleBadge role={user.role} />
                {isAdmin && (
                  <button
                    onClick={() => {
                      setProfileMenu(false);
                      setModal({ type: 'email' });
                    }}
                  >
                    <Mail size={15} />
                    Change email
                  </button>
                )}
                <button
                  onClick={() => {
                    setProfileMenu(false);
                    setModal({ type: 'password' });
                  }}
                >
                  <KeyRound size={15} />
                  Change password
                </button>
                <button onClick={logout}>
                  <LogOut size={15} />
                  {demo ? 'Leave demo' : 'Sign out'}
                </button>
              </div>
            )}
            <button
              className="profile-button"
              onClick={() => setProfileMenu(!profileMenu)}
              aria-expanded={profileMenu}
            >
              <Avatar person={user} />
              <span>
                <strong>{user.name}</strong>
                <small>{ROLE_LABELS[user.role]}</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            {tv ? (
              <>
                <Mark small />
                <strong>{data.company.name}</strong>
                <span className="tv-label">LIVE WORKSPACE</span>
              </>
            ) : (
              <>
                <span>Workspace</span>
                <span className="breadcrumb-divider">/</span>
                <strong>{titleMap[currentRoute]}</strong>
              </>
            )}
          </div>
          <div className="topbar-actions">
            {tv ? (
              <DisplayClock timezone={data.company.timezone} />
            ) : (
              <div className="global-search">
                <Search size={16} />
                <input
                  ref={searchRef}
                  value={search}
                  placeholder="Find a subscription…"
                  aria-label="Search all subscriptions"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (currentRoute !== 'subscriptions') navigate('subscriptions');
                  }}
                />
                <kbd>/</kbd>
              </div>
            )}
            <button
              className="icon-button notification-button"
              aria-label={`${stats.renewals.length} upcoming renewals`}
              title="Renewals to watch"
              onClick={() => setModal({ type: 'notifications' })}
            >
              <Bell size={19} />
              {stats.renewals.length > 0 && <i />}
            </button>
            <button
              className="icon-button fullscreen-button display-toggle"
              title={tv ? 'Exit display mode' : 'Display mode'}
              aria-label={tv ? 'Exit display mode' : 'Launch display mode'}
              onClick={toggleTv}
            >
              {tv ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              <span>{tv ? 'Exit TV' : 'Fit to TV'}</span>
            </button>
            {!tv && user.role !== 'viewer' && (
              <Button icon={Plus} onClick={sharedProps.onAdd}>
                Add subscription
              </Button>
            )}
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <span className="live-dot" />
              <strong>Demo workspace</strong>
              <span>Sample data · changes stay in this session · demo USD rate: 122 BDT</span>
            </span>
            <button onClick={logout}>
              Open real workspace <ArrowRight size={14} />
            </button>
          </div>
        )}
        {syncError && (
          <div className="sync-warning" role="alert">
            <AlertCircle size={16} />
            <span>Showing the last loaded data. {syncError}</span>
            <button onClick={() => refresh().catch(() => {})}>Retry sync</button>
          </div>
        )}
        <main className="main-content" id="main-content">
          {currentRoute === 'overview' && <Overview {...sharedProps} tv={tv} />}{' '}
          {currentRoute === 'subscriptions' && (
            <Subscriptions {...sharedProps} search={search} onSearch={setSearch} />
          )}{' '}
          {currentRoute === 'calendar' && <CalendarPage {...sharedProps} />}{' '}
          {currentRoute === 'reports' && <Reports {...sharedProps} />}{' '}
          {currentRoute === 'team' && (
            <Team
              users={team}
              company={data.company}
              onAdd={() => setModal({ type: 'employee' })}
              onEdit={(employee) => setModal({ type: 'employee', employee })}
            />
          )}{' '}
          {currentRoute === 'activity' && <ActivityPage data={data} />}{' '}
          {currentRoute === 'settings' && (
            <Settings
              company={data.company}
              onSave={saveCompany}
              onRefreshRates={refreshCurrencyRates}
            />
          )}
        </main>
        <div className="sync-status">
          <button
            onClick={() =>
              demo
                ? notify('You’re viewing sample data in the demo workspace.')
                : refresh().catch((e) => notify(e.message, 'error'))
            }
            title="Refresh workspace"
          >
            <RefreshCw size={12} />
            {demo
              ? 'Demo data'
              : `Synced ${syncedAt.toLocaleTimeString('en-GB', { timeZone: data.company.timezone, hour: '2-digit', minute: '2-digit' })}`}
          </button>
          <span>
            SUBTRACK <span className="muted">/</span> {data.company.name}
          </span>
        </div>
      </div>
      {modal?.type === 'subscription' && (
        <SubscriptionForm
          sub={modal.sub}
          data={data}
          user={user}
          onClose={() => setModal(null)}
          onSave={saveSubscription}
        />
      )}
      {modal?.type === 'payment' && (
        <PaymentForm
          sub={modal.sub}
          company={data.company}
          onClose={() => setModal(null)}
          onSave={recordPayment}
        />
      )}
      {modal?.type === 'detail' && currentSub && (
        <DetailModal
          key={currentSub.id}
          sub={currentSub}
          data={data}
          user={user}
          demo={demo}
          onClose={() => setModal(null)}
          onEdit={(sub) => setModal({ type: 'subscription', sub })}
          onPay={sharedProps.onPay}
          onDelete={(sub) => setModal({ type: 'delete', sub })}
          onUpload={uploadFile}
          onRemoveFile={removeFile}
        />
      )}
      {modal?.type === 'employee' && (
        <EmployeeForm
          employee={modal.employee}
          company={data.company}
          onClose={() => setModal(null)}
          onSave={saveEmployee}
        />
      )}
      {modal?.type === 'password' && (
        <PasswordForm onClose={() => setModal(null)} onSave={savePassword} />
      )}
      {modal?.type === 'email' && isAdmin && (
        <EmailForm user={user} onClose={() => setModal(null)} onSave={saveEmail} />
      )}
      {modal?.type === 'delete' && (
        <ConfirmModal
          title={`Delete ${modal.sub.name}?`}
          text="This removes the subscription and its files. Subscriptions with payment history must be cancelled instead so your financial records remain intact."
          onClose={() => setModal(null)}
          onConfirm={() => deleteSubscription(modal.sub)}
        />
      )}
      {modal?.type === 'notifications' && (
        <Modal
          title="Renewals to watch"
          subtitle="Upcoming in the next 7 days, plus anything overdue."
          onClose={() => setModal(null)}
        >
          <div className="modal-body">
            <RenewalsList
              items={stats.renewals}
              now={stats.now}
              onOpen={sharedProps.onOpen}
              limit={100}
            />
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setModal(null);
                  navigate('calendar');
                }}
              >
                View full calendar <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'help' && (
        <Modal
          title="A clearer way to keep track"
          subtitle={`Your guide to ${data.company.name}’s workspace.`}
          onClose={() => setModal(null)}
        >
          <div className="modal-body guide-body">
            <p>
              <strong>Overview</strong> brings subscriptions, spending and the next 7 days of
              renewals together. The dashboard refreshes every minute while this tab is visible.
            </p>
            <p>
              <strong>Subscriptions</strong> keeps original purchase currencies. Dashboard totals
              use reference rates automatically synced from ExchangeRate-API. Rates are checked
              hourly, with new source data published daily. If a check fails, the last saved rates
              stay available and their status is shown.
            </p>
            <p>
              <strong>Mark paid</strong> records an existing payment and moves the billing date
              forward by one cycle. It does not charge a card.
            </p>
            <p>
              <strong>Display mode</strong> opens a streamlined dashboard for your company screen.
              The dashboard fits inside the TV edges and remembers this mode after a reload. Choose
              Exit TV to return to the standard workspace.
            </p>
            <div className="guide-role">
              <ShieldCheck size={20} />
              <span>
                Your role: <strong>{ROLE_LABELS[user.role]}</strong>
                <small>
                  {
                    {
                      admin: 'You can manage the full workspace, settings and team.',
                      manager: 'You can manage every subscription and payment.',
                      member: 'You can view everything and manage subscriptions assigned to you.',
                      viewer: 'You have read-only access to the workspace.',
                    }[user.role]
                  }
                </small>
              </span>
            </div>
            <div className="keyboard-tip">
              <kbd>/</kbd> Jump to subscription search
            </div>
          </div>
        </Modal>
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
function Toast({ toast, onClose }) {
  return (
    <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{toast.message}</span>
      <button onClick={onClose} aria-label="Dismiss notification">
        <X size={16} />
      </button>
    </div>
  );
}
function DisplayClock({ timezone }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <time className="tv-clock">
      {time.toLocaleTimeString('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}
      <small>{timezone}</small>
    </time>
  );
}
