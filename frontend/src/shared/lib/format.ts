// Dates and times always go through Intl in the interface language: no hand-made formats.

import type { Lang } from "../i18n";

const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function formatDate(iso: string, lang: Lang, options: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat(lang, options).format(d);
}

export function formatDateUtc(iso: string, lang: Lang): string {
  return formatDate(iso, lang, { ...DATE, timeZone: "UTC" });
}

export function formatDateTimeUtc(iso: string, lang: Lang): string {
  return formatDate(iso, lang, { ...DATE, ...TIME, timeZone: "UTC" });
}

// In the person's own time zone
export function formatTimeLocal(iso: string, lang: Lang): string {
  return formatDate(iso, lang, TIME);
}

export function formatTimeUtc(iso: string, lang: Lang): string {
  return formatDate(iso, lang, { ...TIME, timeZone: "UTC" });
}

// Playback time as m:ss; negative or non-finite input reads as 0:00.
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const two = new Intl.NumberFormat("en", { minimumIntegerDigits: 2, useGrouping: false });

  return `${Math.floor(total / 60)}:${two.format(total % 60)}`;
}
