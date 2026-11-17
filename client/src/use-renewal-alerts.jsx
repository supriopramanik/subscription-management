import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ALERT_DURATION_MS,
  createRenewalAudio,
  dailyAlertPlan,
  deliverDailyAlert,
} from './renewal-alerts';

export function useRenewalAlerts({ subscriptions, enabled, scope, notify }) {
  const audio = useRef(null);
  const current = useRef(null);
  current.current = { subscriptions, enabled, scope, notify };
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const enable = useCallback(async () => {
    try {
      audio.current ||= createRenewalAudio();
      await audio.current.unlock();
      setReady(true);
      setError('');
    } catch (e) {
      setReady(false);
      setError(e.message);
    }
  }, []);
  const test = useCallback(async (type) => {
    try {
      audio.current ||= createRenewalAudio();
      await audio.current.play([type]);
      current.current.notify(
        `${type === 'overdue' ? 'Overdue alert' : '7-day reminder'} sound test · stops after 10 seconds.`,
        type === 'overdue' ? 'error' : 'success',
        { duration: ALERT_DURATION_MS, onDismiss: () => audio.current?.stop() }
      );
      setReady(true);
      setError('');
    } catch (e) {
      setReady(false);
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let busy = false;
    const played = new Set();
    const check = async () => {
      const latest = current.current;
      if (disposed || busy || !latest.enabled) return;
      if (!audio.current?.ready()) {
        setReady(false);
        return;
      }
      const plan = dailyAlertPlan(latest.subscriptions);
      if (!plan.due || !plan.types.length) return;
      const key = `subtrack-daily-sound:${latest.scope}:${plan.date}`;
      busy = true;
      const deliver = async () => {
        if (disposed) return;
        let storage;
        try {
          storage = localStorage;
        } catch {
          /* Memory fallback. */
        }
        const delivered = await deliverDailyAlert({
          plan,
          key,
          storage,
          played,
          play: (types) => audio.current.play(types),
        });
        if (!delivered) return;
        try {
          // Keep only the latest daily receipt for this workspace and browser.
          const prefix = `subtrack-daily-sound:${latest.scope}:`;
          Object.keys(storage || {})
            .filter((k) => k.startsWith(prefix) && k !== key)
            .forEach((k) => storage.removeItem(k));
        } catch {
          /* Sound still works without persistent storage. */
        }
        latest.notify(
          `${plan.groups.overdue.length} overdue; ${plan.groups.upcoming.length} due within 7 days.`,
          plan.groups.overdue.length ? 'error' : 'success',
          { duration: ALERT_DURATION_MS, onDismiss: () => audio.current?.stop() }
        );
      };
      try {
        if (navigator.locks?.request) await navigator.locks.request(key, deliver);
        else await deliver();
      } catch (e) {
        setReady(false);
        setError(e.message);
      } finally {
        busy = false;
      }
    };
    // Browsers require a user gesture before sound can be armed, including on TVs.
    const arm = () => {
      enable();
    };
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 10000);
    check();
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      document.removeEventListener('visibilitychange', check);
      audio.current?.close()?.catch(() => {});
      audio.current = null;
    };
  }, [enabled, scope, enable]);
  return { ready, error, enable, test };
}
