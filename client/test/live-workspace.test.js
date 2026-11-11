import test from 'node:test';
import assert from 'node:assert/strict';
import { startWorkspaceSync } from '../src/live-workspace.js';

function harness(refresh, { live = true, supported = true } = {}) {
  const timeouts = new Map(),
    intervals = new Map(),
    sources = [];
  let id = 0;
  const timers = {
    setTimeout(fn) {
      const key = ++id;
      timeouts.set(key, fn);
      return key;
    },
    clearTimeout(key) {
      timeouts.delete(key);
    },
    setInterval(fn, ms) {
      const key = ++id;
      intervals.set(key, { fn, ms });
      return key;
    },
    clearInterval(key) {
      intervals.delete(key);
    },
  };
  class FakeSource extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
    send(name) {
      this.dispatchEvent(new Event(name));
    }
  }
  const documentObject = new EventTarget(),
    windowObject = new EventTarget();
  documentObject.hidden = false;
  const stop = startWorkspaceSync(refresh, {
    live,
    EventSourceClass: supported ? FakeSource : null,
    documentObject,
    windowObject,
    timers,
  });
  return {
    sources,
    timeouts,
    intervals,
    documentObject,
    windowObject,
    stop,
    flush() {
      const batch = [...timeouts.values()];
      timeouts.clear();
      batch.forEach((fn) => fn());
    },
    tick() {
      [...intervals.values()].forEach(({ fn }) => fn());
    },
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test('TV changes and reconnects refetch data without overlapping requests or dropping a later edit', async () => {
  let calls = 0,
    finish;
  const h = harness(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  assert.equal(calls, 1);
  assert.equal(h.sources[0].url, '/api/workspace/events');
  h.sources[0].send('workspace-changed');
  h.sources[0].send('workspace-changed');
  assert.equal(h.timeouts.size, 1);
  h.flush();
  assert.equal(calls, 1, 'No parallel refresh while the first request is running');
  finish();
  await settle();
  assert.equal(calls, 2, 'A change during the request must trigger a follow-up snapshot');
  finish();
  await settle();
  h.sources[0].send('ready');
  h.flush();
  assert.equal(calls, 3, 'Reconnect refreshes changes missed while offline');
  h.stop();
  finish();
  await settle();
  h.sources[0].send('workspace-changed');
  h.flush();
  assert.equal(calls, 3);
  assert.equal(h.sources[0].closed, true);
  assert.equal(h.intervals.size, 0);
});

test('TV browsers without streaming support and failed connections retain backup sync', async () => {
  let calls = 0;
  const h = harness(
    async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
    },
    { supported: false }
  );
  await settle();
  assert.equal([...h.intervals.values()][0].ms, 15000);
  h.tick();
  await settle();
  assert.equal(calls, 2);
  h.stop();
  h.tick();
  assert.equal(calls, 2);
});

test('hidden displays catch up on visibility and online events without continuing after cleanup', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
  });
  await settle();
  h.documentObject.hidden = true;
  h.sources[0].send('workspace-changed');
  h.flush();
  h.tick();
  assert.equal(calls, 1);
  h.documentObject.hidden = false;
  h.documentObject.dispatchEvent(new Event('visibilitychange'));
  h.flush();
  await settle();
  assert.equal(calls, 2);
  h.windowObject.dispatchEvent(new Event('online'));
  h.flush();
  await settle();
  assert.equal(calls, 3);
  h.stop();
  h.windowObject.dispatchEvent(new Event('online'));
  h.flush();
  assert.equal(calls, 3);
});

test('regular workspace mode keeps periodic sync without opening a TV event connection', async () => {
  const h = harness(async () => {}, { live: false });
  assert.equal(h.sources.length, 0);
  assert.equal([...h.intervals.values()][0].ms, 60000);
  h.stop();
  await settle();
});
