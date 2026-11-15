import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { create } from "zustand";
import { queryKeys, useLiveGridSync, type WeatherGrid } from "../../shared/api";
import { t, useT } from "../../shared/i18n";
import { formatTimeLocal } from "../../shared/lib/format";
import { useToast } from "../../shared/ui";
import { isWeather, refreshLiveForNewReading, useSession } from "../presets";
import { useLiveSection, type Flash } from "../stage";
import { say } from "../transport";
import { changedPoints } from "./model/diff";

const NO_FLASHES: readonly Flash[] = [];

const useFlashes = create<{ flashes: readonly Flash[] }>()(() => ({ flashes: NO_FLASHES }));

export function useLiveFlashes(): readonly Flash[] {
  return useFlashes((s) => s.flashes);
}

export function resetLiveFlashes(): void {
  useFlashes.setState({ flashes: NO_FLASHES });
}

function isGridKey(key: QueryKey): boolean {
  const grid: QueryKey = queryKeys.weather.grid;

  return key.length === grid.length && key.every((part, i) => part === grid[i]);
}

interface LiveUpdatesResult {
  flashes: readonly Flash[];
}

// A new `observedAt` is a new reading; a refetch with the same one is not. The music follows new data on
// every route, while the flashes, toast and announcement belong to the home screen with the live source.
export function useLiveUpdates(): LiveUpdatesResult {
  const liveShown = useSession((s) => s.source === "live");
  const liveOnPlayer = useSession((s) => s.soundscape !== undefined && isWeather(s.soundscape));
  useLiveGridSync(liveShown || liveOnPlayer);
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { lang } = useT();
  const section = useLiveSection();
  const source = useSession((s) => s.source);
  const onHome = useLocation().pathname === "/";
  const flashes = useLiveFlashes();

  const latest = useRef({ section, source, onHome, lang, show });
  useEffect(() => {
    latest.current = { section, source, onHome, lang, show };
  });

  useEffect(() => {
    let prev = queryClient.getQueryData<WeatherGrid>(queryKeys.weather.grid);

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || !isGridKey(event.query.queryKey)) return;
      const next = event.query.state.data as WeatherGrid | undefined;
      if (!next) return;

      const before = prev;
      prev = next;
      if (!before || before.observedAt === next.observedAt) return;

      void refreshLiveForNewReading(queryClient);

      const { section, source, onHome, lang, show } = latest.current;
      if (!onHome || source !== "live") return;

      const startedAt = performance.now();
      const changed = section
        ? changedPoints(before, next, section.key, section).map((p) => ({ ...p, startedAt }))
        : NO_FLASHES;
      useFlashes.setState({ flashes: changed });

      // The toast is quiet: the announcement below is what screen readers hear.
      const time = formatTimeLocal(next.observedAt, lang);
      show(t("live.newReading", { time }, lang), { quiet: true });
      say(t("live.announce", { time }, lang));
    });
  }, [queryClient]);

  return { flashes };
}

// Mounted once under the router, so new readings reach the music on every route.
export function LiveUpdates(): null {
  useLiveUpdates();
  return null;
}
