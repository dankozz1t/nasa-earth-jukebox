import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useToast } from "../../shared/ui";
import { usePrefs } from "../access/prefs.store";
import {
  pickPreset,
  prefetchCompose,
  prefetchDefault,
  stageSelection,
  switchSource,
  usePresetStatus,
  type PresetDeps,
  type Progress,
  type TourReadiness,
} from "./engine";
import { DEFAULT_PRESET, presetById, type PresetId } from "./presets";
import { useSession, type SessionPresetId, type Source } from "./session.store";

interface PickOptions {
  play?: boolean; // false selects and warms the preset without sound (deep links)
}

interface UsePreset {
  pick(id: SessionPresetId, opts?: PickOptions): Promise<void>;
  prefetchCompose(id: PresetId): void;
  prefetchDefault(): Promise<void>;
  progress: Partial<Record<SessionPresetId, Progress>>;
  error?: string;
  errorId?: SessionPresetId; // the preset whose pick failed with `error`
  tour?: TourReadiness;
}

export function usePreset(): UsePreset {
  const queryClient = useQueryClient();
  const { show, dismiss } = useToast();

  const progress = usePresetStatus((s) => s.progress);
  const error = usePresetStatus((s) => s.error);
  const errorId = usePresetStatus((s) => s.errorId);
  const tour = usePresetStatus((s) => s.tour);

  const actions = useMemo(() => {
    const deps: PresetDeps = { queryClient, toast: show, dismiss };

    return {
      pick: (id: SessionPresetId, opts?: PickOptions) => pickPreset(deps, id, opts?.play ?? true),
      prefetchCompose: (id: PresetId) => prefetchCompose(deps, id),
      prefetchDefault: () => prefetchDefault(deps),
    };
  }, [queryClient, show, dismiss]);

  return { ...actions, progress, error, errorId, tour };
}

// Loading in silence stays quiet: a failure shows on the stage with Try again, not as a toast.
function useQuietDeps(): PresetDeps {
  const queryClient = useQueryClient();
  return useMemo(() => ({ queryClient, toast: () => undefined }), [queryClient]);
}

// The archive / live switch. Its own hook, apart from usePreset, so the switch works wherever it is shown.
export function useSwitchSource(): (source: Source) => void {
  const deps = useQuietDeps();
  return useCallback((source: Source) => switchSource(deps, source), [deps]);
}

// For the map: puts the shown row's record on the player in silence, so a hover can sound it.
export function useStageSelection(): () => Promise<boolean> {
  const deps = useQuietDeps();
  return useCallback(() => stageSelection(deps), [deps]);
}

// The load progress of one pick, for places outside the shelf (the player bar).
export function usePickProgress(id: SessionPresetId): Progress | undefined {
  return usePresetStatus((s) => s.progress[id]);
}

// On the first visit to / in an app session, ?p=<id> (else the last played preset) is selected without
// sound. Later the URL follows the selection; coming back to / keeps it.
export function usePresetUrlSync(): void {
  const [params, setParams] = useSearchParams();
  const { pick } = usePreset();
  const presetId = useSession((s) => s.presetId);

  // State, not a ref: once the start-up selection is done, the URL effect runs again with the selection,
  // which also puts ?p= back after a visit to another page.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started || presetId === "custom" || params.get("p") === presetId) return;
    if (!params.has("p") && presetId === DEFAULT_PRESET) return; // the default keeps a clean URL

    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("p", presetId);
        return next;
      },
      { replace: true },
    );
  }, [started, presetId, params, setParams]);

  useEffect(() => {
    if (started) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- once per mount: gates the URL effect above
    setStarted(true);
    if (useSession.getState().booted) return;

    useSession.setState({ booted: true });

    const p = params.get("p");
    if (presetById(p)) void pick(p as PresetId, { play: false });
    else useSession.getState().pick(usePrefs.getState().lastPreset);
  }, [started, params, pick]);
}
