import { create } from "zustand";
import { getNarrator } from "../../audio/player-instance";

const ANNOUNCE_GAP_MS = 4000;

export const useNowText = create<{ text: string }>()(() => ({ text: "" }));

let lastAt = -Infinity;

export function say(text: string): void {
  useNowText.setState({ text });
  lastAt = Date.now();
  getNarrator().speak(text);
}

// For position-driven lines; answers to keys use `say` and are never throttled.
export function sayThrottled(text: string): boolean {
  if (!text || Date.now() - lastAt < ANNOUNCE_GAP_MS || getNarrator().speaking) return false;

  say(text);
  return true;
}

export function resetAnnounce(): void {
  lastAt = -Infinity;
  useNowText.setState({ text: "" });
}
