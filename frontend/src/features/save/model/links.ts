import { withSelection, type Soundscape, type WeatherSoundscape } from "../../../shared/api";
import { BED } from "../../presets";

export type Muted = Record<string, boolean>;

export function archiveStem(s: Soundscape): string {
  return `earth-jukebox-${s.mode}-${Math.round(s.durationSec)}s`;
}

export function liveStem(s: WeatherSoundscape): string {
  return `earth-jukebox-weather-${s.section.key}-${s.observedAt.slice(0, 13)}`;
}

export function archiveLinks(s: Soundscape, muted: Muted): { wav: string; midi: string } {
  const layers = s.layers.map((l) => l.key).filter((k) => !muted[k]);
  const bed = !muted[BED];

  return {
    wav: withSelection(s.artifacts.mix, layers, bed),
    midi: withSelection(s.artifacts.midi, layers, bed),
  };
}

export function liveWavLink(s: WeatherSoundscape, muted: Muted, stereo: boolean): string {
  const on = s.parts.map((p) => p.key).filter((k) => !muted[k]);

  const q = new URLSearchParams();
  if (on.length !== s.parts.length) q.set("parts", on.join(","));
  if (!stereo) q.set("mono", "true");

  const query = q.toString();
  return query ? `${s.artifacts.mix}?${query}` : s.artifacts.mix;
}
