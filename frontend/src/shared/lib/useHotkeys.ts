import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

const mounted = new Set<{ current: HotkeyMap }>();

export function registeredHotkeys(): string[] {
  return [...mounted].flatMap((m) => Object.keys(m.current).map((k) => k.toLowerCase()));
}

const CODE_NAMES: Record<string, string> = {
  Space: "space",
  Minus: "-",
  NumpadSubtract: "-",
  Equal: "=",
  NumpadAdd: "=",
  Slash: "slash",
  BracketLeft: "[",
  BracketRight: "]",
};

// The physical key, so a Ukrainian layout works: "2", "Shift+2", "-", "space", "s", "[", "Shift+slash" (?).
// Minus and Equal ignore Shift, because "+" is Shift+Equal on most layouts.
function comboOf(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  const letter = /^Key([A-Z])$/.exec(e.code);

  let base: string;
  if (CODE_NAMES[e.code]) {
    base = CODE_NAMES[e.code];
  } else if (digit) {
    base = digit[1];
  } else if (letter) {
    base = letter[1].toLowerCase();
  } else if (e.key === "?") {
    // Synthetic events have no physical code: this is the key that types "?".
    return "Shift+slash";
  } else {
    base = e.key === " " ? "space" : e.key.toLowerCase();
  }

  const shift = e.shiftKey && base !== "-" && base !== "=" ? "Shift+" : "";
  return shift + base;
}

const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable=false])";
// Space on these presses them natively, so the global Space must stay out.
const PRESSABLE =
  "button, a[href], summary, [role=button], [role=radio], [role=switch], [role=checkbox], [role=menuitem], [role=tab]";

function ignored(e: KeyboardEvent, combo: string): boolean {
  if (document.querySelector("dialog[open]")) return true;

  const target = e.target instanceof Element ? e.target : null;
  if (!target) return false;
  if (target.closest(FIELD)) return true;
  // Sliders keep their own keys; the map explorer is a slider too but lets the global keys through.
  if (target.closest("[role=slider]") && !target.closest("[data-explorer]")) return true;
  return combo === "space" && target.closest(PRESSABLE) !== null;
}

export function useHotkeys(map: HotkeyMap): void {
  const latest = useRef(map);

  useEffect(() => {
    latest.current = map;
  });

  useEffect(() => {
    mounted.add(latest);
    return () => {
      mounted.delete(latest);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = comboOf(e);
      if (!combo) return;

      const handlers = latest.current;
      const key = Object.keys(handlers).find((k) => k.toLowerCase() === combo.toLowerCase());
      if (!key || ignored(e, combo)) return;

      e.preventDefault();

      // Holding a key must not flip play or a layer back and forth; only the volume keys repeat.
      if (e.repeat && combo !== "-" && combo !== "=") return;

      handlers[key](e);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
