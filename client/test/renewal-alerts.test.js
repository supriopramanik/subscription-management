import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  dailyAlertPlan,
  renewalAlertGroups,
  createRenewalAudio,
  deliverDailyAlert,
} from '../src/renewal-alerts.js';

const sub = (date, status = 'active') => ({ nextBillingDate: date, status });
test('daily delivery survives reloads, retries failures and becomes eligible the next day', async () => {
  const receipts = new Map();
  const storage = {
    getItem: (key) => receipts.get(key),
    setItem: (key, value) => receipts.set(key, value),
  };
  let played = new Set(),
    count = 0;
  let plan = dailyAlertPlan([sub('2026-11-14')], new Date('2026-11-17T05:00:00Z'));
  const play = async () => {
    count++;
  };
  const args = () => ({ plan, key: plan.date, storage, played, play });
  assert.equal(await deliverDailyAlert(args()), true);
  assert.equal(await deliverDailyAlert(args()), false);
  played = new Set();
  assert.equal(await deliverDailyAlert(args()), false);
  plan = dailyAlertPlan([sub('2026-11-14')], new Date('2026-11-18T05:00:00Z'));
  await assert.rejects(
    deliverDailyAlert({
      ...args(),
      play: async () => {
        throw new Error('blocked');
      },
    })
  );
  assert.equal(receipts.has(plan.date), false);
  assert.equal(await deliverDailyAlert(args()), true);
  assert.equal(count, 2);
});
test('renewal sounds split overdue from today through seven days and exclude inactive plans', () => {
  const groups = renewalAlertGroups(
    [
      sub('2026-11-16'),
      sub('2026-11-17'),
      sub('2026-11-24', 'trial'),
      sub('2026-11-25'),
      sub('2026-11-16', 'paused'),
      sub('2026-11-18', 'cancelled'),
    ],
    '2026-11-17'
  );
  assert.equal(groups.overdue.length, 1);
  assert.equal(groups.upcoming.length, 2);
});
test('daily sounds are scheduled at 11 AM Dhaka irrespective of host timezone', () => {
  const subscriptions = [sub('2026-11-14'), sub('2026-11-20')];
  assert.equal(dailyAlertPlan(subscriptions, new Date('2026-11-17T04:59:59Z')).due, false);
  const plan = dailyAlertPlan(subscriptions, new Date('2026-11-17T05:00:00Z'));
  assert.equal(plan.due, true);
  assert.equal(plan.date, '2026-11-17');
  assert.deepEqual(plan.types, ['overdue', 'upcoming']);
  assert.equal(dailyAlertPlan(subscriptions, new Date('2026-11-17T05:00:59Z')).due, true);
  assert.equal(dailyAlertPlan(subscriptions, new Date('2026-11-17T05:01:00Z')).due, false);
  assert.equal(dailyAlertPlan(subscriptions, new Date('2026-11-18T05:00:00Z')).due, true);
  assert.deepEqual(dailyAlertPlan([], new Date('2026-11-17T05:00:00Z')).types, []);
  assert.deepEqual(dailyAlertPlan([sub('2026-11-20')], new Date('2026-11-17T05:00:00Z')).types, [
    'upcoming',
  ]);
});
test('audio repeats in order, stops at ten seconds on the audio clock and supports early dismissal', async () => {
  const starts = [],
    stopped = [],
    requested = [];
  class AudioContext {
    state = 'suspended';
    currentTime = 10;
    async resume() {
      this.state = 'running';
    }
    async decodeAudioData() {
      return { duration: 4 };
    }
    createBufferSource() {
      const index = starts.length;
      return {
        connect() {},
        start(time) {
          starts.push(time);
        },
        stop(time) {
          stopped.push({ index, time });
        },
      };
    }
    async close() {
      this.state = 'closed';
    }
  }
  const audio = createRenewalAudio({
    AudioContext,
    fetch: async (url) => {
      requested.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    },
  });
  assert.equal(audio.ready(), false);
  await audio.play(['overdue', 'upcoming']);
  assert.equal(audio.ready(), true);
  assert.deepEqual(starts, [10.05, 14.65, 19.25]);
  assert.equal(stopped.at(-1).time, 20);
  assert.ok(stopped.every(({ time }) => time <= 20));
  await audio.play(['upcoming']);
  assert.equal(requested.length, 2);
  assert.equal(stopped.filter(({ time }) => time === undefined).length, 3);
  audio.stop();
  assert.equal(stopped.filter(({ time }) => time === undefined).length, 6);
  await audio.close();
  assert.equal(audio.ready(), false);
});
test('failed audio loading is reported and may be retried', async () => {
  class AudioContext {
    state = 'running';
    async resume() {}
    async close() {}
  }
  const audio = createRenewalAudio({ AudioContext, fetch: async () => ({ ok: false }) });
  await assert.rejects(audio.unlock(), /Could not load/);
  assert.equal(audio.ready(), false);
  await audio.close();
});
test('both shipped sound files contain distinct, non-silent PCM samples', async () => {
  const files = await Promise.all(
    ['overdue', 'upcoming'].map(async (type) => {
      const file = await readFile(new URL(`../public/sounds/${type}.wav`, import.meta.url));
      assert.equal(file.toString('ascii', 0, 4), 'RIFF');
      assert.equal(file.toString('ascii', 8, 12), 'WAVE');
      assert.equal(file.readUInt16LE(34), 16);
      assert.ok(file.subarray(44).some((byte) => byte !== 0));
      return file;
    })
  );
  assert.notDeepEqual(files[0], files[1]);
});
