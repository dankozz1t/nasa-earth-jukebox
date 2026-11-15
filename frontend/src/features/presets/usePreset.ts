import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useToast } from "../../shared/ui";
import { usePrefs } from "../access/prefs.store";
import {
  pickPreset,
  prefetchCompose,
  prefetchDefault,
  usePresetStatus,
  type PresetDeps,
  type Progress,
  type TourReadiness,
} from "./engine";
import { DEFAULT_PRESET, presetById, type PresetId } from "./presets";
import { useSession, type SessionPresetId } from "./session.store";

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
