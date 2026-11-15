import { describe, expect, it } from "vitest";
import { colorAt } from "../src/features/live/model/palette";
import { earFor, sampleGrid } from "../src/features/live/model/describe-weather";
import { normalize, type WeatherGrid, type WeatherSection } from "../src/shared/api/weather";

const lats = [-60, -20, 20, 60];
const lons = [-135, -45, 45, 135];
const grid: WeatherGrid = {
  lats,
  lons,
  observedAt: "2026-11-14T12:00Z",
  source: "test",
  isSnapshot: false,
  notes: [],
  values: {
    temperature: lats.map((la) => lons.map(() => 30 - Math.abs(la) / 2)),
    precipitation: lats.map(() => lons.map((lo) => (lo === 45 ? 4 : 0))),
    clouds: lats.map(() => lons.map(() => 50)),
    wind: lats.map(() => lons.map(() => 10)),
  },
};
const rain: WeatherSection = {
  key: "precipitation",
  label: "",
  unit: "mm/h",
  low: 0,
  high: 8,
  logScale: true,
  palette: "rain",
  tempoBpm: 76,
  mood: "",
};

describe("weather helpers", () => {
  it("interpolates the grid and wraps longitude", () => {
    expect(sampleGrid(grid, "temperature", 20, 45)).toBeCloseTo(20);
    expect(sampleGrid(grid, "temperature", 0, 45)).toBeCloseTo(20); // between 20N and 20S
    expect(sampleGrid(grid, "precipitation", 0, 45)).toBeCloseTo(4);
    expect(sampleGrid(grid, "precipitation", 0, 180)).toBeCloseTo(
      sampleGrid(grid, "precipitation", 0, -180),
    );
    expect(sampleGrid(grid, "temperature", 89, 0)).toBeCloseTo(
      sampleGrid(grid, "temperature", 60, 0),
    ); // clamped
  });
  it("puts the north in the left ear and the south in the right", () => {
    expect(earFor(40)).toBe("left");
    expect(earFor(-40)).toBe("right");
    expect(earFor(2)).toBe("center");
  });
  it("normalizes rain on a log scale like the service", () => {
    expect(normalize(rain, 0)).toBe(0);
    expect(normalize(rain, 8)).toBeCloseTo(1);
    expect(normalize(rain, 1)).toBeCloseTo(Math.log1p(1) / Math.log1p(8));
    expect(normalize(rain, Number.NaN)).toBe(0);
  });
  it("colours dry areas transparent and heavy rain opaque", () => {
    expect(colorAt("rain", 0)[3]).toBe(0);
    expect(colorAt("rain", 1)[3]).toBeGreaterThan(0.9);
    const [r, , b] = colorAt("thermal", 0);
    expect(b).toBeGreaterThan(r); // cold is blue
  });
});

import { probePitch } from "../src/audio/probe-voice";

describe("map probe", () => {
  it("always plays a note of the section's major pentatonic, rising with the value", () => {
    const tonicPc = 2; // temperature is in D
    const pcs = [0, 2, 4, 7, 9].map((d) => (tonicPc + d) % 12);
    let previous = -1;
    for (let v = 0; v <= 1; v += 0.05) {
      const p = probePitch("temperature", v);
      expect(pcs).toContain(p % 12);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
    expect(probePitch("temperature", 1) - probePitch("temperature", 0)).toBe(24); // two octaves
  });
});

import {
  describeWeatherPoint,
  panFor,
  weatherCaptionLines,
  weatherReadout,
} from "../src/features/live/model/describe-weather";
import type { WeatherSoundscape } from "../src/shared/api/weather";

describe("weather words", () => {
  it("describes a point with place, value and headphone, in both languages", () => {
    expect(describeWeatherPoint(rain, 40, 10, 6.24, "en")).toBe(
      "10°E, 40°N, near Mediterranean: 6.2 mm/h, left headphone.",
    );
    const uk = describeWeatherPoint(rain, -40, 10, 6.24, "uk");
    expect(uk).toContain("мм/год");
    expect(uk).toContain("правий навушник");
  });
  it("says both headphones in mono", () => {
    expect(describeWeatherPoint(rain, 40, 10, 1, "en", false)).toContain("both headphones");
  });
  it("pans north left and south right, and centres in mono", () => {
    expect(panFor(80, true)).toBe(-1);
    expect(panFor(-40, true, 80)).toBe(0.5);
    expect(panFor(0, true)).toBe(0);
    expect(panFor(60, false)).toBe(0);
  });
  it("captions the parts sounding now and leaves muted ones out", () => {
    const s = {
      section: rain,
      parts: [
        { key: "lead", instrument: "harp" },
        { key: "bass", instrument: "bass" },
        { key: "texture", instrument: "rain" },
      ],
      notes: [
        { part: "lead", time: 1, duration: 1, pitch: 80, velocity: 1 },
        { part: "bass", time: 1, duration: 1, pitch: 40, velocity: 1 },
        { part: "percussion", time: 1.4, duration: 0.1, pitch: 0, velocity: 1 },
      ],
    } as unknown as WeatherSoundscape;
    expect(weatherCaptionLines(s, 1.5, "en")).toEqual([
      "♪ Melody (harp) · high",
      "♪ Bass (bass)",
      "♪ Rhythm (shaker)",
      "♪ Texture (rain)",
    ]);
    expect(weatherCaptionLines(s, 1.5, "en", { lead: true, texture: true })).toEqual([
      "♪ Bass (bass)",
      "♪ Rhythm (shaker)",
    ]);
    expect(weatherCaptionLines(s, 5, "en")).toEqual(["♪ Texture (rain)"]);
  });
  it("reads value, place and coordinates under the map", () => {
    expect(weatherReadout("precipitation", -3, -60, 6.2, "en")).toBe(
      "6.2 mm/h · the Amazon (3°S, 60°W)",
    );
  });
});
