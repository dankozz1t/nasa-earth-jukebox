import { describe, expect, it, vi } from "vitest";
import {
  COMPOSE_RETRY_MS,
  createTour,
  STEMS_RETRY_MS,
  type TourPlayer,
} from "../src/features/live/model/tour";
import { LAYER_ORDER } from "../src/features/live/model/playlist";
import { createStemsCache, STEMS_CACHE_SIZE } from "../src/features/presets/stems-cache";
import type { SectionKey, WeatherSoundscape } from "../src/shared/api";

const scape = (key: SectionKey, v = 1): WeatherSoundscape =>
  ({
    id: `${key}-${v}`,
    section: { key },
    durationSec: 40,
    artifacts: { stems: { lead: `/${key}-${v}/lead.wav` } },
  }) as unknown as WeatherSoundscape;

function fakePlayer() {
  const p = {
    onAdvance: null as null | ((tag: unknown) => void),
    load: vi.fn(
      async (_b: unknown, _d: number, _t: unknown, opts?: { stale?: () => boolean }) =>
        !opts?.stale?.(),
    ),
    setNext: vi.fn<
      (bytes: Record<string, ArrayBuffer>, duration: number, tag: unknown) => Promise<boolean>
    >(async () => true),
    clearNext: vi.fn(),
    setRepeat: vi.fn(),
  };
  return p as typeof p & TourPlayer;
}

/** Compose that answers by hand, so tests control when each layer is ready. */
function manualCompose(version = 1) {
  const waiting = new Map<SectionKey, { resolve(): void; signal: AbortSignal }>();
  const compose = vi.fn(
    (key: SectionKey, signal: AbortSignal) =>
      new Promise<WeatherSoundscape>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        waiting.set(key, { resolve: () => resolve(scape(key, version)), signal });
      }),
  );
  return {
    compose,
    ready: (key: SectionKey) => waiting.get(key)!.resolve(),
    signalOf: (key: SectionKey) => waiting.get(key)!.signal,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
/** Stem bytes tagged with the soundscape id, so a test can tell which layer went into a deck. */
const stems = vi.fn(async (s: WeatherSoundscape) => ({ [s.id]: new ArrayBuffer(4) }));
const queuedIds = (p: ReturnType<typeof fakePlayer>) =>
  p.setNext.mock.calls.map((c) => Object.keys(c[0])[0]);

/** What the real player does at a boundary in "all" mode: the queued deck becomes current, then onAdvance. */
async function boundary(p: ReturnType<typeof fakePlayer>, tag = "t") {
  p.onAdvance?.(tag);
  await tick();
}

describe("createTour (repeat all layers)", () => {
  it("composes the first layer, prepares the rest in play order and loads the first", async () => {
    const player = fakePlayer();
    const c = manualCompose();
    const tour = createTour(player, c.compose, stems);
    const started = tour.start({ first: "clouds", tag: "custom", restart: true });

    expect(c.compose.mock.calls.map(([k]) => k)).toEqual([
      "clouds",
      "wind",
      "temperature",
      "precipitation",
    ]);
    c.ready("clouds");
    expect(await started).toBe(true);
    expect(player.setRepeat).toHaveBeenCalledWith("all");
    expect(player.load).toHaveBeenCalledWith(
      { "clouds-1": expect.any(ArrayBuffer) },
      40,
      "custom",
      expect.objectContaining({ restart: true }),
    );
    expect(tour.current?.id).toBe("clouds-1");
    expect(tour.readiness()).toEqual({ ready: 1, total: 4 });
  });

  it("without the next layer the current one is queued again, then replaced when the next lands", async () => {
    const player = fakePlayer();
    const c = manualCompose();
    const shown: string[] = [];
    const tour = createTour(player, c.compose, stems, {
      onShow: (s, how) => shown.push(`${how}:${s.id}`),
    });
    const started = tour.start({ first: "temperature", tag: "t", restart: true });
    c.ready("temperature");
    await started;
    await tick();
    expect(queuedIds(player)).toEqual(["temperature-1"]); // never an empty next deck

    // The boundary comes first: the layer repeats, and is queued once more.
    await boundary(player);
    expect(tour.current?.id).toBe("temperature-1");
    expect(queuedIds(player)).toEqual(["temperature-1", "temperature-1"]);

    c.ready("precipitation");
    await tick();
    expect(queuedIds(player)).toEqual(["temperature-1", "temperature-1", "precipitation-1"]);

    await boundary(player);
    expect(tour.current?.id).toBe("precipitation-1");
    expect(shown).toEqual(["start:temperature-1", "advance:precipitation-1"]);
    expect(queuedIds(player).at(-1)).toBe("precipitation-1"); // clouds not ready: precipitation repeats

    c.ready("clouds");
    await tick();
    expect(queuedIds(player).at(-1)).toBe("clouds-1");
  });

  it("a queue the player dropped (a load while it decoded) is filled again, never left empty", async () => {
    const player = fakePlayer();
    const c = manualCompose();
    player.setNext.mockImplementationOnce(async () => false);
    const tour = createTour(player, c.compose, stems);
    const started = tour.start({ first: "temperature", tag: "t", restart: true });
    c.ready("temperature");
    await started;
    await tick();
    await tick();
    expect(queuedIds(player)).toEqual(["temperature-1", "temperature-1"]);
    await boundary(player); // the second try landed: the boundary repeats the layer and queues again
    expect(queuedIds(player)).toHaveLength(3);
  });

  it("queues the next layer straight away when it is already composed", async () => {
    const player = fakePlayer();
    const c = manualCompose();
    const tour = createTour(player, c.compose, stems);
    const started = tour.start({ first: "wind", tag: "t", restart: true });
    c.ready("temperature");
    c.ready("wind");
    await started;
    await tick();
    expect(queuedIds(player)).toEqual(["temperature-1"]);
    await boundary(player);
    expect(tour.current?.id).toBe("temperature-1");
  });

  it("retries a failed compose of the next layer before the boundary", async () => {
    vi.useFakeTimers();
    try {
      const player = fakePlayer();
      let failPrecipitation = true;
      const compose = vi.fn(async (key: SectionKey) => {
        if (key === "precipitation" && failPrecipitation) throw new Error("429");
        return scape(key);
      });
      const tour = createTour(player, compose, stems);
      await tour.start({ first: "temperature", tag: "t", restart: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(queuedIds(player)).toEqual(["temperature-1"]);

      failPrecipitation = false;
      await vi.advanceTimersByTimeAsync(COMPOSE_RETRY_MS);
      expect(
        compose.mock.calls.filter(([k]) => k === "precipitation").length,
      ).toBeGreaterThanOrEqual(2);
      expect(queuedIds(player).at(-1)).toBe("precipitation-1");
      tour.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a new start aborts the old generation but keeps its layers until fresh ones arrive", async () => {
    const player = fakePlayer();
    const first = manualCompose(1);
    const second = manualCompose(2);
    let version = first;
    const tour = createTour(player, (k, s) => version.compose(k, s), stems);
    const a = tour.start({ first: "temperature", tag: "t", restart: true });
    first.ready("temperature");
    first.ready("precipitation");
    await a;
    await tick();

    version = second;
    player.setNext.mockClear();
    player.clearNext.mockClear();
    const b = tour.start({ first: "temperature", tag: "t", restart: false });
    expect(first.signalOf("clouds").aborted).toBe(true);
    second.ready("temperature");
    expect(await b).toBe(true);
    expect(tour.current?.id).toBe("temperature-2");
    expect(tour.readiness().ready).toBe(2);
    // precipitation v1 stays queued for the next boundary while v2 composes
    expect(player.clearNext).not.toHaveBeenCalled();
    expect(player.setNext).not.toHaveBeenCalled();

    second.ready("precipitation");
    await tick();
    expect(player.setNext).toHaveBeenCalledTimes(1); // the fresh version replaces it
    player.onAdvance?.("t");
    expect(tour.current?.id).toBe("precipitation-2");
  });

  it("refresh composes every layer again and queues the fresh next one for the boundary, never loading mid-cycle", async () => {
    const player = fakePlayer();
    const first = manualCompose(1);
    const second = manualCompose(2);
    let version = first;
    const tour = createTour(player, (k, s) => version.compose(k, s), stems);
    const started = tour.start({ first: "temperature", tag: "t", restart: true });
    for (const k of ["temperature", "precipitation", "clouds", "wind"] as const) first.ready(k);
    await started;
    await tick();
    expect(queuedIds(player)).toEqual(["precipitation-1"]);

    version = second;
    tour.refresh();
    expect(second.compose.mock.calls.map(([k]) => k)).toEqual([
      "precipitation",
      "clouds",
      "wind",
      "temperature",
    ]);
    expect(tour.current?.id).toBe("temperature-1"); // what sounds now plays on

    second.ready("precipitation");
    await tick();
    expect(player.load).toHaveBeenCalledTimes(1); // only the start
    expect(queuedIds(player)).toEqual(["precipitation-1", "precipitation-2"]);

    await boundary(player);
    expect(tour.current?.id).toBe("precipitation-2");
  });

  it("refresh with an unchanged composition queues nothing new", async () => {
    const player = fakePlayer();
    const c = manualCompose(1);
    const again = manualCompose(1);
    let version = c;
    const tour = createTour(player, (k, s) => version.compose(k, s), stems);
    const started = tour.start({ first: "wind", tag: "t", restart: true });
    c.ready("wind");
    c.ready("temperature");
    await started;
    await tick();
    expect(queuedIds(player)).toEqual(["temperature-1"]);

    version = again;
    tour.refresh();
    again.ready("temperature");
    await tick();
    expect(queuedIds(player)).toEqual(["temperature-1"]);
    expect(player.load).toHaveBeenCalledTimes(1);
  });

  it("refresh does nothing when the tour is not running", () => {
    const player = fakePlayer();
    const c = manualCompose();
    const tour = createTour(player, c.compose, stems);
    tour.refresh();
    expect(c.compose).not.toHaveBeenCalled();
  });

  it("start fails loudly when the first layer cannot be composed, and quietly when superseded", async () => {
    const player = fakePlayer();
    const failing = createTour(player, async () => Promise.reject(new Error("503")), stems);
    await expect(failing.start({ first: "wind", tag: "t", restart: true })).rejects.toThrow("503");

    const c = manualCompose();
    const tour = createTour(player, c.compose, stems);
    const old = tour.start({ first: "wind", tag: "t", restart: true });
    const next = tour.start({ first: "clouds", tag: "t", restart: true });
    expect(await old).toBe(false);
    c.ready("clouds");
    expect(await next).toBe(true);
  });

  /** Stems that resolve at once, except the layers listed, which wait for `release` or fail on `fail`. */
  function gatedStems(...held: string[]) {
    const gates = new Map<string, { resolve(): void; reject(): void }>();
    const fn = vi.fn((s: WeatherSoundscape) => {
      if (!held.includes(s.section.key)) return stems(s);
      return new Promise<Record<string, ArrayBuffer>>((resolve, reject) => {
        gates.set(s.section.key, {
          resolve: () => resolve({ [s.id]: new ArrayBuffer(4) }),
          reject: () => reject(new Error("network")),
        });
      });
    });
    return {
      fn,
      release: (key: string) => gates.get(key)!.resolve(),
      fail: (key: string) => gates.get(key)!.reject(),
    };
  }

  /** Starts on temperature with precipitation composed and queued, then crosses into precipitation. */
  async function advancedTour(fetch: ReturnType<typeof gatedStems>) {
    const player = fakePlayer();
    const c = manualCompose();
    const tour = createTour(player, c.compose, fetch.fn);
    const started = tour.start({ first: "temperature", tag: "t", restart: true });
    c.ready("temperature");
    c.ready("precipitation");
    c.ready("clouds");
    await started;
    await tick();
    expect(queuedIds(player)).toEqual(["precipitation-1"]);
    await boundary(player);
    expect(tour.current?.id).toBe("precipitation-1");
    return { player, tour };
  }

  it("after a boundary a slow next layer leaves the current one queued until it lands", async () => {
    const fetch = gatedStems("clouds");
    const { player, tour } = await advancedTour(fetch);
    // clouds is still downloading: precipitation repeats rather than the next deck staying empty
    expect(queuedIds(player)).toEqual(["precipitation-1", "precipitation-1"]);

    fetch.release("clouds");
    await tick();
    expect(queuedIds(player).at(-1)).toBe("clouds-1");
    await boundary(player);
    expect(tour.current?.id).toBe("clouds-1");
  });

  it("a cached next layer is queued directly, with no repeat in between", async () => {
    const fetch = gatedStems();
    const { player } = await advancedTour(fetch);
    expect(queuedIds(player)).toEqual(["precipitation-1", "clouds-1"]);
  });

  it("a failed download of the next layer re-queues the current one and retries", async () => {
    vi.useFakeTimers();
    try {
      const fetch = gatedStems("clouds");
      const player = fakePlayer();
      const c = manualCompose();
      const tour = createTour(player, c.compose, fetch.fn);
      const started = tour.start({ first: "temperature", tag: "t", restart: true });
      c.ready("temperature");
      c.ready("precipitation");
      c.ready("clouds");
      await started;
      await vi.advanceTimersByTimeAsync(0);
      player.onAdvance?.("t");
      await vi.advanceTimersByTimeAsync(0);
      expect(queuedIds(player)).toEqual(["precipitation-1", "precipitation-1"]);

      fetch.fail("clouds");
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch.fn.mock.calls.filter(([s]) => s.section.key === "clouds")).toHaveLength(1);
      expect(queuedIds(player)).toHaveLength(2); // the repeat is still queued

      await vi.advanceTimersByTimeAsync(STEMS_RETRY_MS);
      expect(fetch.fn.mock.calls.filter(([s]) => s.section.key === "clouds")).toHaveLength(2);

      fetch.release("clouds");
      await vi.advanceTimersByTimeAsync(0);
      expect(queuedIds(player).at(-1)).toBe("clouds-1");
      player.onAdvance?.("t");
      expect(tour.current?.id).toBe("clouds-1");
      tour.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed download right after a boundary still leaves the current layer queued", async () => {
    vi.useFakeTimers();
    try {
      const fetch = gatedStems("clouds");
      const player = fakePlayer();
      const c = manualCompose();
      const tour = createTour(player, c.compose, fetch.fn);
      const started = tour.start({ first: "temperature", tag: "t", restart: true });
      c.ready("temperature");
      c.ready("precipitation");
      c.ready("clouds");
      await started;
      await vi.advanceTimersByTimeAsync(0);
      player.onAdvance?.("t");
      fetch.fail("clouds"); // fails before the grace tick: the catch re-queues
      await vi.advanceTimersByTimeAsync(0);
      expect(queuedIds(player)).toEqual(["precipitation-1", "precipitation-1"]);

      tour.stop(); // clears the retry
      await vi.advanceTimersByTimeAsync(STEMS_RETRY_MS * 4);
      expect(fetch.fn.mock.calls.filter(([s]) => s.section.key === "clouds")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop detaches from the player and drops the queued layer", async () => {
    const player = fakePlayer();
    const c = manualCompose();
    const tour = createTour(player, c.compose, stems);
    const started = tour.start({ first: "temperature", tag: "t", restart: true });
    c.ready("temperature");
    await started;
    tour.stop();
    expect(player.onAdvance).toBeNull();
    expect(player.clearNext).toHaveBeenCalled();
    expect(c.signalOf("wind").aborted).toBe(true);
    expect(tour.active).toBe(false);
  });
});

describe("stems cache", () => {
  const s = (id: string) => ({ id, artifacts: { stems: { a: `/${id}/a`, b: `/${id}/b` } } });

  it("the app keeps every tour layer and the piece before the tour", () => {
    expect(STEMS_CACHE_SIZE).toBeGreaterThanOrEqual(LAYER_ORDER.length + 1);
  });

  it("downloads once per composition and keeps the last three", async () => {
    const bytes = vi.fn(async () => new ArrayBuffer(1));
    const cache = createStemsCache(bytes, 3);
    await Promise.all([cache.get(s("x")), cache.get(s("x"))]);
    expect(bytes).toHaveBeenCalledTimes(2);

    for (const id of ["y", "z", "w"]) await cache.get(s(id));
    expect(cache.has("x")).toBe(false);
    expect(["y", "z", "w"].every(cache.has)).toBe(true);
  });

  it("cancels the download only when every waiter gave up", async () => {
    const signals: AbortSignal[] = [];
    const bytes = vi.fn((_u: string, signal?: AbortSignal) => {
      signals.push(signal!);
      return new Promise<ArrayBuffer>(() => undefined);
    });
    const cache = createStemsCache(bytes);
    const one = new AbortController();
    const two = new AbortController();
    const p1 = cache.get(s("x"), one.signal);
    const p2 = cache.get(s("x"), two.signal);
    one.abort();
    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0].aborted).toBe(false);
    two.abort();
    await expect(p2).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0].aborted).toBe(true);
    expect(cache.has("x")).toBe(false);
  });

  it("reports progress as stems arrive", async () => {
    const cache = createStemsCache(async () => new ArrayBuffer(1));
    const seen: number[] = [];
    await cache.get(s("x"), undefined, (f) => seen.push(f));
    expect(seen).toEqual([0, 0.5, 1]);
  });
});
