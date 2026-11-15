import { getPlayer } from "../../audio/player-instance";
import { vibrateFor } from "../../audio/narrator";
import { ProbeVoice } from "../../audio/probe-voice";
import {
  normalize,
  type Soundscape,
  type WeatherGrid,
  type WeatherSection,
  type WeatherSoundscape,
} from "../../shared/api";
import type { Lang } from "../../shared/i18n";
import { describeSpot, describeStep, localMix, mapSentence } from "../aerosols";
import { describeWeatherPoint, panFor, sampleGrid } from "../live/model/describe-weather";
import { BED } from "../presets";
import { currentStep } from "./draw-aerosols";
import { clampProbe, currentFrac, MAX_LAT, pathPoint, type LatLon } from "./draw-weather";

export type Muted = Record<string, boolean>;

const SPOT_GAP_MS = 160;
let lastSpot = 0;
let probeVoice: ProbeVoice | null = null;

// Muted layers silenced, so descriptions match what is heard.
export function audible(s: Soundscape, muted: Muted): Soundscape {
  return {
    ...s,
    steps: s.steps.map((st) => ({
      ...st,
      strength: st.strength.map((v, k) => (muted[s.layers[k].key] ? 0 : v)),
    })),
  };
}

export function columnX(s: Soundscape, step: number): number {
  return ((step + 0.5) / s.bins) * s.width;
}

// x and y in frame pixels.
export function aerosolSpot(
  s: Soundscape,
  classMap: Uint8Array,
  x: number,
  y: number,
): { text: string; mix: number[] } {
  const mix = localMix(classMap, s.width, s.height, s.layers.length, x, y);

  return { text: describeSpot(s, x / s.width, y / s.height, mix), mix };
}

// Only once the player holds a piece, so no AudioContext appears before a gesture.
export function soundAerosolSpot(
  s: Soundscape,
  x: number,
  mix: number[],
  muted: Muted,
  vibrate: boolean,
): void {
  const player = getPlayer();
  const now = performance.now();
  if (player.playing || !player.ready || now - lastSpot < SPOT_GAP_MS) return;

  lastSpot = now;

  const weights: Record<string, number> = { [BED]: 0.25 };
  s.layers.forEach((l, k) => {
    const heard = mix[k] > 0.02 && !muted[l.key];
    weights[l.key] = heard ? 0.4 + mix[k] * 1.5 : 0;
  });

  const column = Math.min(s.bins - 1, Math.floor((x / s.width) * s.bins));
  void player.spot((column + 0.5) * s.stepSec, weights);

  if (vibrate) {
    vibrateFor(mix.map((v, k) => (muted[s.layers[k].key] ? 0 : Math.min(1, v * 2))));
  }
}

// "Where am I": the step under the playhead, else the last spot, else the whole map.
export function aerosolNowText(
  s: Soundscape,
  position: number,
  playing: boolean,
  muted: Muted,
  lastSpotText: string,
): string {
  const step = currentStep(s, position, playing);
  if (step >= 0) return describeStep(audible(s, muted), step);
  return lastSpotText || mapSentence(s);
}

interface WeatherProbe extends LatLon {
  value: number;
  level: number;
  text: string;
}

export function weatherProbe(
  grid: WeatherGrid,
  section: WeatherSection,
  lat: number,
  lon: number,
  lang: Lang,
  stereo: boolean,
): WeatherProbe {
  const q = clampProbe(lat, lon);
  const value = sampleGrid(grid, section.key, q.lat, q.lon);

  return {
    ...q,
    value,
    level: normalize(section, value),
    text: describeWeatherPoint(section, q.lat, q.lon, value, lang, stereo),
  };
}

// `gesture` is true for a click or key press; a plain pointer move may not create the AudioContext.
export function soundWeatherProbe(
  section: WeatherSection,
  p: WeatherProbe,
  stereo: boolean,
  gesture: boolean,
  vibrate: boolean,
  maxLat = MAX_LAT,
): void {
  const player = getPlayer();
  if (player.playing || (!gesture && !player.ready)) return;

  const { ctx, node } = player.input();
  void ctx.resume();
  probeVoice ??= new ProbeVoice(ctx, node);
  player.setPan(0); // the probe pans itself
  probeVoice.play(section.key, p.level, panFor(p.lat, stereo, maxLat));

  if (vibrate) vibrateFor([p.level]);
}

export function releaseProbe(): void {
  probeVoice?.release();
}

// "Where am I": the point under the playhead, else the probe, else the start of the path.
export function weatherNowText(
  s: WeatherSoundscape,
  grid: WeatherGrid | undefined,
  position: number,
  playing: boolean,
  probe: LatLon | null,
  lang: Lang,
  stereo: boolean,
): string {
  const fi = currentFrac(s, position, playing, false);
  if (fi >= 0) {
    const p = pathPoint(s, fi);
    return describeWeatherPoint(s.section, p.lat, p.lon, p.value, lang, stereo);
  }

  const q = probe ?? { lat: s.path.lat[0], lon: s.path.lon[0] };
  const value = grid ? sampleGrid(grid, s.section.key, q.lat, q.lon) : s.path.value[0];
  return describeWeatherPoint(s.section, q.lat, q.lon, value, lang, stereo);
}

export function resetExplore(): void {
  probeVoice = null;
  lastSpot = 0;
}
