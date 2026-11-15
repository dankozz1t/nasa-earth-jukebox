import type { Soundscape } from "../../../shared/api/aerosols";
import { formatLat, formatLon, longitudeRegion, placeName, xToLon, yToLat } from "./geo";
import { layerText, t, VOICE_NAME, getLang } from "../../../shared/i18n";

function level(strength: number): string {
  if (strength > 0.75) return t("level.strong");
  if (strength > 0.4) return t("level.clear");
  return t("level.faint");
}

// North plays higher: position 0 (top of the map) is high, 1 (bottom) is low.
function pitchWord(position: number): string {
  if (position < 0.38) return t("pitch.high");
  if (position > 0.62) return t("pitch.low");
  return t("pitch.mid");
}

function stepLon(s: Soundscape, step: number): number {
  return xToLon((step + 0.5) / s.bins);
}

function placeNear(lon: number, y: number | null): string {
  return y === null ? longitudeRegion(lon) : placeName(lon, yToLat(y));
}

function sentence(head: string, parts: string[]): string {
  return parts.length ? `${head} ${parts.join("; ")}.` : t("step.clean", { head });
}

function activeLayers(s: Soundscape, step: number) {
  const st = s.steps[step];

  return s.layers
    .map((l, k) => ({ l, k, v: st.strength[k], y: s.profiles[k].position[step] }))
    .filter((e) => e.v > 0)
    .sort((a, b) => b.v - a.v);
}

export function describeStep(s: Soundscape, step: number): string {
  const lon = stepLon(s, step);
  const head = `${formatLon(lon)}, ${longitudeRegion(lon)}.`;

  const parts = activeLayers(s, step).map((e) =>
    t("step.near", {
      layer: layerText(e.l.key).label,
      level: level(e.v),
      place: placeNear(lon, e.y),
    }),
  );

  return sentence(head, parts);
}

function strongestStep(s: Soundscape, layer: number, from: number, to: number): number {
  let best = -1;

  for (let b = from; b < to; b++) {
    const v = s.steps[b].strength[layer];
    const stronger = best < 0 || v > s.steps[best].strength[layer];
    if (v > 0 && stronger) best = b;
  }

  return best;
}

// Steps [from, to) in one sentence: one line per 0.5 s step is unreadable in captions and transcripts.
export function describeRange(s: Soundscape, from: number, to: number): string {
  const lon0 = xToLon(from / s.bins);
  const lon1 = xToLon(to / s.bins);
  const head = `${formatLon(lon0)} – ${formatLon(lon1)}, ${longitudeRegion((lon0 + lon1) / 2)}.`;
  const strengthAt = (e: { k: number; best: number }) => s.steps[e.best].strength[e.k];

  const parts = s.layers
    .map((l, k) => ({ l, k, best: strongestStep(s, k, from, to) }))
    .filter((e) => e.best >= 0)
    .sort((a, b) => strengthAt(b) - strengthAt(a))
    .map((e) => {
      const lon = stepLon(s, e.best);

      return t("step.near", {
        layer: layerText(e.l.key).label,
        level: level(strengthAt(e)),
        place: placeNear(lon, s.profiles[e.k].position[e.best]),
      });
    });

  return sentence(head, parts);
}

export function captionLines(s: Soundscape, step: number): string[] {
  const lines = activeLayers(s, step).map((e) =>
    t("caption.voice", {
      voice: VOICE_NAME[getLang()][e.l.key] ?? e.l.key,
      layer: layerText(e.l.key).label,
      pitch: e.y === null ? t("pitch.mid") : pitchWord(e.y),
      level: level(e.v),
    }),
  );

  return lines.length ? lines : [t("captions.silence")];
}

export function describeSpot(s: Soundscape, xFrac: number, yFrac: number, mix: number[]): string {
  const lon = xToLon(xFrac);
  const lat = yToLat(yFrac);

  const found = s.layers
    .map((l, k) => ({ l, v: mix[k] }))
    .filter((e) => e.v >= 0.02)
    .sort((a, b) => b.v - a.v)
    .map((e) => `${layerText(e.l.key).label} ${Math.round(e.v * 100)}%`);

  const where = `${capitalize(placeName(lon, lat))} (${formatLat(lat)}, ${formatLon(lon)})`;
  return found.length ? `${where}: ${found.join(", ")}` : t("spot.none", { where });
}

function indexOfMax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

export function summarize(
  s: Soundscape,
): { key: string; label: string; color: string; text: string }[] {
  return s.layers.map((l, k) => {
    const lt = layerText(l.key);
    const entry = { key: l.key, label: lt.label, color: l.color };

    if (l.pixelCount === 0) {
      return { ...entry, text: t("sum.notFound", { about: lt.about }) };
    }

    const profile = s.profiles[k];
    const best = indexOfMax(profile.coverage);
    const lon = stepLon(s, best);
    const y = profile.position[best];
    const place =
      y === null
        ? longitudeRegion(lon)
        : `${placeName(lon, yToLat(y))} (${formatLat(yToLat(y))}, ${formatLon(lon)})`;

    const text = t("sum.text", {
      share: (l.share * 100).toFixed(1),
      place,
      voice: lt.voice,
      about: lt.about,
    });
    return { ...entry, text };
  });
}

export function mapSentence(s: Soundscape): string {
  const present = s.layers.filter((l) => l.pixelCount > 0).sort((a, b) => b.share - a.share);
  const top = present
    .slice(0, 2)
    .map((l) => `${layerText(l.key).label} ${(l.share * 100).toFixed(0)}%`)
    .join(", ");

  return t("mapsum", { count: present.length, top });
}

// Samples every second pixel.
export function localMix(
  classMap: Uint8Array,
  width: number,
  height: number,
  layers: number,
  x: number,
  y: number,
  radius = 24,
): number[] {
  const top = Math.max(0, Math.floor(y - radius));
  const bottom = Math.min(height - 1, Math.ceil(y + radius));
  const left = Math.max(0, Math.floor(x - radius));
  const right = Math.min(width - 1, Math.ceil(x + radius));

  const counts = new Array<number>(layers).fill(0);
  let total = 0;

  for (let yy = top; yy <= bottom; yy += 2) {
    for (let xx = left; xx <= right; xx += 2) {
      total++;
      const c = classMap[yy * width + xx];
      if (c) counts[c - 1]++;
    }
  }

  return counts.map((v) => (total ? v / total : 0));
}

// The class map PNG stores classes as 0, 50, 100, 150, 200; rounding absorbs tiny decode differences.
export function decodeClassMap(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round(rgba[i * 4] / 50);
  }
  return out;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
