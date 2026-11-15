import { describe, expect, it } from "vitest";
import type { Soundscape } from "../src/shared/api/aerosols";
import {
  captionLines,
  describeSpot,
  describeStep,
  mapSentence,
} from "../src/features/aerosols/model/describe";
import {
  segments,
  toBraille,
  toCsv,
  toTactileSvg,
  toVtt,
} from "../src/features/save/model/exports";
import { dictFor, KEYS, LAYER_TEXT, setLang, t } from "../src/shared/i18n";

const layer = (key: string, share: number) => ({
  key,
  label: key,
  color: "#ffffff",
  voice: "",
  about: "",
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
    layer("black_carbon", 0),
    layer("dust", 0.7),
    layer("sea_salt", 0),
    layer("sulfate", 0.3),
  ],
  profiles: [
    { coverage: [0, 0, 0, 0], position: [null, null, null, null] },
    { coverage: [0, 0, 0.5, 0.5], position: [null, null, 0.35, 0.35] },
    { coverage: [0, 0, 0, 0], position: [null, null, null, null] },
    { coverage: [0.2, 0, 0, 0], position: [0.2, null, null, null] },
  ],
  steps: [
    { chord: "Dm9", strength: [0, 0, 0, 0.5] },
    { chord: "Dm9", strength: [0, 0, 0, 0] },
    { chord: "Gsus2", strength: [0, 0.9, 0, 0] },
    { chord: "Gsus2", strength: [0, 0.9, 0, 0] },
  ],
  notes: [],
  bed: [],
  artifacts: { classMap: "", stems: {}, mix: "", midi: "" },
  frame: null,
};

describe("translations", () => {
  it("has every English key in Ukrainian, with the same placeholders", () => {
    const uk = dictFor("uk");
    const missing = KEYS.filter((k) => !(k in uk));
    expect(missing).toEqual([]);
    for (const k of KEYS) {
      const holes = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
      expect(holes(uk[k]), k).toBe(holes(dictFor("en")[k]));
    }
  });
  it("names every layer in both languages", () => {
    for (const key of ["black_carbon", "dust", "sea_salt", "sulfate"]) {
      expect(LAYER_TEXT.uk[key].label).toBeTruthy();
      expect(LAYER_TEXT.en[key].voice).toBeTruthy();
    }
  });
});

describe("generated text", () => {
  it("describes in Ukrainian", () => {
    setLang("uk");
    expect(describeStep(s, 2)).toBe(
      "45° с. д., Європа та Африка. Пил сильно біля Аравійського півострова.",
    );
    expect(describeSpot(s, 0.5, 0.35, [0, 0.8, 0, 0])).toBe("Сахари (27° пн. ш., 0°): Пил 80%");
    expect(captionLines(s, 1)).toEqual([t("captions.silence")]);
    expect(mapSentence(s)).toBe("Карта з 2 типів аерозолів. Найбільше: Пил 70%, Сульфати 30%.");
    setLang("en");
  });
  it("captions say voice, pitch and loudness", () => {
    expect(captionLines(s, 0)).toEqual(["Bell (Sulfate) · high, clear"]);
    expect(captionLines(s, 2)).toEqual(["Warm pad (Dust) · high, strong"]);
  });
});

describe("exports", () => {
  it("writes valid WebVTT with readable ~4 s cues", () => {
    const vtt = toVtt(s); // 2 s steps -> 2 steps per cue
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:04.000");
    expect(vtt).toContain("00:00:04.000 --> 00:00:08.000");
    expect(vtt).toContain("♪ Bell (Sulfate) · high, clear");
    expect(vtt).toContain("♪ Warm pad (Dust)");
    expect(vtt.match(/-->/g)).toHaveLength(2);
  });
  it("merges equal neighbouring segments", () => {
    expect(segments(s, () => "same")).toEqual([{ from: 0, to: 8, text: "same" }]);
  });
  it("writes one CSV row per step with three columns per layer", () => {
    const rows = toCsv(s).trim().split("\n");
    expect(rows).toHaveLength(5);
    expect(rows[0].split(",")).toHaveLength(4 + 4 * 3);
    expect(rows[3]).toContain("Gsus2");
  });
  it("draws a tactile SVG with textures, reference lines and braille", () => {
    const map = new Uint8Array(32).fill(2);
    const svg = toTactileSvg(s, map, "Test", 4);
    expect(svg).toContain('<pattern id="t2"');
    expect(svg).toContain('fill="url(#t2)"');
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain(toBraille("Dust"));
    expect(svg).not.toMatch(/fill="#(?!000|fff)/i); // black and white only
  });
  it("transliterates braille", () => {
    expect(toBraille("Sea Salt")).toBe("⠎⠑⠁⠀⠎⠁⠇⠞");
  });
});
