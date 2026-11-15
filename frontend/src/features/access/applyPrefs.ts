import type { Prefs } from "./prefs";

export function applyPrefs(p: Prefs, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = p.theme;
  root.style.setProperty("--text-scale", String(p.textScale));
  root.classList.toggle("readable-font", p.readableFont);
  root.classList.toggle("high-contrast", p.highContrast);
  root.classList.toggle("color-safe", p.colorSafe);
  root.classList.toggle("reduce-motion", p.reduceMotion);
  root.classList.toggle("no-captions", !p.captions);
}
