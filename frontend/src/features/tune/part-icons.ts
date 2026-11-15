import {
  AudioWaveform,
  Bell,
  CloudRain,
  Drum,
  Flame,
  Guitar,
  KeyboardMusic,
  Music,
  Music2,
  Piano,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";

// What kind of sound a part is: a keyboard, plucked strings, a bell, a drum, or a sound of nature.
const BY_INSTRUMENT: Record<string, LucideIcon> = {
  piano: Piano,
  strings: Music2,
  bass: Guitar,
  marimba: KeyboardMusic,
  harp: Music,
  flute: Music,
  bell: Bell,
  shaker: Drum,
  rain: CloudRain,
  wind: Wind,
  smoke: Flame,
  pad: AudioWaveform,
  air: Waves,
  drone: AudioWaveform,
};

// Aerosol layers have one voice each (see LAYER_TEXT); a live part falls back on its role.
const BY_KEY: Record<string, LucideIcon> = {
  black_carbon: Flame,
  dust: AudioWaveform,
  sulfate: Bell,
  sea_salt: Waves,
  lead: Music,
  strings: Music2,
  bass: Guitar,
  arpeggio: Music,
  bells: Bell,
  percussion: Drum,
  texture: Waves,
};

export function partIcon(key: string, instrument?: string): LucideIcon {
  return (instrument && BY_INSTRUMENT[instrument]) || BY_KEY[key] || Music;
}
