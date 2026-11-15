import {
  normalize,
  type SectionKey,
  type WeatherGrid,
  type WeatherSection,
} from "../../../shared/api/weather";

interface GridPoint {
  lat: number;
  lon: number;
}

// Compared in the layer's own 0..1 scale (log for rain), so the 5 % threshold means 5 % of what
// the map colours span.
export function changedPoints(
  prev: WeatherGrid,
  next: WeatherGrid,
  key: SectionKey,
  section: WeatherSection,
  threshold = 0.05,
): GridPoint[] {
  const a = prev.values[key];
  const b = next.values[key];
  if (!sameAxis(prev.lats, next.lats) || !sameAxis(prev.lons, next.lons) || !a || !b) return [];

  const out: GridPoint[] = [];
  for (let i = 0; i < next.lats.length; i++) {
    for (let j = 0; j < next.lons.length; j++) {
      const before = a[i]?.[j];
      const after = b[i]?.[j];
      if (before === undefined || after === undefined) continue;

      const moved = Math.abs(normalize(section, after) - normalize(section, before));
      if (moved > threshold) out.push({ lat: next.lats[i], lon: next.lons[j] });
    }
  }

  return out;
}

function sameAxis(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
