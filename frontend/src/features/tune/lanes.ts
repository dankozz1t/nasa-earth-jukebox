import { isWeather, type AnySoundscape } from "../presets";

export const LIVE_BINS = 48;

function normalized(row: number[]): number[] {
  const max = Math.max(0, ...row);
  return max > 0 ? row.map((v) => v / max) : row;
}

function resample(values: readonly number[], n: number): number[] {
  if (values.length === 0) return new Array<number>(n).fill(0);

  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i / n) * values.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / n) * values.length));
    const slice = values.slice(from, to);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

// 0..1 per stem key. A live part without notes (the rain or wind texture) follows the data level along
// the wave, which is what drives it.
export function laneLevels(s: AnySoundscape): Record<string, number[]> {
  if (!isWeather(s)) {
    return Object.fromEntries(
      s.layers.map((l, k) => [
        l.key,
        s.steps.map((st) => Math.max(0, Math.min(1, st.strength[k] ?? 0))),
      ]),
    );
  }

  const out: Record<string, number[]> = {};
  const dur = s.durationSec > 0 ? s.durationSec : 1;
  const binAt = (time: number) => Math.floor((time / dur) * LIVE_BINS);

  for (const part of s.parts) {
    const row = new Array<number>(LIVE_BINS).fill(0);
    for (const n of s.notes) {
      if (n.part !== part.key) continue;

      const loud = n.velocity > 1 ? n.velocity / 127 : n.velocity;
      const first = Math.max(0, binAt(n.time));
      const last = Math.min(LIVE_BINS - 1, binAt(n.time + Math.max(n.duration, 0.25)));
      for (let i = first; i <= last; i++) row[i] += loud;
    }

    out[part.key] = row.some((v) => v > 0) ? normalized(row) : resample(s.path.level, LIVE_BINS);
  }

  return out;
}

export function chordAt(s: AnySoundscape, position: number): string | undefined {
  if (position < 0 || position >= s.durationSec) return undefined;

  if (!isWeather(s)) {
    const step = Math.min(s.bins - 1, Math.floor(position / s.stepSec));
    return s.steps[step]?.chord;
  }

  const barSec = s.tempoBpm > 0 && s.beatsPerBar > 0 ? (60 / s.tempoBpm) * s.beatsPerBar : 0;
  if (!barSec || !s.bars?.length) return undefined;

  const bar = Math.floor(position / barSec);
  const match = s.bars.find((b) => b.bar === bar) ?? s.bars[Math.min(bar, s.bars.length - 1)];
  return match?.chord;
}
