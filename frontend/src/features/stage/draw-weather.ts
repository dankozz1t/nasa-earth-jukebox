import {
  normalize,
  type WeatherGrid,
  type WeatherSection,
  type WeatherSoundscape,
} from "../../shared/api/weather";
import { sampleGrid } from "../live/model/describe-weather";
import { colorAt } from "../live/model/palette";

export const MAX_LAT = 80; // same as the sound service
export const W = 1440;
export const H = 720;
export const FLASH_MS = 1200;

export interface Flash {
  lat: number;
  lon: number;
  startedAt: number;
}

// The wave being shaped in Tune, drawn locally until the new sound arrives.
export interface WavePreview {
  cycles: number;
  amplitude: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

interface PathPoint {
  lat: number;
  lon: number;
  value: number;
  level: number;
}

interface WeatherAnim {
  dotRadius: number;
  lastFrame: number;
}

export function createWeatherAnim(): WeatherAnim {
  return { dotRadius: 0, lastFrame: 0 };
}

export function xy(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

export function drawWeatherBase(
  ctx: CanvasRenderingContext2D,
  basemap: CanvasImageSource | null,
  grid: WeatherGrid,
  section: WeatherSection,
  palette: string,
  highContrast = false,
): void {
  ctx.fillStyle = "#0b1320";
  ctx.fillRect(0, 0, W, H);
  if (basemap) {
    ctx.globalAlpha = highContrast ? 0.35 : 0.85;
    ctx.drawImage(basemap, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // The heat map: one pixel per grid cell, scaled up with smoothing. Rows flip, so north is at the top.
  const nLat = grid.lats.length;
  const nLon = grid.lons.length;
  const small = Object.assign(ctx.canvas.ownerDocument.createElement("canvas"), {
    width: nLon,
    height: nLat,
  });
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(nLon, nLat);
  const values = grid.values[section.key];

  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const [r, g, b, a] = colorAt(palette, normalize(section, values[i][j]));
      const p = ((nLat - 1 - i) * nLon + j) * 4;
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = Math.round(a * 255);
    }
  }

  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, W, H);

  // The equator.
  ctx.strokeStyle = highContrast ? "#ffffff" : "rgba(255,255,255,0.35)";
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// A fractional path index, or -1 when nothing is to be shown.
export function currentFrac(
  s: WeatherSoundscape,
  position: number,
  playing: boolean,
  scrubbing: boolean,
): number {
  if (position > s.durationSec) return -1;
  if (!playing && !scrubbing && position <= 0) return -1;

  return Math.min(1, Math.max(0, position / s.durationSec)) * (s.path.t.length - 1);
}

// The same formula as the sound service; `t` runs 0..1 along the path.
function sineAt(pv: WavePreview, t: number): LatLon {
  return {
    lat: pv.amplitude * MAX_LAT * Math.cos(2 * Math.PI * pv.cycles * t),
    lon: -180 + 360 * t,
  };
}

export function previewArrays(
  s: WeatherSoundscape,
  pv: WavePreview | null | undefined,
): { lat: number[]; lon: number[] } | null {
  if (!pv) return null;

  const n = s.path.lat.length;
  const lat: number[] = [];
  const lon: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = sineAt(pv, (k + 0.5) / n);
    lat.push(p.lat);
    lon.push(p.lon);
  }

  return { lat, lon };
}

// Linear between the samples: smooth motion, no stepping.
export function pathPoint(
  s: WeatherSoundscape,
  fi: number,
  pv?: WavePreview | null,
  grid?: WeatherGrid | null,
): PathPoint {
  if (pv && grid) {
    const { lat, lon } = sineAt(pv, (fi + 0.5) / s.path.lat.length);
    const value = sampleGrid(grid, s.section.key, lat, lon);
    return { lat, lon, value, level: normalize(s.section, value) };
  }

  const n = s.path.lat.length;
  const i = Math.max(0, Math.min(n - 1, Math.floor(fi)));
  const j = Math.min(n - 1, i + 1);
  const f = Math.min(1, Math.max(0, fi - i));
  const mix = (a: number[]) => a[i] + (a[j] - a[i]) * f;

  return {
    lat: mix(s.path.lat),
    lon: mix(s.path.lon),
    value: mix(s.path.value),
    level: mix(s.path.level),
  };
}

interface WeatherOverlayOptions {
  playing: boolean;
  scrubbing: boolean;
  probe: LatLon | null;
  preview?: WavePreview | null;
  grid?: WeatherGrid | null;
  highContrast: boolean;
  reduceMotion: boolean;
  anim: WeatherAnim;
  now: number; // performance.now() of this frame
}

// The probe and the flashes need only the grid, so they show before anything is composed.
export function drawWeatherOverlay(
  ctx: CanvasRenderingContext2D,
  s: WeatherSoundscape | null | undefined,
  frac: number,
  flashes: readonly Flash[],
  o: WeatherOverlayOptions,
): void {
  ctx.clearRect(0, 0, W, H);

  if (s) {
    drawPath(ctx, s, frac, o);
  } else {
    o.anim.dotRadius = 0;
    o.anim.lastFrame = 0;
  }

  if (!o.playing && !o.scrubbing && o.probe) drawProbe(ctx, o.probe, o.highContrast);
  drawFlashes(ctx, flashes, o.now, o.highContrast, o.reduceMotion);
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.45, "rgba(255,255,255,0.75)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  s: WeatherSoundscape,
  frac: number,
  o: WeatherOverlayOptions,
): void {
  const { anim, now } = o;
  const dt = anim.lastFrame ? Math.min(0.1, (now - anim.lastFrame) / 1000) : 0;
  anim.lastFrame = now;
  const ease = o.reduceMotion ? 1 : 1 - Math.exp(-dt / 0.12);
  const fi = frac;

  const line = o.highContrast ? "#ffff00" : "rgba(255,255,255,0.7)";
  const played = o.highContrast ? "#00ffff" : "#7fe7ff";
  const shape = previewArrays(s, o.preview) ?? s.path;

  const trace = (to: number) => {
    ctx.beginPath();
    const n = shape.lat.length;
    const last = Math.min(n - 1, Math.floor(to));
    for (let k = 0; k <= last; k++) {
      const [x, y] = xy(shape.lat[k], shape.lon[k]);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    if (to < n - 1) {
      // End exactly at the playhead, between samples.
      const p = pathPoint(s, to, o.preview, o.grid);
      const [x, y] = xy(p.lat, p.lon);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 6;
  trace(s.path.lat.length - 1);

  ctx.strokeStyle = line;
  ctx.lineWidth = 2.5;
  trace(s.path.lat.length - 1);

  if (fi >= 0) {
    ctx.save();
    ctx.shadowColor = played;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = played;
    ctx.lineWidth = 4;
    trace(fi);
    ctx.restore();

    const p = pathPoint(s, fi, o.preview, o.grid);
    const [x, y] = xy(p.lat, p.lon);
    anim.dotRadius += (10 + 16 * p.level - anim.dotRadius) * (anim.dotRadius === 0 ? 1 : ease);
    drawDot(ctx, x, y, anim.dotRadius);
  } else {
    anim.dotRadius = 0;
    anim.lastFrame = 0;
  }
}

function drawProbe(ctx: CanvasRenderingContext2D, probe: LatLon, highContrast: boolean): void {
  const [x, y] = xy(probe.lat, probe.lon);
  ctx.lineWidth = 3;
  ctx.strokeStyle = highContrast ? "#ffff00" : "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 26, y);
  ctx.lineTo(x - 12, y);
  ctx.moveTo(x + 12, y);
  ctx.lineTo(x + 26, y);
  ctx.moveTo(x, y - 26);
  ctx.lineTo(x, y - 12);
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x, y + 26);
  ctx.stroke();
}

// Rings grow and fade over FLASH_MS; with reduced motion they stay still.
function drawFlashes(
  ctx: CanvasRenderingContext2D,
  flashes: readonly Flash[],
  now: number,
  highContrast: boolean,
  reduceMotion: boolean,
): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = highContrast ? "#ffff00" : "#ffffff";

  for (const f of flashes) {
    const age = (now - f.startedAt) / FLASH_MS;
    if (age < 0 || age >= 1) continue;

    const [x, y] = xy(f.lat, f.lon);
    ctx.globalAlpha = reduceMotion ? 1 : 1 - age;
    ctx.beginPath();
    ctx.arc(x, y, reduceMotion ? 14 : 8 + 18 * age, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

export function flashesActive(flashes: readonly Flash[], now: number): boolean {
  return flashes.some((f) => now >= f.startedAt && now - f.startedAt < FLASH_MS);
}

export function pointerLatLon(clientX: number, clientY: number, r: DOMRect): LatLon {
  return {
    lat: 90 - ((clientY - r.top) / r.height) * 180,
    lon: -180 + ((clientX - r.left) / r.width) * 360,
  };
}

// Near the curve at the pointer's longitude.
export function nearPath(
  clientX: number,
  clientY: number,
  r: DOMRect,
  s: WeatherSoundscape,
  pv?: WavePreview | null,
  grid?: WeatherGrid | null,
): boolean {
  const xf = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  const p = pathPoint(s, xf * (s.path.lat.length - 1), pv, grid);
  const py = r.top + ((90 - p.lat) / 180) * r.height;
  return Math.abs(py - clientY) < 22;
}

// Latitude inside ±89, longitude wrapped to -180..180.
export function clampProbe(lat: number, lon: number): LatLon {
  return {
    lat: Math.max(-89, Math.min(89, lat)),
    lon: ((((lon + 180) % 360) + 360) % 360) - 180,
  };
}
