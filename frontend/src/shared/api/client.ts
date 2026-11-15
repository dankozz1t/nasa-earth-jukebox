import type { t } from "../i18n";
import type { WeatherGrid } from "./weather";

type TFn = typeof t;

const MIN_REFETCH_MS = 60_000;
// The server answered with its old grid and is fetching the new one: look again soon, not a minute later.
const REFRESHING_REFETCH_MS = 15_000;
const REFRESHING = /^Refreshing live data/;

// One minute after the server's next update, never under one minute.
export function nextRefetchMs(grid: WeatherGrid | undefined, now: number): number {
  if (!grid || grid.isSnapshot || !grid.nextUpdateAt) return MIN_REFETCH_MS;

  const due = Date.parse(grid.nextUpdateAt);
  if (!Number.isFinite(due)) return MIN_REFETCH_MS;

  const refreshing = grid.notes.some((n) => REFRESHING.test(n));
  if (due <= now && refreshing) return REFRESHING_REFETCH_MS;

  return Math.max(MIN_REFETCH_MS, due + MIN_REFETCH_MS - now);
}

// Server notes arrive in English. Known ones map to `warn.*` keys; unknown text passes through.
const KNOWN: [RegExp, string][] = [
  [/^Live weather is still loading/, "warn.liveLoading"],
  [/^Live weather (failed to load|is unavailable)/, "warn.liveFailed"],
  [/^Open-Meteo rate limit reached/, "warn.liveRateLimited"],
  [/^Refreshing live data/, "warn.refreshing"],
  [/^Live update failed/, "warn.staleLive"],
  [/^Offline mode/, "warn.offline"],
  [/^AI composer is not configured on the server/, "warn.aiOff"],
  [/^AI score was repaired/, "warn.aiRepaired"],
  [/Used the algorithmic composer instead\.?$/, "warn.aiFailed"],
];

export function localizeWarning(text: string, translate: TFn): string {
  const known = KNOWN.find(([re]) => re.test(text));
  return known ? translate(known[1]) : text;
}
