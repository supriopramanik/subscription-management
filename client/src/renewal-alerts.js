import { daysUntil, isLive } from './lib.js';

export const ALERT_TIMEZONE = 'Asia/Dhaka';
export const ALERT_DURATION_MS = 10000;
export const SOUND_URLS = {
  overdue: '/sounds/overdue.wav',
  upcoming: '/sounds/upcoming.wav',
};

export function renewalAlertGroups(subscriptions, date) {
  const groups = { overdue: [], upcoming: [] };
  for (const sub of subscriptions.filter(isLive)) {
    const days = daysUntil(sub.nextBillingDate, date);
    if (days < 0) groups.overdue.push(sub);
    else if (days <= 7) groups.upcoming.push(sub);
  }
  return groups;
}

export function dailyAlertPlan(subscriptions, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ALERT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value])
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const groups = renewalAlertGroups(subscriptions, date);
  return {
    date,
    // No late or overnight surprise alerts after reopening a sleeping browser.
    due: parts.hour === '11' && parts.minute === '00',
    groups,
    types: ['overdue', 'upcoming'].filter((type) => groups[type].length > 0),
  };
}

// The caller holds a Web Lock so separate tabs share one daily delivery receipt.
export async function deliverDailyAlert({ plan, key, storage, played, play }) {
  if (!plan.due || !plan.types.length || played.has(key)) return false;
  try {
    if (storage?.getItem(key)) return false;
  } catch {
    /* Memory fallback. */
  }
  await play(plan.types);
  played.add(key);
  try {
    storage?.setItem(key, '1');
  } catch {
    /* Memory fallback. */
  }
  return true;
}

export function createRenewalAudio(host = globalThis) {
  let context;
  const buffers = new Map();
  let sources = [];
  function stop() {
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {}
    });
    sources = [];
  }
  async function unlock() {
    const AudioContext = host.AudioContext || host.webkitAudioContext;
    if (!AudioContext) throw new Error('This browser does not support notification sounds.');
    context ||= new AudioContext();
    await context.resume();
    if (context.state !== 'running') throw new Error('Click Enable sounds to allow audio.');
    await Promise.all(
      Object.entries(SOUND_URLS).map(async ([type, url]) => {
        if (buffers.has(type)) return;
        const response = await host.fetch(url);
        if (!response.ok) throw new Error('Could not load notification sounds. Please retry.');
        buffers.set(type, await context.decodeAudioData(await response.arrayBuffer()));
      })
    );
  }
  return {
    unlock,
    stop,
    ready: () => context?.state === 'running' && buffers.size === 2,
    async play(types) {
      await unlock();
      stop();
      let start = context.currentTime + 0.05;
      const deadline = context.currentTime + ALERT_DURATION_MS / 1000;
      // Schedule the stop on the audio clock, even if a background tab's JS timer is delayed.
      for (let i = 0; types.length && start < deadline; i++) {
        const type = types[i % types.length];
        const source = context.createBufferSource();
        source.buffer = buffers.get(type);
        source.connect(context.destination);
        source.start(start);
        source.stop(Math.min(start + source.buffer.duration, deadline));
        sources.push(source);
        start += source.buffer.duration + 0.6;
      }
    },
    close() {
      stop();
      const previous = context;
      context = null;
      buffers.clear();
      return previous?.close();
    },
  };
}
