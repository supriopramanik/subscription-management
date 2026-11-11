// Notifications invalidate the snapshot; normal authenticated API requests load
// the data. Reconnects and periodic checks also recover any missed notifications.
export function startWorkspaceSync(
  refresh,
  {
    live = false,
    EventSourceClass = globalThis.EventSource,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    timers = globalThis,
  } = {}
) {
  let active = true,
    inFlight = false,
    pending = false,
    queued,
    source;
  const sync = async () => {
    if (!active) return;
    if (documentObject.hidden || inFlight) {
      pending = true;
      return;
    }
    pending = false;
    inFlight = true;
    try {
      await refresh();
    } catch {
      // The existing workspace error UI reports failure; keep retrying safely.
    } finally {
      inFlight = false;
      if (active && pending && !documentObject.hidden) void sync();
    }
  };
  const schedule = () => {
    if (!active || queued) return;
    queued = timers.setTimeout(() => {
      queued = null;
      void sync();
    }, 100);
  };
  const visible = () => {
    if (!documentObject.hidden) schedule();
  };
  if (live && typeof EventSourceClass === 'function') {
    try {
      source = new EventSourceClass('/api/workspace/events');
      source.addEventListener('ready', schedule);
      source.addEventListener('workspace-changed', schedule);
      source.addEventListener('session-expired', () => {
        source.close();
        schedule();
      });
      source.onerror = schedule;
    } catch {
      // Older TV browsers still receive the periodic snapshot checks.
    }
  }
  const interval = timers.setInterval(() => void sync(), live ? 15000 : 60000);
  documentObject.addEventListener('visibilitychange', visible);
  windowObject.addEventListener('focus', visible);
  windowObject.addEventListener('online', visible);
  void sync();
  return () => {
    active = false;
    timers.clearTimeout(queued);
    timers.clearInterval(interval);
    source?.close();
    documentObject.removeEventListener('visibilitychange', visible);
    windowObject.removeEventListener('focus', visible);
    windowObject.removeEventListener('online', visible);
  };
}
