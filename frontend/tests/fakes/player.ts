// A fake StemPlayer and Narrator for screen tests. No imports from src, so a vi.mock factory may load it.

import { vi } from "vitest";

type State = { playing: boolean; ready: boolean; duration: number; position: number; tag: unknown };

function createPlayer() {
  const listeners = new Set<() => void>();
  let snapshot = { playing: false, ready: false, duration: 0, tag: null as unknown };
  let rev = 0;
  const notify = () => {
    snapshot = { playing: p.playing, ready: p.ready, duration: p.duration, tag: p.tag };
    rev++;
    listeners.forEach((cb) => cb());
  };
  const p = {
    playing: false,
    ready: false,
    duration: 0,
    position: 0,
    tag: null as unknown,
    play: vi.fn(async () => {
      p.playing = true;
      notify();
    }),
    pause: vi.fn(() => {
      p.playing = false;
      notify();
    }),
    stop: vi.fn(() => {
      p.playing = false;
      notify();
    }),
    load: vi.fn(async () => true),
    setNext: vi.fn(async () => true),
    clearNext: vi.fn(),
    seek: vi.fn(),
    spot: vi.fn(async () => undefined),
    setPan: vi.fn(),
    setEnabled: vi.fn(),
    setVolume: vi.fn(),
    setRepeat: vi.fn(),
    getAnalyser: vi.fn((): AnalyserNode | null => null),
    input: vi.fn(() => ({ ctx: { state: "running", resume: async () => undefined }, node: {} })),
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot: () => snapshot,
    getPositionRev: () => rev,
    set(over: Partial<State>) {
      Object.assign(p, over);
      notify();
    },
    reset() {
      Object.assign(p, { playing: false, ready: false, duration: 0, position: 0, tag: null });
      notify();
    },
  };
  return p;
}

export const player = createPlayer();
export const narrator = {
  speak: vi.fn(),
  stop: vi.fn(),
  speaking: false,
  enabled: false,
  lang: "en",
  rate: 1,
  hasVoice: () => true,
};
export const playerModule = { getPlayer: () => player, getNarrator: () => narrator };
