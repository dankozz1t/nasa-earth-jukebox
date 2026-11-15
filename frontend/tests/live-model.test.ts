import { describe, expect, it } from "vitest";
import { countdown, PERIOD_MIN } from "../src/features/live/model/countdown";
import { changedPoints } from "../src/features/live/model/diff";
import type { WeatherGrid, WeatherSection } from "../src/shared/api";

const MIN = 60_000;
const NOW = Date.parse("2026-11-14T14:24:30Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("countdown", () => {
  it("countdown never negative and reports updating when overdue", () => {
    expect(countdown(at(-1), NOW)).toEqual({ minutes: 0, state: "updating" });
    expect(countdown(at(-30 * MIN), NOW)).toEqual({ minutes: 0, state: "updating" });
    expect(countdown(at(0), NOW).state).toBe("updating");
    expect(countdown(undefined, NOW)).toEqual({ minutes: 0, state: "unknown" });
    expect(countdown("not a date", NOW)).toEqual({ minutes: 0, state: "unknown" });
  });

  it("the period is 30 minutes", () => {
    expect(PERIOD_MIN).toBe(30);
  });

  it("counts whole minutes, rounded up", () => {
    expect(countdown(at(30 * MIN), NOW)).toEqual({ minutes: 30, state: "counting" });
    expect(countdown(at(12 * MIN), NOW)).toEqual({ minutes: 12, state: "counting" });
    // part of a minute left still reads as that minute: "1 min", never "0 min"
    expect(countdown(at(6.5 * MIN), NOW)).toEqual({ minutes: 7, state: "counting" });
    expect(countdown(at(10_000), NOW)).toEqual({ minutes: 1, state: "counting" });
    // a retry further away than one period (backoff) names the real wait
    expect(countdown(at(40 * MIN), NOW)).toEqual({ minutes: 40, state: "counting" });
  });
});

const temp: WeatherSection = {
  key: "temperature",
  label: "",
  unit: "°C",
  low: -40,
  high: 40,
  logScale: false,
  palette: "thermal",
  tempoBpm: 80,
  mood: "",
};

function grid(values: number[][]): WeatherGrid {
  const fill = (v: number) => values.map((row) => row.map(() => v));
  return {
    lats: [-30, 30],
    lons: [-90, 0, 90],
    observedAt: "2026-11-14T14:15:00Z",
    source: "test",
    isSnapshot: false,
    notes: [],
    values: { temperature: values, precipitation: fill(0), clouds: fill(0), wind: fill(0) },
  };
}

describe("changedPoints", () => {
  it("changedPoints ignores changes under 5 % of the layer range", () => {
    // range 80 °C: 5 % is 4 °C
    const prev = grid([
      [10, 10, 10],
      [10, 10, 10],
    ]);
    const next = grid([
      [13.9, 10, 4],
      [10, 14.5, 10],
    ]);
    expect(changedPoints(prev, next, "temperature", temp)).toEqual([
      { lat: -30, lon: 90 },
      { lat: 30, lon: 0 },
    ]);
    expect(changedPoints(prev, next, "temperature", temp, 0.01)).toHaveLength(3);
    expect(changedPoints(prev, prev, "temperature", temp)).toEqual([]);
  });

  it("compares nothing when the grids do not line up", () => {
    const prev = grid([
      [10, 10, 10],
      [10, 10, 10],
    ]);
    const next = {
      ...grid([
        [20, 20, 20],
        [20, 20, 20],
      ]),
      lons: [-120, 0, 120],
    };
    expect(changedPoints(prev, next, "temperature", temp)).toEqual([]);
  });
});
