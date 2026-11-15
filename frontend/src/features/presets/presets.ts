import type { Repeat } from "../../audio/stem-player";
import type { ComposeSettings, WeatherSettings } from "../../shared/api";

export type PresetId =
  | "nasa-four"
  | "nasa-scale"
  | "nasa-quick"
  | "live-rain"
  | "live-heat"
  | "live-wind"
  | "live-clouds"
  | "live-ai";

export type CoverId = "four" | "scale" | "quick" | "rain" | "heat" | "wind" | "clouds" | "ai";

export type Preset =
  | {
      id: PresetId;
      source: "live";
      cover: CoverId;
      settings: WeatherSettings;
      repeat: Repeat;
    }
  | {
      id: PresetId;
      source: "nasa";
      cover: CoverId;
      settings: ComposeSettings & { frameId: "svs-5669" };
      bed: boolean;
      file?: File;
    };

function live(
  id: PresetId,
  cover: CoverId,
  section: WeatherSettings["section"],
  cycles: number,
  amplitude: number,
  durationSec: number,
  repeat: Repeat,
  composer: WeatherSettings["composer"] = "algorithmic",
): Preset {
  return {
    id,
    source: "live",
    cover,
    settings: { section, cycles, amplitude, durationSec, composer },
    repeat,
  };
}

type NasaTweaks = Partial<Pick<ComposeSettings, "mode" | "durationSec" | "sensitivity">>;

function nasa(
  id: PresetId,
  cover: CoverId,
  bed: boolean,
  { mode = "harmony", durationSec = 64, sensitivity = 2 }: NasaTweaks = {},
): Preset {
  return {
    id,
    source: "nasa",
    cover,
    settings: { mode, durationSec, sensitivity, frameId: "svs-5669" },
    bed,
  };
}

// Shelf order. The first record of each source is where its row and its own mix start.
export const PRESETS: readonly Preset[] = [
  nasa("nasa-four", "four", true),
  nasa("nasa-scale", "scale", true, { mode: "scale", sensitivity: 1, durationSec: 96 }),
  nasa("nasa-quick", "quick", true, { durationSec: 20, sensitivity: 3 }),
  live("live-rain", "rain", "precipitation", 3, 0.8, 60, "one"),
  live("live-heat", "heat", "temperature", 1, 1, 60, "one"),
  live("live-wind", "wind", "wind", 4, 0.7, 45, "one"),
  live("live-clouds", "clouds", "clouds", 2, 0.6, 90, "one"),
  live("live-ai", "ai", "precipitation", 3, 0.8, 60, "one", "ai"),
];

export const DEFAULT_PRESET: PresetId = "nasa-four";

export function presetById(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function firstPreset<S extends Preset["source"]>(source: S): Extract<Preset, { source: S }> {
  return PRESETS.find((p) => p.source === source) as Extract<Preset, { source: S }>;
}
