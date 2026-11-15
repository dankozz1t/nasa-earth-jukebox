import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { getNarrator, getPlayer } from "../../audio/player-instance";
import { applyPrefs } from "./applyPrefs";
import {
  defaultPrefs,
  migratePrefs,
  PREFS_KEY,
  PREFS_KEY_V1,
  PREFS_VERSION,
  upgradePrefs,
  type Prefs,
} from "./prefs";
import { useVibrateWithSound } from "./vibrate-with-sound";

// Never throws (private mode, blocked storage). Falls back to the v1 key while v2 is absent.
const safeStorage: StateStorage = {
  getItem(name) {
    try {
      const v2 = localStorage.getItem(name);
      if (v2 !== null) return v2;

      const v1 = localStorage.getItem(PREFS_KEY_V1);
      return v1 === null ? null : JSON.stringify({ state: JSON.parse(v1), version: 0 });
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Prefs just do not persist.
    }
  },
  removeItem(name) {
    try {
      localStorage.removeItem(name);
    } catch {
      // Prefs just do not persist.
    }
  },
};

export const usePrefs = create<Prefs>()(
  persist(() => defaultPrefs(), {
    name: PREFS_KEY,
    storage: createJSONStorage(() => safeStorage),
    version: PREFS_VERSION,
    migrate: upgradePrefs,
    merge: (saved, current) => ({ ...current, ...migratePrefs(saved) }),
  }),
);

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  usePrefs.setState({ [key]: value } as Pick<Prefs, K>);
}

// The language, theme and last preset are header choices, not accessibility settings, so they stay.
export function resetToSystem(): void {
  const { lang, theme, lastPreset } = usePrefs.getState();
  usePrefs.setState({ ...defaultPrefs(), lang, theme, lastPreset });
}

export function PrefsEffects() {
  const prefs = usePrefs();
  useVibrateWithSound(prefs.vibrate);

  useEffect(() => applyPrefs(prefs), [prefs]);

  useEffect(() => {
    getPlayer().setVolume(prefs.volume);
  }, [prefs.volume]);

  useEffect(() => {
    const narrator = getNarrator();
    narrator.lang = prefs.lang;
    narrator.rate = prefs.speechRate;
    narrator.enabled = prefs.speech;
  }, [prefs.lang, prefs.speechRate, prefs.speech]);

  return null;
}
