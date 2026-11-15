import type {
  SectionKey,
  WeatherGrid,
  WeatherSection,
  WeatherSoundscape,
} from "../../../shared/api/weather";
import { t, type Lang } from "../../../shared/i18n";
import { formatLat, formatLon, placeName } from "../../aerosols";

const DECIMALS: Record<SectionKey, number> = {
  temperature: 1,
  precipitation: 1,
  clouds: 0,
  wind: 0,
};

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

// Bilinear; longitude wraps and latitude is clamped, the same rule as the sound service.
export function sampleGrid(grid: WeatherGrid, key: SectionKey, lat: number, lon: number): number {
  const { lats, lons } = grid;
  const v = grid.values[key];

  const la = Math.min(lats[lats.length - 1], Math.max(lats[0], lat));
  let i = 0;
  while (i < lats.length - 2 && lats[i + 1] < la) i++;
  const ty = (la - lats[i]) / (lats[i + 1] - lats[i]);

  const n = lons.length;
  const step = lons[1] - lons[0];
  const x = ((((lon - lons[0]) / step) % n) + n) % n;
  const j0 = Math.floor(x) % n;
  const j1 = (j0 + 1) % n;
  const tx = x - Math.floor(x);

  const top = lerp(v[i][j0], v[i][j1], tx);
  const bottom = lerp(v[i + 1][j0], v[i + 1][j1], tx);
  return lerp(top, bottom, ty);
}

export function earFor(lat: number): "left" | "right" | "center" {
  if (lat > 5) return "left";
  if (lat < -5) return "right";
  return "center";
}

// North is the left ear (-1), south the right (+1).
export function panFor(lat: number, stereo: boolean, maxLat = 80): number {
  if (!stereo || maxLat <= 0) return 0;

  return Math.max(-1, Math.min(1, -lat / maxLat)) || 0; // no -0 at the equator
}

export function formatWeatherValue(key: SectionKey, value: number, lang: Lang): string {
  return `${value.toFixed(DECIMALS[key])} ${t(`w.unit.${key}`, {}, lang)}`;
}

export function describeWeatherPoint(
  section: WeatherSection,
  lat: number,
  lon: number,
  value: number,
  lang: Lang,
  stereo = true,
): string {
  return t(
    "w.at",
    {
      lon: formatLon(lon, lang),
      lat: formatLat(lat, lang),
      place: placeName(lon, lat, lang),
      value: formatWeatherValue(section.key, value, lang),
      ear: stereo ? t(`w.ear.${earFor(lat)}`, {}, lang) : t("w.ear.center", {}, lang),
    },
    lang,
  );
}

// Pitch words are relative to each part's own register (lead ~62-84, arpeggio ~67-84).
function pitchKey(part: string, pitch: number): string {
  const [low, high] = part === "lead" ? [67, 77] : [70, 79];
  if (pitch >= high) return "pitch.high";
  if (pitch < low) return "pitch.low";
  return "pitch.mid";
}

export function weatherCaptionLines(
  s: WeatherSoundscape,
  time: number,
  lang: Lang,
  muted: Record<string, boolean> = {},
): string[] {
  const tr = (key: string) => t(key, {}, lang);

  const highestPitch = new Map<string, number>();
  for (const n of s.notes) {
    const sounding = n.time <= time && time < n.time + Math.max(n.duration, 0.25);
    if (sounding && !muted[n.part]) {
      highestPitch.set(n.part, Math.max(highestPitch.get(n.part) ?? 0, n.pitch));
    }
  }

  // In the score's part order, so a line keeps its place while others come and go.
  const order = (part: string) => {
    const i = s.parts.findIndex((p) => p.key === part);
    return i < 0 ? s.parts.length : i;
  };
  const lines = [...highestPitch.entries()]
    .filter(([part]) => part !== "percussion")
    .sort(([a], [b]) => order(a) - order(b))
    .map(([part, pitch]) => {
      const inst = s.parts.find((p) => p.key === part)?.instrument ?? part;
      const melodic = part === "lead" || part === "arpeggio";
      const height = melodic ? ` · ${tr(pitchKey(part, pitch))}` : "";

      return `♪ ${tr(`w.part.${part}`)} (${tr(`w.inst.${inst}`)})${height}`;
    });

  if (highestPitch.has("percussion")) {
    lines.push(`♪ ${tr("w.part.percussion")} (${tr("w.inst.shaker")})`);
  }

  if (s.parts.some((p) => p.key === "texture") && !muted.texture) {
    const inst = s.section.key === "wind" ? "wind" : "rain";
    lines.push(`♪ ${tr("w.part.texture")} (${tr(`w.inst.${inst}`)})`);
  }

  return lines;
}

// e.g. "6.2 mm/h · the Amazon (3°S, 60°W)"
export function weatherReadout(
  key: SectionKey,
  lat: number,
  lon: number,
  value: number,
  lang: Lang,
): string {
  const where = `${placeName(lon, lat, lang)} (${formatLat(lat, lang)}, ${formatLon(lon, lang)})`;
  return `${formatWeatherValue(key, value, lang)} · ${where}`;
}
