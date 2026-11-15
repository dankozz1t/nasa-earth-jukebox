// Compositions go through the Query cache, so a hover prefetch, a click and the idle warm-up share one request.

import { hashKey, isCancelledError, type QueryClient, type QueryKey } from "@tanstack/react-query";
import {
  aerosolApi,
  queryKeys,
  weatherApi,
  type ComposerMode,
  type WeatherGrid,
  type WeatherSettings,
  type WeatherSoundscape,
} from "../../shared/api";
import { abortable } from "../../shared/lib/abort";
import type { Preset } from "./presets";
import type { AnySoundscape } from "./session.store";

const LIVE_STALE_FALLBACK_MS = 60_000;
const UPLOAD_STALE_MS = 5 * 60_000;

// "AI composes" starts with the rules version of the same layer, which is quick.
export function rulesFirst(p: Preset): boolean {
  return p.source === "live" && p.settings.composer === "ai";
}

function liveStaleMs(qc: QueryClient): number {
  const grid = qc.getQueryData<WeatherGrid>(queryKeys.weather.grid);
  const due = Date.parse(grid?.nextUpdateAt ?? "");

  return Number.isFinite(due) ? Math.max(0, due - Date.now()) : LIVE_STALE_FALLBACK_MS;
}

// `keys` collects the query keys, so a newer pick can cancel them.
async function cachedCompose<T>(
  qc: QueryClient,
  key: QueryKey,
  fn: (signal: AbortSignal) => Promise<T>,
  staleTime: number,
  signal?: AbortSignal,
  keys?: QueryKey[],
): Promise<T> {
  keys?.push(key);

  for (let attempt = 0; ; attempt++) {
    try {
      const p = qc.fetchQuery({
        queryKey: key,
        queryFn: ({ signal: s }) => fn(s),
        staleTime,
        retry: false,
      });
      return await abortable(p, signal);
    } catch (err) {
      // An older pick cancelled the shared request we joined: ask again once.
      if (attempt === 0 && isCancelledError(err) && !signal?.aborted) continue;
      throw err;
    }
  }
}

export function composeLive(
  qc: QueryClient,
  settings: WeatherSettings,
  signal?: AbortSignal,
  keys?: QueryKey[],
): Promise<WeatherSoundscape> {
  const observedAt = qc.getQueryData<WeatherGrid>(queryKeys.weather.grid)?.observedAt ?? null;
  const key = queryKeys.compose("live", hashKey([{ ...settings, observedAt }]));

  return cachedCompose(
    qc,
    key,
    (s) => weatherApi.compose(settings, s),
    liveStaleMs(qc),
    signal,
    keys,
  );
}

export function composePreset(
  qc: QueryClient,
  preset: Preset,
  signal?: AbortSignal,
  keys?: QueryKey[],
  composer?: ComposerMode,
): Promise<AnySoundscape> {
  if (preset.source === "live") {
    const c = composer ?? (rulesFirst(preset) ? "algorithmic" : preset.settings.composer);
    return composeLive(qc, { ...preset.settings, composer: c }, signal, keys);
  }

  const { frameId, ...settings } = preset.settings;
  const { file } = preset;

  if (file) {
    // The server keeps the artifacts of an uploaded frame only briefly, so the answer is cached briefly too.
    const key = queryKeys.compose(
      "nasa-upload",
      hashKey([settings, file.name, file.size, file.lastModified]),
    );
    const upload = (s: AbortSignal) => aerosolApi.upload(file, settings, s);
    return cachedCompose(qc, key, upload, UPLOAD_STALE_MS, signal, keys);
  }

  const key = queryKeys.compose("nasa", hashKey([preset.settings]));
  const compose = (s: AbortSignal) => aerosolApi.compose(frameId, settings, s);
  return cachedCompose(qc, key, compose, Infinity, signal, keys);
}
