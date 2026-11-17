import { mkdir, writeFile } from 'node:fs/promises';

// Original synthesized tones, with fades to avoid clicks; no external audio assets.
const sampleRate = 22050;
const patterns = {
  overdue: {
    duration: 2.8,
    notes: [
      [0, 0.28, 880],
      [0.35, 0.28, 660],
      [0.8, 0.28, 880],
      [1.15, 0.28, 660],
      [1.6, 0.28, 880],
      [1.95, 0.5, 660],
    ],
  },
  upcoming: {
    duration: 2.4,
    notes: [
      [0, 0.55, 523.25],
      [0.3, 0.65, 659.25],
      [0.65, 1.2, 783.99],
    ],
  },
};
const directory = new URL('../public/sounds/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [type, { duration, notes }] of Object.entries(patterns)) {
  const samples = Math.ceil(duration * sampleRate);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / sampleRate;
    let value = 0;
    for (const [start, length, frequency] of notes) {
      const t = time - start;
      if (t < 0 || t > length) continue;
      const fade = Math.min(1, t / 0.015, (length - t) / 0.06);
      const decay = type === 'upcoming' ? Math.exp((-3 * t) / length) : 1;
      value +=
        0.24 *
        fade *
        decay *
        (Math.sin(2 * Math.PI * frequency * t) + 0.18 * Math.sin(4 * Math.PI * frequency * t));
    }
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  await writeFile(new URL(`${type}.wav`, directory), wav);
  console.log(`Generated ${type}.wav (${duration}s)`);
}
