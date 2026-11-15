import type { Soundscape } from "../../shared/api/aerosols";
import { layerColor, TEXTURES, type Prefs } from "../access";

type AerosolPrefs = Pick<Prefs, "highContrast" | "colorSafe" | "reduceMotion">;

export interface AerosolCursor {
  step: number; // -1 until the explorer is used
  y: number; // 0..1 from the top
}

interface AerosolLayers {
  dimmed: CanvasImageSource;
  layers: CanvasImageSource[];
}

interface AerosolAnim {
  dots: Map<string, { y: number; r: number; a: number }>;
  lastFrame: number;
}

export function createAerosolAnim(): AerosolAnim {
  return { dots: new Map(), lastFrame: 0 };
}

// Colour-safe mode marks each layer with a texture, so it reads without any colour vision.
function textured(key: string, x: number, y: number): boolean {
  switch (TEXTURES[key]) {
    case "dots":
      return x % 6 < 2 && y % 6 < 2;
    case "horizontal":
      return y % 6 < 2;
    case "diagonal":
      return (x + y) % 8 < 2;
    case "cross":
      return (x + y) % 8 < 2 || (x - y + 8000) % 8 < 2;
    default:
      return false;
  }
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function layerPixels(
  src: Uint8ClampedArray,
  map: Uint8Array,
  s: Pick<Soundscape, "width" | "height" | "layers">,
  prefs: Pick<Prefs, "highContrast" | "colorSafe">,
): { dimmed: Uint8ClampedArray<ArrayBuffer>; layers: Uint8ClampedArray<ArrayBuffer>[] } {
  const dimFactor = prefs.highContrast ? 0.12 : 0.35;
  const size = s.width * s.height * 4;
  const dimData = new Uint8ClampedArray(size);
  const layers = s.layers.map(() => new Uint8ClampedArray(size));
  const safe = s.layers.map((l) => hexRgb(layerColor(l.key, l.color, prefs)));

  for (let p = 0; p < map.length; p++) {
    const i = p * 4;
    dimData[i] = src[i] * dimFactor;
    dimData[i + 1] = src[i + 1] * dimFactor;
    dimData[i + 2] = src[i + 2] * dimFactor;
    dimData[i + 3] = 255;

    const c = map[p];
    if (!c || c > layers.length) continue;

    const d = layers[c - 1];
    if (prefs.colorSafe) {
      const [r, g, b] = safe[c - 1];
      const k = textured(s.layers[c - 1].key, p % s.width, Math.floor(p / s.width)) ? 0.3 : 1;
      d[i] = r * k;
      d[i + 1] = g * k;
      d[i + 2] = b * k;
    } else {
      d[i] = src[i];
      d[i + 1] = src[i + 1];
      d[i + 2] = src[i + 2];
    }
    d[i + 3] = 255;
  }

  return { dimmed: dimData, layers };
}

export function pixels(
  doc: Document,
  img: CanvasImageSource,
  width: number,
  height: number,
): ImageData {
  const c = Object.assign(doc.createElement("canvas"), { width, height });
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export function buildAerosolLayers(
  doc: Document,
  img: CanvasImageSource,
  map: Uint8Array,
  s: Soundscape,
  prefs: Pick<Prefs, "highContrast" | "colorSafe">,
): AerosolLayers {
  const { dimmed, layers } = layerPixels(pixels(doc, img, s.width, s.height).data, map, s, prefs);

  const toCanvas = (data: Uint8ClampedArray<ArrayBuffer>) => {
    const c = Object.assign(doc.createElement("canvas"), { width: s.width, height: s.height });
    c.getContext("2d")!.putImageData(new ImageData(data, s.width, s.height), 0, 0);
    return c;
  };

  return { dimmed: toCanvas(dimmed), layers: layers.map(toCanvas) };
}

export function drawAerosolBase(
  ctx: CanvasRenderingContext2D,
  img: AerosolLayers,
  s: Soundscape,
  isOn: (key: string) => boolean,
): void {
  ctx.drawImage(img.dimmed, 0, 0);
  s.layers.forEach((l, k) => {
    if (isOn(l.key)) ctx.drawImage(img.layers[k], 0, 0);
  });
}

export function currentStep(s: Soundscape, position: number, playing: boolean): number {
  if (!playing) return -1;
  if (position < 0 || position >= s.durationSec) return -1;

  return Math.min(s.bins - 1, Math.floor(position / s.stepSec));
}

// Linear between steps, so the playhead dots glide instead of stepping.
export function layerAt(
  s: Soundscape,
  k: number,
  fstep: number,
): { strength: number; y: number | null } {
  const i = Math.max(0, Math.min(s.bins - 1, Math.floor(fstep)));
  const j = Math.min(s.bins - 1, i + 1);
  const f = Math.min(1, Math.max(0, fstep - i));
  const s0 = s.steps[i].strength[k];
  const s1 = s.steps[j].strength[k];
  const y0 = s.profiles[k].position[i];
  const y1 = s.profiles[k].position[j];

  let y: number | null;
  if (y0 === null) y = y1;
  else if (y1 === null) y = y0;
  else y = y0 + (y1 - y0) * f;

  return { strength: s0 + (s1 - s0) * f, y };
}

interface AerosolOverlayOptions {
  position: number;
  playing: boolean;
  scrubbing: boolean;
  cursor: AerosolCursor;
  prefs: AerosolPrefs;
  isOn(key: string): boolean;
  anim: AerosolAnim;
  now: number; // performance.now() of this frame
}

function lineColor(highContrast: boolean): string {
  return highContrast ? "#ffff00" : "rgba(255,255,255,0.9)";
}

function drawPlayheadLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  scale: number,
  highContrast: boolean,
): void {
  const line = lineColor(highContrast);

  const band = ctx.createLinearGradient(x - 40 * scale, 0, x + 40 * scale, 0);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, highContrast ? "rgba(255,255,0,0.22)" : "rgba(255,255,255,0.10)");
  band.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = band;
  ctx.fillRect(x - 40 * scale, 0, 80 * scale, height);

  ctx.save();
  ctx.shadowColor = line;
  ctx.shadowBlur = 8 * scale;
  ctx.fillStyle = line;
  ctx.fillRect(x - 1.25 * scale, 0, 2.5 * scale, height);
  ctx.restore();
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dot: { r: number; a: number },
  color: string,
  scale: number,
  highContrast: boolean,
): void {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, dot.r * 1.8);
  glow.addColorStop(0, color);
  glow.addColorStop(0.55, color);
  glow.addColorStop(1, "rgba(0,0,0,0)");

  ctx.globalAlpha = dot.a * 0.95;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, dot.r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 1.5 * scale;
  ctx.strokeStyle = highContrast ? "#000" : "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, dot.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawAerosolOverlay(
  ctx: CanvasRenderingContext2D,
  s: Soundscape,
  o: AerosolOverlayOptions,
): void {
  const { prefs, anim, now } = o;
  ctx.clearRect(0, 0, s.width, s.height);

  const dt = anim.lastFrame ? Math.min(0.1, (now - anim.lastFrame) / 1000) : 0;
  anim.lastFrame = now;
  const ease = prefs.reduceMotion ? 1 : 1 - Math.exp(-dt / 0.12); // ~120 ms glide
  const line = lineColor(prefs.highContrast);
  const scale = s.width / 960; // canvas pixels per CSS pixel, roughly

  const pos = o.position;
  // Shown while playing, while the line is dragged, and when paused mid-piece.
  const showPlayhead = (o.playing || o.scrubbing || pos > 0) && pos < s.durationSec;

  if (showPlayhead) {
    const fstep = pos / s.stepSec - 0.5;
    const x = (pos / s.durationSec) * s.width;
    drawPlayheadLine(ctx, x, s.height, scale, prefs.highContrast);

    s.layers.forEach((l, k) => {
      const target = layerAt(s, k, fstep);
      const on = o.isOn(l.key) && target.strength > 0 && target.y !== null;

      const d = anim.dots.get(l.key) ?? { y: target.y ?? 0.5, r: 0, a: 0 };
      if (target.y !== null) d.y += (target.y - d.y) * (d.a < 0.05 ? 1 : ease);
      d.r += ((on ? 9 + 18 * target.strength : 4) * scale - d.r) * ease;
      d.a += ((on ? 1 : 0) - d.a) * ease;
      anim.dots.set(l.key, d);

      if (d.a < 0.02) return;

      const color = layerColor(l.key, l.color, prefs);
      drawDot(ctx, x, d.y * s.height, d, color, scale, prefs.highContrast);
    });
  } else {
    anim.dots.clear();
    anim.lastFrame = 0;
  }

  if (!o.playing && o.cursor.step >= 0) {
    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(((o.cursor.step + 0.5) / s.bins) * s.width, o.cursor.y * s.height, 24, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function frameCoords(
  clientX: number,
  clientY: number,
  r: DOMRect,
  s: Pick<Soundscape, "width" | "height">,
): { x: number; y: number } | null {
  const x = ((clientX - r.left) / r.width) * s.width;
  const y = ((clientY - r.top) / r.height) * s.height;
  return x < 0 || y < 0 || x >= s.width || y >= s.height ? null : { x, y };
}

export function nearLine(
  clientX: number,
  r: DOMRect,
  position: number,
  durationSec: number,
): boolean {
  if (position <= 0) return false;

  const lineX = r.left + (position / durationSec) * r.width;
  return Math.abs(clientX - lineX) < 18;
}

export function scrubFraction(clientX: number, r: DOMRect): number {
  return Math.min(0.999, Math.max(0, (clientX - r.left) / r.width));
}

export function moveCursor(
  c: AerosolCursor,
  bins: number,
  dStep: number,
  dY: number,
): AerosolCursor {
  return {
    step: Math.max(0, Math.min(bins - 1, c.step < 0 ? 0 : c.step + dStep)),
    y: Math.max(0.02, Math.min(0.98, c.y + dY)),
  };
}
