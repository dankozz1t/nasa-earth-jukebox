// [position 0..1, r, g, b, alpha 0..1]
type Stop = [number, number, number, number, number];

const MAPS: Record<string, Stop[]> = {
  thermal: [
    [0, 49, 54, 149, 0.75],
    [0.3, 69, 117, 180, 0.7],
    [0.45, 171, 217, 233, 0.55],
    [0.55, 254, 224, 144, 0.55],
    [0.75, 244, 109, 67, 0.7],
    [1, 165, 0, 38, 0.8],
  ],
  rain: [
    [0, 30, 60, 120, 0],
    [0.12, 80, 160, 255, 0.35],
    [0.4, 40, 110, 255, 0.7],
    [0.7, 120, 60, 220, 0.85],
    [1, 230, 60, 200, 0.95],
  ],
  clouds: [
    [0, 255, 255, 255, 0],
    [0.4, 230, 236, 245, 0.25],
    [1, 255, 255, 255, 0.85],
  ],
  wind: [
    [0, 20, 40, 60, 0],
    [0.25, 30, 140, 160, 0.45],
    [0.6, 240, 210, 60, 0.7],
    [1, 230, 60, 120, 0.9],
  ],
  // Viridis-like: readable with colour-vision deficiencies and in greyscale (lightness only rises).
  safe: [
    [0, 68, 1, 84, 0.7],
    [0.25, 59, 82, 139, 0.7],
    [0.5, 33, 145, 140, 0.7],
    [0.75, 94, 201, 98, 0.75],
    [1, 253, 231, 37, 0.85],
  ],
};

export function colorAt(palette: string, v: number): [number, number, number, number] {
  const stops = MAPS[palette] ?? MAPS.safe;
  const x = Math.min(1, Math.max(0, v));

  for (let i = 1; i < stops.length; i++) {
    const [p1, ...c1] = stops[i];
    const [p0, ...c0] = stops[i - 1];
    if (x <= p1) {
      const k = (x - p0) / (p1 - p0 || 1);
      return c0.map((c, j) => c + (c1[j] - c) * k) as [number, number, number, number];
    }
  }

  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

export function cssGradient(palette: string): string {
  const stops = MAPS[palette] ?? MAPS.safe;
  const colors = stops.map(
    ([p, r, g, b, a]) => `rgba(${r},${g},${b},${Math.max(a, 0.35)}) ${p * 100}%`,
  );

  return `linear-gradient(90deg, ${colors.join(", ")})`;
}
