import { describe, expect, it } from "vitest";
import { withSelection, type Soundscape } from "../src/shared/api/aerosols";
import {
  decodeClassMap,
  describeSpot,
  describeStep,
  localMix,
  summarize,
} from "../src/features/aerosols/model/describe";
import { placeName } from "../src/features/aerosols/model/geo";

const layer = (key: string, label: string, share: number) => ({
  key,
  label,
  color: "#fff",
  voice: "test voice",
  about: "About.",
  pitchLow: 48,
  pitchHigh: 72,
  pixelCount: share ? 100 : 0,
  share,
});

const s: Soundscape = {
  id: "0123456789abcdef",
  width: 8,
  height: 4,
  bins: 4,
  durationSec: 8,
  stepSec: 2,
  sampleRate: 8000,
  mode: "harmony",
  hueSource: "colorbar",
  warnings: [],
  layers: [
    layer("black_carbon", "Black Carbon", 0),
    layer("dust", "Dust", 1),
    layer("sea_salt", "Sea Salt", 0),
    layer("sulfate", "Sulfate", 0),
  ],
  profiles: [
    { coverage: [0, 0, 0, 0], position: [null, null, null, null] },
    { coverage: [0, 0, 0.5, 0], position: [null, null, 0.35, null] },
    { coverage: [0, 0, 0, 0], position: [null, null, null, null] },
    { coverage: [0, 0, 0, 0], position: [null, null, null, null] },
  ],
  steps: [0, 1, 2, 3].map((b) => ({ chord: "Dm9", strength: [0, b === 2 ? 0.9 : 0, 0, 0] })),
  notes: [],
  bed: [],
  artifacts: { classMap: "", stems: {}, mix: "/api/soundscapes/x/mix.wav", midi: "" },
  frame: null,
};

describe("describe", () => {
  it("narrates the Sahara dust step and a clean step", () => {
    expect(describeStep(s, 2)).toBe("45°E, Europe and Africa. Dust strong near Arabian Peninsula.");
    expect(describeStep(s, 0)).toContain("Clean air");
  });
  it("describes a spot and the whole map", () => {
    expect(describeSpot(s, 0.5, 0.35, [0, 0.8, 0.01, 0])).toBe("Sahara (27°N, 0°): Dust 80%");
    const sum = summarize(s);
    expect(sum[0].text).toMatch(/^Not found/);
    expect(sum[1].text).toContain("100.0% of all coloured pixels");
  });
  it("decodes the class map and mixes a neighbourhood", () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255, 50, 50, 50, 255, 199, 199, 199, 255, 102, 0, 0, 255,
    ]);
    expect(Array.from(decodeClassMap(rgba))).toEqual([0, 1, 4, 2]);
    const mix = localMix(new Uint8Array([2, 2, 0, 0, 2, 2, 0, 0]), 4, 2, 4, 0, 0, 4);
    expect(mix[1]).toBeGreaterThan(0);
    expect(mix[0]).toBe(0);
  });
  it("builds download URLs with the layer selection", () => {
    expect(withSelection("/m.wav", ["dust", "sulfate"], false)).toBe(
      "/m.wav?layers=dust%2Csulfate&bed=false",
    );
  });
  it("names places", () => {
    expect(placeName(10, 25)).toBe("Sahara");
    expect(placeName(0, -80)).toBe("Antarctica");
  });
});
