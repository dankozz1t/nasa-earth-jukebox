// Coarse geography for an equirectangular world frame centred on 0°: enough for spoken descriptions.

import { getLang, t, type Lang } from "../../../shared/i18n";

export function xToLon(xFrac: number): number {
  return -180 + xFrac * 360;
}

export function yToLat(yFrac: number): number {
  return 90 - yFrac * 180;
}

export function formatLon(lon: number, lang: Lang = getLang()): string {
  const r = Math.round(lon);
  if (r === 0) return "0°";
  if (lang === "uk") return `${Math.abs(r)}° ${r < 0 ? "з. д." : "с. д."}`;
  return `${Math.abs(r)}°${r < 0 ? "W" : "E"}`;
}

export function formatLat(lat: number, lang: Lang = getLang()): string {
  const r = Math.round(lat);
  if (r === 0) return t("the equator", {}, lang);
  if (lang === "uk") return `${Math.abs(r)}° ${r < 0 ? "пд. ш." : "пн. ш."}`;
  return `${Math.abs(r)}°${r < 0 ? "S" : "N"}`;
}

interface Box {
  name: string;
  uk: string; // genitive, because it follows "біля"
  lon: [number, number];
  lat: [number, number];
}

// Ordered from specific to general; the first match wins.
const BOXES: Box[] = [
  { name: "Sahara", uk: "Сахари", lon: [-17, 32], lat: [15, 33] },
  { name: "Mediterranean", uk: "Середземномор'я", lon: [-6, 36], lat: [30, 46] },
  { name: "Arabian Peninsula", uk: "Аравійського півострова", lon: [35, 60], lat: [12, 32] },
  { name: "Central Africa", uk: "Центральної Африки", lon: [8, 42], lat: [-18, 15] },
  { name: "Southern Africa", uk: "Південної Африки", lon: [10, 42], lat: [-35, -18] },
  { name: "Europe", uk: "Європи", lon: [-10, 40], lat: [36, 72] },
  { name: "Siberia", uk: "Сибіру", lon: [60, 180], lat: [50, 78] },
  { name: "India", uk: "Індії", lon: [68, 92], lat: [6, 32] },
  { name: "China and East Asia", uk: "Китаю та Східної Азії", lon: [92, 145], lat: [20, 50] },
  { name: "Southeast Asia", uk: "Південно-Східної Азії", lon: [92, 140], lat: [-10, 20] },
  { name: "Central Asia", uk: "Центральної Азії", lon: [45, 92], lat: [32, 50] },
  { name: "Australia", uk: "Австралії", lon: [112, 155], lat: [-40, -10] },
  { name: "the Caribbean", uk: "Карибів", lon: [-90, -59], lat: [10, 25] },
  { name: "the Amazon", uk: "Амазонії", lon: [-75, -45], lat: [-15, 5] },
  { name: "South America", uk: "Південної Америки", lon: [-82, -34], lat: [-56, 12] },
  {
    name: "Central America and Mexico",
    uk: "Центральної Америки та Мексики",
    lon: [-118, -77],
    lat: [7, 32],
  },
  { name: "the United States", uk: "США", lon: [-125, -66], lat: [25, 49] },
  { name: "Canada and Alaska", uk: "Канади та Аляски", lon: [-170, -52], lat: [49, 75] },
  { name: "Greenland", uk: "Гренландії", lon: [-73, -12], lat: [59, 84] },
  { name: "Antarctica", uk: "Антарктиди", lon: [-180, 180], lat: [-90, -63] },
  { name: "the Arctic", uk: "Арктики", lon: [-180, 180], lat: [72, 90] },
  { name: "the Southern Ocean", uk: "Південного океану", lon: [-180, 180], lat: [-63, -45] },
  { name: "the North Atlantic", uk: "Північної Атлантики", lon: [-80, -6], lat: [0, 72] },
  { name: "the South Atlantic", uk: "Південної Атлантики", lon: [-70, 20], lat: [-45, 0] },
  { name: "the Indian Ocean", uk: "Індійського океану", lon: [20, 120], lat: [-45, 25] },
  {
    name: "the North Pacific",
    uk: "північної частини Тихого океану",
    lon: [-180, -100],
    lat: [0, 66],
  },
  {
    name: "the North Pacific",
    uk: "північної частини Тихого океану",
    lon: [120, 180],
    lat: [0, 66],
  },
  {
    name: "the South Pacific",
    uk: "південної частини Тихого океану",
    lon: [-180, -70],
    lat: [-45, 0],
  },
  {
    name: "the South Pacific",
    uk: "південної частини Тихого океану",
    lon: [150, 180],
    lat: [-45, 0],
  },
];

export function placeName(lon: number, lat: number, lang: Lang = getLang()): string {
  const box = BOXES.find(
    (b) => lon >= b.lon[0] && lon <= b.lon[1] && lat >= b.lat[0] && lat <= b.lat[1],
  );
  if (box) return lang === "uk" ? box.uk : box.name;

  return lang === "uk" ? "відкритого океану" : "open ocean";
}

const REGIONS: [number, string, string][] = [
  [-125, "the Pacific Ocean", "Тихий океан"],
  [-60, "the Americas", "Америки"],
  [-20, "the Atlantic Ocean", "Атлантичний океан"],
  [50, "Europe and Africa", "Європа та Африка"],
  [100, "Asia and the Indian Ocean", "Азія та Індійський океан"],
  [155, "East Asia and Australia", "Східна Азія та Австралія"],
];

export function longitudeRegion(lon: number, lang: Lang = getLang()): string {
  for (const [limit, enName, ukName] of REGIONS) {
    if (lon < limit) return lang === "uk" ? ukName : enName;
  }

  return lang === "uk" ? "Тихий океан" : "the Pacific Ocean";
}
