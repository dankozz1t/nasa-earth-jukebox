// Not persisted: the preset travels in ?p=.

import { create } from "zustand";
import { getPlayer } from "../../audio/player-instance";
import type { Soundscape, WeatherSoundscape } from "../../shared/api";
import { DEFAULT_PRESET, firstPreset, presetById, type Preset, type PresetId } from "./presets";

export type SessionPresetId = PresetId | "custom";
export type Source = "live" | "nasa";
export type AnySoundscape = Soundscape | WeatherSoundscape;

export function isWeather(s: AnySoundscape): s is WeatherSoundscape {
  return "path" in s;
}

function sourceOf(s: AnySoundscape): Source {
  return isWeather(s) ? "live" : "nasa";
}

// A piece of the other source is not what the person is looking at.
export function pieceOnStage(
  s: AnySoundscape | undefined,
  source: Source,
): AnySoundscape | undefined {
  return s && sourceOf(s) === source ? s : undefined;
}

export function findPreset(
  id: SessionPresetId | null | undefined,
  custom?: Preset,
): Preset | undefined {
  return id === "custom" ? custom : presetById(id);
}

// The drone under the aerosol voices. Solo leaves it alone: the preset decides it.
export const BED = "bed";

interface WaveShape {
  cycles: number;
  amplitude: number;
}

interface SessionState {
  presetId: SessionPresetId;
  source: Source;
  custom?: Preset; // the mix that "custom" means now
  mixes: Partial<Record<Source, Preset>>; // the person's last mix of each source
  // The wave being shaped in Tune, until the sounding piece has that shape.
  preview: WaveShape | null;
  // Prepared without sound (a Tune change while paused) and not on the player yet. The player's tag cannot
  // tell: a second staged edit of "custom" has the same tag as the piece it replaces.
  staged: boolean;
  muted: Record<string, boolean>; // missing keys are on
  soundscape?: AnySoundscape;
  booted: boolean;
  pick(id: SessionPresetId): void;
  setSource(source: Source): void;
  setCustom(preset: Preset): void;
  setPreview(shape: WaveShape | null): void;
  setStaged(staged: boolean): void;
  toggleMute(key: string): void;
  solo(key: string): void;
  // `muted` replaces the mix (a new preset); without it, known keys keep their state.
  show(soundscape: AnySoundscape, muted?: Record<string, boolean>): void;
}

export function stemKeys(s: AnySoundscape | undefined): string[] {
  return s ? Object.keys(s.artifacts.stems) : [];
}

export function mixFor(preset: Preset, keys: string[]): Record<string, boolean> {
  // A new preset starts with every layer on; only the archive drone follows `bed`.
  return Object.fromEntries(
    keys.map((k) => [k, preset.source === "nasa" && k === BED && !preset.bed]),
  );
}

function previewReached(preview: WaveShape | null, s: AnySoundscape): boolean {
  if (!preview || !isWeather(s)) return false;

  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return near(preview.cycles, s.cycles) && near(preview.amplitude, s.amplitude);
}

function applyToPlayer(muted: Record<string, boolean>): void {
  const player = getPlayer();
  for (const [k, m] of Object.entries(muted)) {
    player.setEnabled(k, !m);
  }
}

export const useSession = create<SessionState>()((set, get) => ({
  presetId: DEFAULT_PRESET,
  source: presetById(DEFAULT_PRESET)!.source,
  mixes: {},
  preview: null,
  staged: false,
  muted: {},
  soundscape: undefined,
  booted: false,

  pick(id) {
    const source = findPreset(id, get().custom)?.source;

    // A regular preset has its own wave; "custom" keeps the preview until its composition arrives.
    set({
      presetId: id,
      ...(source ? { source } : {}),
      ...(id === "custom" ? {} : { preview: null }),
    });
  },

  setSource(source) {
    set({ source });
  },

  setCustom(preset) {
    set({
      custom: preset,
      presetId: "custom",
      source: preset.source,
      mixes: { ...get().mixes, [preset.source]: preset },
    });
  },

  setPreview(preview) {
    set({ preview });
  },

  setStaged(staged) {
    set({ staged });
  },

  toggleMute(key) {
    const muted = { ...get().muted, [key]: !get().muted[key] };
    set({ muted });
    applyToPlayer({ [key]: muted[key] });
  },

  solo(key) {
    const { muted: cur, soundscape } = get();
    const keys = stemKeys(soundscape).filter((k) => k !== BED);
    if (!keys.includes(key)) keys.push(key);

    const alreadySolo = keys.every((k) => (k === key ? !cur[k] : cur[k]));
    const next: Record<string, boolean> = { ...cur };
    for (const k of keys) {
      next[k] = alreadySolo ? false : k !== key;
    }

    set({ muted: next });
    applyToPlayer(next);
  },

  show(soundscape, muted) {
    const keys = stemKeys(soundscape);
    const base = muted ?? get().muted;
    const next: Record<string, boolean> = { ...base };
    for (const k of keys) {
      next[k] = base[k] ?? false;
    }

    const reached = previewReached(get().preview, soundscape);
    set({ soundscape, muted: next, ...(reached ? { preview: null } : {}) });

    applyToPlayer(Object.fromEntries(keys.map((k) => [k, next[k]])));
  },
}));

// "Create your mix" goes on from the person's mix of this source, else starts from the record selected in
// this row, else from the row's first record.
export function mixStart(source: Source): Preset {
  const { mixes, presetId, custom } = useSession.getState();
  const selected = findPreset(presetId, custom);
  return mixes[source] ?? (selected?.source === source ? selected : firstPreset(source));
}
