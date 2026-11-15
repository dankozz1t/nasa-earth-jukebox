import { useQuery } from "@tanstack/react-query";
import { aerosolApi, ApiError } from "./aerosols";
import { nextRefetchMs } from "./client";
import { weatherApi } from "./weather";

export const queryKeys = {
  weather: {
    grid: ["weather", "grid"] as const,
    readings: (observedAt?: string) => ["weather", "readings", observedAt ?? null] as const,
    sections: ["weather", "sections"] as const,
    composer: ["weather", "composer"] as const,
  },
  frames: ["frames"] as const,
  compose: (source: string, hash: string) => ["compose", source, hash] as const,
};

const gridQuery = { queryKey: queryKeys.weather.grid, queryFn: weatherApi.grid };
const COMPOSER_STALE_MS = 5 * 60_000;

export function useFrames() {
  return useQuery({ queryKey: queryKeys.frames, queryFn: aerosolApi.frames, staleTime: Infinity });
}

export function useSections() {
  return useQuery({
    queryKey: queryKeys.weather.sections,
    queryFn: weatherApi.sections,
    staleTime: Infinity,
  });
}

// Reads the grid that useLiveGridSync fetches; a retry may call `refetch` on it.
export function useLiveGrid() {
  return useQuery({ ...gridQuery, enabled: false });
}

// The one place that fetches the grid and keeps it fresh, while `active` (live on screen or on the player).
// Everything else reads the cache through useLiveGrid, so the archive asks the server for no weather at all.
export function useLiveGridSync(active: boolean) {
  return useQuery({
    ...gridQuery,
    enabled: active,
    // Fresh until the server's next update is due: a switch back to live reads the cache.
    staleTime: (q) => nextRefetchMs(q.state.data, Date.now()),
    refetchInterval: (q) => (active ? nextRefetchMs(q.state.data, Date.now()) : false),
    refetchOnWindowFocus: active,
  });
}

// Reads the grid that useLiveGridSync keeps fresh; it never fetches the grid itself.
export function useReadings() {
  const grid = useQuery({ ...gridQuery, enabled: false });

  return useQuery({
    queryKey: queryKeys.weather.readings(grid.data?.observedAt),
    queryFn: weatherApi.readings,
    staleTime: () => nextRefetchMs(grid.data, Date.now()),
    refetchInterval: () => nextRefetchMs(grid.data, Date.now()),
    refetchOnWindowFocus: true,
    // An older backend has no history endpoint: the strip falls back to the grid's own reading, no retries.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
}

export function useComposerStatus() {
  // Changes only with the server's settings.
  return useQuery({
    queryKey: queryKeys.weather.composer,
    queryFn: weatherApi.composer,
    staleTime: COMPOSER_STALE_MS,
  });
}
