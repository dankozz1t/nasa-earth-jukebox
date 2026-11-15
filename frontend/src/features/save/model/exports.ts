import type { Soundscape } from "../../../shared/api/aerosols";
import type { WeatherSoundscape } from "../../../shared/api/weather";
import { TEXTURES, type Texture } from "../../access/prefs";
import { captionLines, describeRange, summarize } from "../../aerosols/model/describe";
import { xToLon, yToLat } from "../../aerosols/model/geo";
import { layerText, rationaleText, t } from "../../../shared/i18n";

function vttTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");

  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

// Captions need time to be read: about 4 s per cue is a WCAG-friendly reading speed.
const CUE_SEC = 4;

// Neighbours with identical text are merged. `text(from, to)` describes the steps [from, to).
export function segments(
  s: Soundscape,
  text: (from: number, to: number) => string,
): { from: number; to: number; text: string }[] {
  const window = Math.max(1, Math.round(CUE_SEC / s.stepSec));
  const out: { from: number; to: number; text: string }[] = [];

  for (let b = 0; b < s.bins; b += window) {
    const end = Math.min(s.bins, b + window);
    const line = text(b, end);
    const last = out[out.length - 1];

    if (last && last.text === line) {
      last.to = end * s.stepSec;
    } else {
      out.push({ from: b * s.stepSec, to: end * s.stepSec, text: line });
    }
  }

  return out;
}

function loudestStep(s: Soundscape, from: number, to: number): number {
  const sum = (b: number) => s.steps[b].strength.reduce((a, v) => a + v, 0);

  let best = from;
  for (let b = from; b < to; b++) {
    if (sum(b) > sum(best)) best = b;
  }
  return best;
}

export function toVtt(s: Soundscape): string {
  const cues = segments(s, (from, to) => {
    const sounds = captionLines(s, loudestStep(s, from, to)).map((l) => `♪ ${l}`);
    return [describeRange(s, from, to), ...sounds].join("\n");
  });

  return [
    "WEBVTT",
    "",
    ...cues.map((c, i) => `${i + 1}\n${vttTime(c.from)} --> ${vttTime(c.to)}\n${c.text}\n`),
  ].join("\n");
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, "");

export function toTranscript(s: Soundscape, title: string): string {
  const lines = [title, "=".repeat(Math.min(80, title.length)), ""];

  for (let i = 1; i <= 4; i++) {
    lines.push(`- ${stripTags(t(`how.${i}`))}`);
  }

  lines.push("", `## ${t("layers.legend")}`, "");
  for (const item of summarize(s)) {
    lines.push(`${item.label}: ${item.text}`, "");
  }

  lines.push(`## ${t("desc.title")}`, "");
  for (const seg of segments(s, (from, to) => describeRange(s, from, to))) {
    lines.push(`[${vttTime(seg.from).slice(3, 8)}] ${seg.text}`);
  }

  lines.push("", stripTags(t("data.2")));
  return lines.join("\n");
}

// One row per scan step; opens in TwoTone, Highcharts Sonification Studio and any spreadsheet.
export function toCsv(s: Soundscape): string {
  const head = ["step", "time_s", "longitude", "chord"];
  for (const l of s.layers) {
    head.push(`${l.key}_coverage`, `${l.key}_strength`, `${l.key}_latitude`);
  }

  const rows = [head.join(",")];

  for (let b = 0; b < s.bins; b++) {
    const row: (string | number)[] = [
      b,
      (b * s.stepSec).toFixed(3),
      xToLon((b + 0.5) / s.bins).toFixed(2),
      s.steps[b].chord,
    ];

    s.layers.forEach((_, k) => {
      const y = s.profiles[k].position[b];
      row.push(
        s.profiles[k].coverage[b].toFixed(6),
        s.steps[b].strength[k].toFixed(4),
        y === null ? "" : yToLat(y).toFixed(2),
      );
    });

    rows.push(row.join(","));
  }

  return rows.join("\n") + "\n";
}

const BRAILLE: Record<string, string> = {
  a: "⠁",
  b: "⠃",
  c: "⠉",
  d: "⠙",
  e: "⠑",
  f: "⠋",
  g: "⠛",
  h: "⠓",
  i: "⠊",
  j: "⠚",
  k: "⠅",
  l: "⠇",
  m: "⠍",
  n: "⠝",
  o: "⠕",
  p: "⠏",
  q: "⠟",
  r: "⠗",
  s: "⠎",
  t: "⠞",
  u: "⠥",
  v: "⠧",
  w: "⠺",
  x: "⠭",
  y: "⠽",
  z: "⠵",
  " ": "⠀",
};

export function toBraille(text: string): string {
  return Array.from(text.toLowerCase())
    .map((c) => BRAILLE[c] ?? "")
    .join("");
}

function pattern(id: string, texture: Texture): string {
  const s = 'stroke="#000" stroke-width="1.6"';
  const body: Record<Texture, string> = {
    dots: '<circle cx="3" cy="3" r="1.6" fill="#000"/>',
    diagonal: `<path d="M0 6 L6 0" ${s}/>`,
    horizontal: `<path d="M0 3 H6" ${s}/>`,
    cross: `<path d="M0 0 L6 6 M6 0 L0 6" ${s}/>`,
  };

  return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse">${body[texture]}</pattern>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The layer that covers at least a quarter of the cell, else 0 (blank). Samples every second pixel.
function dominantClass(
  s: Soundscape,
  classMap: Uint8Array,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number {
  const counts = new Array<number>(s.layers.length + 1).fill(0);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      counts[classMap[y * s.width + x]]++;
    }
  }

  const total = counts.reduce((a, b) => a + b, 0);
  let best = 0;
  let bestCount = 0;
  for (let k = 1; k < counts.length; k++) {
    if (counts[k] > bestCount) {
      best = k;
      bestCount = counts[k];
    }
  }

  return best > 0 && bestCount / Math.max(1, total) >= 0.25 ? best : 0;
}

// Black and white, one texture per layer: ready for swell paper or a braille embosser that prints graphics.
export function toTactileSvg(
  s: Soundscape,
  classMap: Uint8Array,
  title: string,
  columns = 160,
): string {
  const rows = Math.max(1, Math.round((columns * s.height) / s.width));
  const cell = 6;
  const mapW = columns * cell;
  const mapH = rows * cell;
  const legendH = 40 + s.layers.length * 34;
  const cw = s.width / columns;
  const ch = s.height / rows;

  const cellClass = (r: number, c: number) => {
    const x0 = Math.floor(c * cw);
    const x1 = Math.min(s.width, Math.floor((c + 1) * cw));
    const y0 = Math.floor(r * ch);
    const y1 = Math.min(s.height, Math.floor((r + 1) * ch));
    return dominantClass(s, classMap, x0, x1, y0, y1);
  };

  // Neighbouring cells of one class become a single run-length rect.
  const rects: string[] = [];
  for (let r = 0; r < rows; r++) {
    let runStart = -1;
    let runClass = 0;

    const flush = (end: number) => {
      if (runClass <= 0) return;

      const x = runStart * cell;
      const width = (end - runStart) * cell;
      rects.push(
        `<rect x="${x}" y="${r * cell}" width="${width}" height="${cell}" fill="url(#t${runClass})"/>`,
      );
    };

    for (let c = 0; c <= columns; c++) {
      const cls = c < columns ? cellClass(r, c) : 0;
      if (cls !== runClass) {
        flush(c);
        runStart = c;
        runClass = cls;
      }
    }
  }

  const defs = s.layers.map((l, k) => pattern(`t${k + 1}`, TEXTURES[l.key] ?? "dots")).join("");
  const legend = s.layers
    .map((l, k) => {
      const y = mapH + 50 + k * 34;
      const label = layerText(l.key).label;
      return (
        `<rect x="0" y="${y}" width="44" height="24" fill="url(#t${k + 1})" stroke="#000" stroke-width="2"/>` +
        `<text x="56" y="${y + 18}" font-size="18">${escapeXml(label)}</text>` +
        `<text x="300" y="${y + 18}" font-size="22">${toBraille(layerText(l.key, "en").label)}</text>`
      );
    })
    .join("");

  const heading = escapeXml(t("tactile.title", { title }));
  const viewH = mapH + legendH + 50;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -40 ${mapW + 20} ${viewH}" font-family="Arial, sans-serif" role="img" aria-label="${heading}">`,
    `<title>${heading}</title>`,
    `<defs>${defs}</defs>`,
    `<rect x="-10" y="-40" width="${mapW + 20}" height="${viewH}" fill="#fff"/>`,
    `<text x="0" y="-14" font-size="20" font-weight="bold">${heading}</text>`,
    rects.join(""),
    `<rect x="0" y="0" width="${mapW}" height="${mapH}" fill="none" stroke="#000" stroke-width="3"/>`,
    // The equator and the prime meridian as raised reference lines.
    `<line x1="0" y1="${mapH / 2}" x2="${mapW}" y2="${mapH / 2}" stroke="#000" stroke-width="2.5" stroke-dasharray="10 6"/>`,
    `<line x1="${mapW / 2}" y1="0" x2="${mapW / 2}" y2="${mapH}" stroke="#000" stroke-width="2.5" stroke-dasharray="10 6"/>`,
    `<text x="0" y="${mapH + 30}" font-size="18" font-weight="bold">${escapeXml(t("tactile.legend"))}</text>`,
    legend,
    "</svg>",
  ].join("\n");
}

export function toScoreJson(s: WeatherSoundscape): string {
  return JSON.stringify(
    {
      title: s.title,
      composer: s.composer,
      mode: s.mode,
      tempoBpm: s.tempoBpm,
      section: s.section,
      observedAt: s.observedAt,
      source: s.source,
      wave: { cycles: s.cycles, amplitude: s.amplitude },
      rationale: { en: s.rationaleEn, uk: rationaleText(s, "uk") },
      bars: s.bars,
      notes: s.notes,
    },
    null,
    2,
  );
}
