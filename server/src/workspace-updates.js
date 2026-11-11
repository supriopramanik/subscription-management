import { EventEmitter } from 'node:events';

const collections = [
  'subtrack_companies',
  'subtrack_subscriptions',
  'subtrack_payments',
  'subtrack_users',
  'subtrack_activities',
  'subtrack_exchange_rates',
];

export function createWorkspaceUpdates({ debounceMs = 100, retryMs = 5000 } = {}) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  let pending,
    retry,
    stream,
    connection,
    stopped = false;
  const publish = () => {
    if (stopped || pending) return;
    pending = setTimeout(() => {
      pending = null;
      events.emit('change');
    }, debounceMs);
    pending.unref?.();
  };
  const watch = () => {
    if (stopped || !connection?.db) return;
    try {
      const current = connection.db.watch([{ $match: { 'ns.coll': { $in: collections } } }], {
        maxAwaitTimeMS: 1000,
      });
      stream = current;
      const reconnect = () => {
        if (stopped || stream !== current) return;
        stream = null;
        current.close().catch(() => {});
        // Refetch on recovery as notifications may have been missed.
        publish();
        retry = setTimeout(watch, retryMs);
        retry.unref?.();
      };
      current.on('change', publish);
      current.on('error', reconnect);
      current.on('close', reconnect);
      publish();
    } catch {
      retry = setTimeout(watch, retryMs);
      retry.unref?.();
    }
  };
  return {
    publish,
    subscribe(onChange, onClose = () => {}) {
      events.on('change', onChange);
      events.on('shutdown', onClose);
      return () => {
        events.off('change', onChange);
        events.off('shutdown', onClose);
      };
    },
    start(mongoConnection) {
      if (stream || retry) return;
      connection = mongoConnection;
      stopped = false;
      watch();
    },
    async stop() {
      stopped = true;
      clearTimeout(pending);
      clearTimeout(retry);
      pending = retry = null;
      events.emit('shutdown');
      const current = stream;
      stream = null;
      await current?.close().catch(() => {});
    },
  };
}

export const workspaceUpdates = createWorkspaceUpdates();
