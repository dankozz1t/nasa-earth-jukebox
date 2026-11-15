// "All layers" repeat: the four weather layers play in turn, each joining at the previous one's cycle
// boundary. The next layer waits in the player's second deck, so the Web Audio clock schedules the swap.

import type { StemPlayer } from "../../../audio/stem-player";
import type { SectionKey, WeatherSoundscape } from "../../../shared/api/weather";
import { LAYER_ORDER, LayerShelf, nextLayer, playOrder } from "./playlist";

export type Stems = Record<string, ArrayBuffer>;
export type TourPlayer = Pick<
  StemPlayer,
  "load" | "setNext" | "clearNext" | "setRepeat" | "onAdvance"
>;
type ComposeLayer = (key: SectionKey, signal: AbortSignal) => Promise<WeatherSoundscape>;
type FetchStems = (s: WeatherSoundscape, signal: AbortSignal) => Promise<Stems>;

// Slow enough not to hammer a 429.
export const COMPOSE_RETRY_MS = 10_000;
const COMPOSE_RETRIES = 3;
export const STEMS_RETRY_MS = 10_000;
const STEMS_RETRIES = 3;

interface TourEvents {
  onShow?(s: WeatherSoundscape, how: "start" | "advance"): void;
  onReadiness?(ready: number, total: number): void;
}

interface TourStart {
  first: SectionKey;
  tag: unknown;
  restart: boolean;
  stale?: () => boolean;
}

export interface Tour {
  // False when superseded. Throws when the first layer fails.
  start(opts: TourStart): Promise<boolean>;
  refresh(): void;
  stop(): void;
  readonly active: boolean;
  readonly current: WeatherSoundscape | null;
  readiness(): { ready: number; total: number };
}

export function createTour(
  player: TourPlayer,
  compose: ComposeLayer,
  fetchStems: FetchStems,
  events: TourEvents = {},
): Tour {
  let shelf = new LayerShelf<WeatherSoundscape>();
  let gen = 0;
  let genAbort = new AbortController();
  const inflight = new Map<string, Promise<WeatherSoundscape | null>>();
  let active = false;
  let tag: unknown = null;
  let target: SectionKey = LAYER_ORDER[0];
  let current: WeatherSoundscape | null = null;
  let queuedId: string | null = null; // asked the player to queue this one
  let queued: WeatherSoundscape | null = null; // the player's next deck holds this one
  let currentBytes: Stems | null = null;
  let queuedBytes: Stems | null = null;
  let stemsRetries = 0;
  let nextToken = 0;
  let swapToken = 0;
  let ownsRepeat = false;
  const retryTimers = new Set<number>();

  function readiness() {
    return { ready: shelf.count(), total: LAYER_ORDER.length };
  }

  function newGeneration(): void {
    gen++;
    genAbort.abort();
    genAbort = new AbortController();
  }

  function composeOnce(key: SectionKey, g: number): Promise<WeatherSoundscape | null> {
    const job = `${g}:${key}`;
    const running = inflight.get(job);
    if (running) return running;

    const { signal } = genAbort;
    const p = compose(key, signal)
      .then((s) => {
        if (signal.aborted) return null;
        shelf.put(key, g, s);
        events.onReadiness?.(shelf.count(), LAYER_ORDER.length);
        return s;
      })
      .finally(() => inflight.delete(job));

    inflight.set(job, p);
    return p;
  }

  const isNext = (key: SectionKey) =>
    active && current !== null && key === nextLayer(current.section.key);

  // Errors stay quiet; only the next layer is retried, a few times before its boundary.
  function composeLayer(key: SectionKey, g: number, attempt = 0): void {
    composeOnce(key, g).then(
      (s) => {
        if (s && isNext(key)) void ensureNext();
      },
      () => {
        if (g !== gen || !isNext(key) || attempt >= COMPOSE_RETRIES) return;

        const id = window.setTimeout(() => {
          retryTimers.delete(id);
          if (g === gen && isNext(key) && !shelf.get(key)) composeLayer(key, g, attempt + 1);
        }, COMPOSE_RETRY_MS);
        retryTimers.add(id);
      },
    );
  }

  function prepareAll(): void {
    for (const key of playOrder(target)) {
      if (!shelf.fresh(key, gen)) composeLayer(key, gen);
    }
  }

  function show(s: WeatherSoundscape, how: "start" | "advance"): void {
    current = s;
    target = s.section.key;
    events.onShow?.(s, how);
  }

  async function install(
    s: WeatherSoundscape,
    restart: boolean,
    outer?: () => boolean,
  ): Promise<boolean> {
    const token = ++swapToken;
    const stale = () =>
      !active || token !== swapToken || s.section.key !== target || (outer?.() ?? false);
    const prevKey = current?.section.key;

    let bytes: Stems;
    try {
      bytes = await fetchStems(s, genAbort.signal);
    } catch (err) {
      if (stale()) return false;
      throw err;
    }
    if (stale()) return false;

    if (!ownsRepeat) {
      // Once per start from another preset: drops that preset's queued deck; our layers queue from here on.
      player.setRepeat("all");
      ownsRepeat = true;
      queuedId = null;
      queued = null;
      queuedBytes = null;
    }

    const loaded = await player.load(bytes, s.durationSec, tag, { restart, stale });
    if (!loaded) return false;
    currentBytes = bytes;

    if (prevKey !== s.section.key) {
      queuedId = null;
      queued = null;
      queuedBytes = null;
      player.clearNext();
    }

    show(s, "start");
    void ensureNext();
    return true;
  }

  // Queues the next layer when it is composed, otherwise the current layer again, so a boundary is never
  // silent. The next layer replaces that repeat when it lands.
  async function ensureNext(afterBoundary = false): Promise<void> {
    if (!active || !current) return;

    const key = nextLayer(current.section.key);
    const entry = shelf.get(key);
    if (!entry) composeLayer(key, gen);
    const s = entry ? entry.value : current;
    if (s.id === queuedId) return;

    queuedId = s.id;
    const token = ++nextToken;
    const g = gen;
    try {
      const fetching = fetchStems(s, genAbort.signal);
      if (afterBoundary && s.id !== current.id) {
        // The next deck is empty after a boundary: while the next layer downloads, repeat this one.
        let settled = false;
        fetching.then(
          () => (settled = true),
          () => (settled = true),
        );
        await new Promise((r) => window.setTimeout(r, 0));
        if (token !== nextToken || !active) return;
        if (!settled) requeueCurrent();
      }

      const bytes = await fetching;
      if (token !== nextToken || !active) return;
      const placed = await player.setNext(bytes, s.durationSec, tag);
      if (token !== nextToken || !active) return;
      if (placed) {
        queued = s;
        queuedBytes = bytes;
        stemsRetries = 0;
      } else {
        // A load came while it decoded, so the next deck is not ours: fill it again.
        queuedId = null;
        void ensureNext();
      }
    } catch {
      if (token !== nextToken || !active) return;
      queuedId = null;
      if (g !== gen) return; // aborted by a new start
      requeueCurrent();
      retryStems(g);
    }
  }

  // The current layer's bytes are at hand, so this needs no download.
  function requeueCurrent(): void {
    const s = current;
    const bytes = currentBytes;
    if (!s || !bytes || queued) return;

    void player.setNext(bytes, s.durationSec, tag).then(
      (placed) => {
        if (placed && active && current === s && !queued) {
          queued = s;
          queuedBytes = bytes;
        }
      },
      () => undefined,
    );
  }

  function retryStems(g: number): void {
    if (stemsRetries >= STEMS_RETRIES) return;
    stemsRetries++;

    const id = window.setTimeout(() => {
      retryTimers.delete(id);
      if (g === gen && active && queuedId === null) void ensureNext();
    }, STEMS_RETRY_MS);
    retryTimers.add(id);
  }

  function onAdvance(): void {
    const s = queued;
    if (!active || !s) return;

    const bytes = queuedBytes;
    queuedId = null;
    queued = null;
    queuedBytes = null;

    if (s.id === current?.id) {
      // The current layer repeated because the next one was not ready yet.
      void ensureNext(true);
      return;
    }

    swapToken++;
    currentBytes = bytes;
    stemsRetries = 0;
    show(s, "advance");
    void ensureNext(true);
    composeLayer(nextLayer(nextLayer(s.section.key)), gen);
  }

  async function start(opts: TourStart): Promise<boolean> {
    newGeneration();
    active = true;
    stemsRetries = 0;
    tag = opts.tag;
    target = opts.first;
    player.onAdvance = onAdvance;

    const g = gen;
    const first = composeOnce(opts.first, g);
    prepareAll();

    let s: WeatherSoundscape | null;
    try {
      s = await first;
    } catch (err) {
      if (g !== gen) return false;
      throw err;
    }
    if (!s || g !== gen) return false;

    return install(s, opts.restart, opts.stale);
  }

  function refresh(): void {
    if (!active || !current) return;

    newGeneration();

    // Drops a queue of the old data still in flight; the next deck keeps `queued` until a fresh layer lands.
    nextToken++;
    queuedId = queued?.id ?? null;

    for (const key of playOrder(nextLayer(current.section.key))) {
      composeLayer(key, gen);
    }

    // Re-queues the old layer if the dropped queue had not landed: the next deck is never empty.
    void ensureNext();
  }

  function stop(): void {
    if (!active) return;

    active = false;
    newGeneration();
    nextToken++;
    swapToken++;
    queuedId = null;
    queued = null;
    current = null;
    currentBytes = null;
    queuedBytes = null;
    ownsRepeat = false;

    for (const id of retryTimers) window.clearTimeout(id);
    retryTimers.clear();

    shelf = new LayerShelf<WeatherSoundscape>();
    if (player.onAdvance === onAdvance) player.onAdvance = null;
    player.clearNext();
  }

  return {
    start,
    refresh,
    stop,
    get active() {
      return active;
    },
    get current() {
      return current;
    },
    readiness,
  };
}
