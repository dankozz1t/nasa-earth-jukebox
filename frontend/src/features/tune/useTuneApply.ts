import { getPlayer } from "../../audio/player-instance";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  findPreset,
  isPlayPending,
  PRESETS,
  usePreset,
  useSession,
  type Preset,
  type SessionPresetId,
  type Source,
} from "../presets";

const TUNE_DEBOUNCE_MS = 400;

export function baseFor(
  source: Source,
  presetId: SessionPresetId,
  custom: Preset | undefined,
): Preset {
  const current = findPreset(presetId, custom);
  if (current?.source === source) return current;
  return PRESETS.find((p) => p.source === source) ?? PRESETS[0]!;
}

function sameMix(a: Preset, b: Preset): boolean {
  const sameSettings = JSON.stringify(a.settings) === JSON.stringify(b.settings);

  if (a.source === "live" && b.source === "live") {
    return a.repeat === b.repeat && sameSettings;
  }
  if (a.source === "nasa" && b.source === "nasa") {
    return a.bed === b.bed && a.file === b.file && sameSettings;
  }

  return false;
}

interface TuneApply {
  schedule(next: Preset): void;
  // A change that needs no new composition (the drone): joins a waiting change, otherwise does nothing.
  amend(next: Preset): void;
  busy: boolean;
}

// Lives as long as the drawer, not its content, so a change made just before closing still goes through.
export function useTuneApply(base: Preset): TuneApply {
  const { pick, progress } = usePreset();
  const [waiting, setWaiting] = useState(false);
  const timer = useRef(0);
  const pending = useRef<Preset | null>(null);
  const baseRef = useRef(base);

  useEffect(() => {
    baseRef.current = base;
  }, [base]);

  const fire = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;

    const next = pending.current;
    pending.current = null;
    setWaiting(false);
    if (!next) return;

    useSession.getState().setCustom(next);

    // This runs from a timer, not a gesture, so while nothing plays it only prepares the mix (autoplay rule).
    // A click still loading its sound counts as playing: it must not turn silent.
    void pick("custom", { play: getPlayer().playing || isPlayPending() });
  }, [pick]);

  const schedule = useCallback(
    (next: Preset) => {
      window.clearTimeout(timer.current);

      // Everything was put back to what sounds: nothing to wait for, no wave to show.
      if (sameMix(next, baseRef.current)) {
        useSession.getState().setPreview(null);
        pending.current = null;
        timer.current = 0;
        setWaiting(false);
        return;
      }

      pending.current = next;
      setWaiting(true);
      timer.current = window.setTimeout(fire, TUNE_DEBOUNCE_MS);
    },
    [fire],
  );

  const amend = useCallback((next: Preset) => {
    if (pending.current) pending.current = next;
  }, []);

  // Unmounting with a change waiting (a route change) lets it through rather than losing it.
  useEffect(
    () => () => {
      if (pending.current) fire();
    },
    [fire],
  );

  return { schedule, amend, busy: waiting || progress.custom !== undefined };
}
