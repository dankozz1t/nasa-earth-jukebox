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

export function useLiveGrid() {
  return useQuery({
    ...gridQuery,
    refetchInterval: (q) => nextRefetchMs(q.state.data, Date.now()),
    refetchOnWindowFocus: true,
  });
}

// Reads the grid that useLiveGrid keeps fresh; it never fetches the grid itself.
export function useReadings() {
  const grid = useQuery({ ...gridQuery, enabled: false });

  return useQuery({
    queryKey: queryKeys.weather.readings(grid.data?.observedAt),
    queryFn: weatherApi.readings,
    refetchInterval: () => nextRefetchMs(grid.data, Date.now()),
    refetchOnWindowFocus: true,
    // An older backend has no history endpoint: the strip falls back to the grid's own reading, no retries.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
}

export function useComposerStatus() {
  return useQuery({ queryKey: queryKeys.weather.composer, queryFn: weatherApi.composer });
}
