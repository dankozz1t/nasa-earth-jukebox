import { ApiError, responseMessage } from "./aerosols";

export type SectionKey = "temperature" | "precipitation" | "clouds" | "wind";
export type ComposerMode = "auto" | "ai" | "algorithmic" | "aerosol";

export interface WeatherSection {
  key: SectionKey;
  label: string;
  unit: string;
  low: number;
  high: number;
  logScale: boolean;
  palette: string;
  tempoBpm: number;
  mood: string;
}

export interface WeatherGrid {
  lats: number[]; // ascending (south -> north)
  lons: number[];
  observedAt: string;
  source: string;
  isSnapshot: boolean;
  notes: string[];
  values: Record<SectionKey, number[][]>; // [lat][lon]
  fetchedAt?: string;
  nextUpdateAt?: string;
}

export interface Reading {
  observedAt: string;
  isSnapshot: boolean;
  means: Record<SectionKey, number>;
  maxima: Record<SectionKey, number>;
}

interface WeatherNote {
  part: string;
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
}

export interface WeatherSoundscape {
  id: string;
  section: WeatherSection;
  observedAt: string;
  source: string;
  isSnapshot: boolean;
  cycles: number;
  amplitude: number;
  maxLat: number;
  durationSec: number;
  tempoBpm: number;
  beatsPerBar: number;
  sampleRate: number;
  mode: "major" | "minor";
  title: string;
  rationaleEn: string;
  rationaleUk: string;
  composer: { requested: ComposerMode; used: string; aiAvailable: boolean };
  warnings: string[];
  path: { t: number[]; lat: number[]; lon: number[]; value: number[]; level: number[] };
  bars: {
    bar: number;
    chord: string;
    level: number;
    valueMean: number;
    hemisphere: string;
    accent: boolean;
  }[];
  notes: WeatherNote[];
  parts: { key: string; instrument: string }[];
  artifacts: { stems: Record<string, string>; mix: string };
}

export interface WeatherSettings {
  section: SectionKey;
  cycles: number;
  amplitude: number;
  durationSec: number;
  composer: ComposerMode;
}

async function readJson<T>(r: Response): Promise<T> {
  if (!r.ok) throw new ApiError(await responseMessage(r), r.status);

  return (await r.json()) as T;
}

export const weatherApi = {
  sections: () => fetch("/api/weather/sections").then((r) => readJson<WeatherSection[]>(r)),
  grid: () => fetch("/api/weather/grid").then((r) => readJson<WeatherGrid>(r)),
  readings: () => fetch("/api/weather/readings").then((r) => readJson<{ readings: Reading[] }>(r)),
  composer: () => fetch("/api/weather/composer").then((r) => readJson<{ aiAvailable: boolean }>(r)),
  compose: (s: WeatherSettings, signal?: AbortSignal) =>
    fetch("/api/weather/soundscapes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
      signal,
    }).then((r) => readJson<WeatherSoundscape>(r)),
  basemapUrl: "/api/weather/basemap",
};

// The same rule as the sound service: 0..1, log scale for rain.
export function normalize(section: WeatherSection, value: number): number {
  if (!Number.isFinite(value)) return 0;
  const v = section.logScale
    ? Math.log1p(Math.max(0, value)) / Math.log1p(section.high)
    : (value - section.low) / (section.high - section.low);
  return Math.min(1, Math.max(0, v));
}
