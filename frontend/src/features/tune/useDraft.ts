import { useRef, useState } from "react";
import type { Preset } from "../presets";

// `latest` is read by handlers that fire before React re-renders with the new draft.
export function useDraft<P extends Preset>(base: P, schedule: (next: Preset) => void) {
  const latest = useRef<P>(base);
  const [draft, setDraft] = useState<P>(base);

  const show = (next: P) => {
    latest.current = next;
    setDraft(next);
  };

  const commit = (next: P) => {
    show(next);
    schedule(next);
  };

  const withSettings = (patch: Partial<P["settings"]>): P => ({
    ...latest.current,
    settings: { ...latest.current.settings, ...patch },
  });

  return { draft, latest, show, commit, withSettings };
}
