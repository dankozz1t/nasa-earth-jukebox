import { describe, expect, it } from "vitest";
import {
  currentFrac,
  currentStep,
  layerAt,
  layerPixels,
  moveCursor,
  pathPoint,
  previewArrays,
  xy,
} from "../src/features/stage";
import { frameCoords, nearLine, scrubFraction } from "../src/features/stage/draw-aerosols";
import {
  clampProbe,
  createWeatherAnim,
  drawWeatherOverlay,
  flashesActive,
  FLASH_MS,
  MAX_LAT,
  nearPath,
  pointerLatLon,
} from "../src/features/stage/draw-weather";
import type { Soundscape, WeatherSoundscape } from "../src/shared/api";

const box = { left: 100, top: 50, width: 400, height: 200 } as DOMRect;

function weather(): WeatherSoundscape {
  return {
    durationSec: 60,
    section: { key: "temperature", low: -30, high: 40, logScale: false },
    path: {
      t: [0, 0.5, 1],
      lat: [0, 40, 0],
      lon: [-180, 0, 180],
      value: [10, 20, 30],
      level: [0, 0.5, 1],
    },
  } as unknown as WeatherSoundscape;
}

function aerosols(): Soundscape {
  return {
    width: 4,
    height: 2,
    bins: 4,
    durationSec: 8,
    stepSec: 2,
    layers: [
      { key: "dust", color: "#ff0000" },
      { key: "sulfate", color: "#00ff00" },
    ],
    profiles: [
      { coverage: [], position: [0.2, 0.4, null, 0.8] },
      { coverage: [], position: [null, null, null, null] },
    ],
    steps: [0, 1, 2, 3].map((i) => ({ chord: "", strength: [i / 4, 0] })),
  } as unknown as Soundscape;
}

describe("weather stage maths", () => {
  it("maps lat/lon to the equirectangular canvas", () => {
    expect(xy(90, -180)).toEqual([0, 0]);
    expect(xy(0, 0)).toEqual([720, 360]);
  });
  it("shows the playhead only while playing, scrubbing or paused mid-piece", () => {
    const s = weather();
    expect(currentFrac(s, 0, false, false)).toBe(-1);
    expect(currentFrac(s, 30, false, false)).toBe(1);
    expect(currentFrac(s, 0, true, false)).toBe(0);
    expect(currentFrac(s, 61, true, false)).toBe(-1);
  });
  it("interpolates between path samples", () => {
    expect(pathPoint(weather(), 0.5)).toEqual({ lat: 20, lon: -90, value: 15, level: 0.25 });
  });
  it("previews a reshaped wave with the service formula", () => {
    const p = previewArrays(weather(), { cycles: 1, amplitude: 0.5 })!;
    expect(p.lat[0]).toBeCloseTo(0.5 * MAX_LAT * Math.cos((2 * Math.PI * 0.5) / 3));
    expect(p.lon).toEqual([-120, 0, 120]);
    expect(previewArrays(weather(), null)).toBeNull();
  });
  it("finds the pointer on the wave and on the map", () => {
    const s = weather();
    expect(pointerLatLon(300, 150, box)).toEqual({ lat: 0, lon: 0 });
    // at the middle of the box the path is at 40°N: 40/180 of 200 px above the centre
    expect(nearPath(300, 150 - (40 / 180) * 200, box, s)).toBe(true);
    expect(nearPath(300, 150, box, s)).toBe(false);
  });
  it("clamps the probe inside ±89° and wraps the longitude", () => {
    expect(clampProbe(95, 190)).toEqual({ lat: 89, lon: -170 });
  });
  it("keeps flashes alive for FLASH_MS", () => {
    expect(flashesActive([{ lat: 0, lon: 0, startedAt: 1000 }], 1000 + FLASH_MS - 1)).toBe(true);
    expect(flashesActive([{ lat: 0, lon: 0, startedAt: 1000 }], 1000 + FLASH_MS)).toBe(false);
  });
  it("draws the probe and the flashes before anything is composed", () => {
    const arcs: number[][] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k: string) =>
        k === "arc" ? (...a: number[]) => arcs.push(a) : k in t ? t[k] : () => undefined,
      set: (t, k: string, v) => ((t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    const o = {
      playing: false,
      scrubbing: false,
      probe: { lat: 0, lon: 0 },
      highContrast: false,
      reduceMotion: true,
      anim: createWeatherAnim(),
      now: 1500,
    };
    drawWeatherOverlay(ctx, undefined, -1, [{ lat: 10, lon: 20, startedAt: 1000 }], o);
    expect(arcs).toHaveLength(2); // probe ring and one static flash ring (reduced motion)
    expect(arcs[1][2]).toBe(14);
  });
});

describe("aerosol stage maths", () => {
  it("finds the step under the playhead only while playing", () => {
    const s = aerosols();
    expect(currentStep(s, 5, true)).toBe(2);
    expect(currentStep(s, 5, false)).toBe(-1);
    expect(currentStep(s, 8, true)).toBe(-1);
  });
  it("glides layer strength and position between steps, bridging gaps", () => {
    const s = aerosols();
    expect(layerAt(s, 0, 0.5)).toEqual({ strength: 0.125, y: expect.closeTo(0.3) });
    expect(layerAt(s, 0, 1.5).y).toBe(0.4); // next position is null: keep the known one
  });
  it("moves the keyboard cursor inside the frame", () => {
    expect(moveCursor({ step: -1, y: 0.5 }, 4, 1, 0)).toEqual({ step: 0, y: 0.5 });
    expect(moveCursor({ step: 2, y: 0.97 }, 4, 8, 0.4)).toEqual({ step: 3, y: 0.98 });
  });
  it("dims the frame and keeps each layer's pixels on its own canvas", () => {
    const s = aerosols();
    const src = new Uint8ClampedArray(8 * 4).fill(200);
    const map = new Uint8Array([0, 1, 2, 0, 0, 0, 0, 0]);
    const { dimmed, layers } = layerPixels(src, map, s, { highContrast: false, colorSafe: false });
    expect(dimmed[0]).toBe(70); // 200 × 0.35
    expect(layers[0][4]).toBe(200); // pixel 1 belongs to dust
    expect(layers[0][8 + 3]).toBe(0);
    expect(layers[1][8]).toBe(200);
    const safe = layerPixels(src, map, s, { highContrast: true, colorSafe: true });
    expect(safe.dimmed[0]).toBe(24); // 200 × 0.12
    expect(Array.from(safe.layers[0].slice(4, 7))).not.toEqual([200, 200, 200]); // Okabe–Ito colour
  });
  it("maps the pointer to frame pixels and finds the playhead line", () => {
    const s = aerosols();
    expect(frameCoords(300, 100, box, s)).toEqual({ x: 2, y: 0.5 });
    expect(frameCoords(99, 100, box, s)).toBeNull();
    expect(nearLine(300, box, 4, 8)).toBe(true);
    expect(nearLine(300, box, 0, 8)).toBe(false);
    expect(scrubFraction(600, box)).toBe(0.999);
  });
});
