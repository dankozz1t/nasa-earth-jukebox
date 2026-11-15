import type { Lang } from "../../shared/i18n";
import type { Repeat } from "../../audio/stem-player";
import { DEFAULT_PRESET, presetById, type PresetId } from "../presets/presets";

type Theme = "light" | "dark";

export type ProfileId = "blind" | "lowVision" | "hearing" | "motion";

/** The values a situation card replaced when it was pressed on, so pressing it off puts them back. */
export type ProfileBackup = Partial<Record<ProfileId, Partial<Omit<Prefs, "profileBackup">>>>;

export interface Prefs {
  lang: Lang;
  theme: Theme;
  speech: boolean;
  speechRate: number; // 0.6 .. 1.6
  vibrate: boolean;
  captions: boolean;
  textScale: number; // 1, 1.25, 1.5
  readableFont: boolean;
  highContrast: boolean;
  colorSafe: boolean;
  reduceMotion: boolean;
  volume: number; // 0..1
  stereo: boolean; // live: pans north/south to the left/right ear
  repeat: Repeat;
  lastPreset: PresetId;
  profileBackup: ProfileBackup;
}

export const PREFS_KEY = "earth-jukebox:prefs:v2";
export const PREFS_KEY_V1 = "earth-jukebox:prefs:v1";

function matchesMedia(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

// Contrast and motion follow the OS. Language and theme do not: every first visit is English and light.
export function defaultPrefs(): Prefs {
  return {
    lang: "en",
    theme: "light",
    speech: false,
    speechRate: 1,
    vibrate: false,
    captions: true,
    textScale: 1,
    readableFont: false,
    highContrast:
      matchesMedia("(prefers-contrast: more)") || matchesMedia("(forced-colors: active)"),
    colorSafe: false,
    reduceMotion: matchesMedia("(prefers-reduced-motion: reduce)"),
    volume: 0.7,
    stereo: true,
    repeat: "all",
    lastPreset: DEFAULT_PRESET,
    profileBackup: {},
  };
}

const bool = (v: unknown): v is boolean => typeof v === "boolean";
const range =
  (min: number, max: number) =>
  (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

const PROFILE_IDS: readonly ProfileId[] = ["blind", "lowVision", "hearing", "motion"];

type Saved = Omit<Prefs, "profileBackup">;

const VALID: { [K in keyof Saved]: (v: unknown) => v is Saved[K] } = {
  lang: (v): v is Lang => v === "uk" || v === "en",
  theme: (v): v is Theme => v === "light" || v === "dark",
  speech: bool,
  speechRate: range(0.6, 1.6),
  vibrate: bool,
  captions: bool,
  textScale: (v): v is number => v === 1 || v === 1.25 || v === 1.5,
  readableFont: bool,
  highContrast: bool,
  colorSafe: bool,
  reduceMotion: bool,
  volume: range(0, 1),
  stereo: bool,
  repeat: (v): v is Repeat => v === "off" || v === "one" || v === "all",
  lastPreset: (v): v is PresetId => typeof v === "string" && presetById(v) !== undefined,
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function pickValid(src: Record<string, unknown>): Partial<Saved> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(VALID) as (keyof Saved)[]) {
    if (key in src && VALID[key](src[key])) out[key] = src[key];
  }

  return out as Partial<Saved>;
}

function migrateBackup(raw: unknown): ProfileBackup {
  if (!isRecord(raw)) return {};

  const out: ProfileBackup = {};
  for (const id of PROFILE_IDS) {
    const entry = raw[id];
    if (isRecord(entry)) out[id] = pickValid(entry);
  }

  return out;
}

// Version 1 (2026-11-15): the shelf opens on the NASA archive. A record remembered from before then gives
// way to the new default once.
export const PREFS_VERSION = 1;

export function upgradePrefs(saved: unknown, version: number): unknown {
  if (version >= PREFS_VERSION || !isRecord(saved)) return saved;
  return Object.fromEntries(Object.entries(saved).filter(([key]) => key !== "lastPreset"));
}

export function migratePrefs(raw: unknown): Partial<Prefs> {
  if (!isRecord(raw)) return {};

  const out: Partial<Prefs> = pickValid(raw);
  if ("profileBackup" in raw) out.profileBackup = migrateBackup(raw.profileBackup);

  return out;
}

// Okabe–Ito colours stay distinguishable with every common colour-vision deficiency; the textures
// separate the layers even without any colour perception.
const SAFE_COLORS: Record<string, string> = {
  black_carbon: "#D55E00",
  dust: "#CC79A7",
  sea_salt: "#56B4E9",
  sulfate: "#F0E442",
};

export type Texture = "dots" | "diagonal" | "horizontal" | "cross";

export const TEXTURES: Record<string, Texture> = {
  black_carbon: "cross",
  dust: "dots",
  sea_salt: "horizontal",
  sulfate: "diagonal",
};

export function layerColor(key: string, apiColor: string, p: Pick<Prefs, "colorSafe">): string {
  return p.colorSafe ? (SAFE_COLORS[key] ?? apiColor) : apiColor;
}

export function vibrationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}
