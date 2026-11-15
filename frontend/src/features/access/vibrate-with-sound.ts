import { useEffect } from "react";
import { getPlayer } from "../../audio/player-instance";
import { vibrateFor } from "../../audio/narrator";
import { isWeather, useSession, type AnySoundscape } from "../presets/session.store";

export const VIBRATE_POLL_MS = 100;

export function pulseAt(
  s: AnySoundscape,
  position: number,
  muted: Readonly<Record<string, boolean>>,
): { slot: number; strengths: number[] } | null {
  if (position < 0 || position >= s.durationSec) return null;

  if (!isWeather(s)) {
    const slot = Math.min(s.bins - 1, Math.floor(position / s.stepSec));
    const step = s.steps[slot];
    if (!step) return null;

    const strengths = step.strength.map((v, k) => (muted[s.layers[k]?.key ?? ""] ? 0 : v));
    return { slot, strengths };
  }

  const barSec = s.tempoBpm > 0 && s.beatsPerBar > 0 ? (60 / s.tempoBpm) * s.beatsPerBar : 2;
  const levels = s.path.level;
  const index = Math.min(levels.length - 1, Math.floor((position / s.durationSec) * levels.length));
  const level = levels.length ? (levels[index] ?? 0) : 0;

  return { slot: Math.floor(position / barSec), strengths: [level] };
}

// Polls the player instead of subscribing to it, so the app shell does not re-render on every step.
export function useVibrateWithSound(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let last = -1;
    const id = window.setInterval(() => {
      const player = getPlayer();
      const { soundscape, muted } = useSession.getState();
      if (!player.playing || !soundscape) {
        last = -1;
        return;
      }

      const pulse = pulseAt(soundscape, player.position, muted);
      if (!pulse || pulse.slot === last) return;

      last = pulse.slot;
      vibrateFor(pulse.strengths);
    }, VIBRATE_POLL_MS);

    return () => window.clearInterval(id);
  }, [enabled]);
}
