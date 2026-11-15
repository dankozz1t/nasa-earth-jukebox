import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNarrator, getPlayer } from "../src/audio/player-instance";
import { StemPlayer } from "../src/audio/stem-player";
import { usePlayer, usePosition } from "../src/audio/usePlayer";
import { FakeAudioContext, installFakeAudioContext } from "./fakes/audio-context";

const stems = () => ({ a: new ArrayBuffer(8), b: new ArrayBuffer(8) });

beforeEach(() => installFakeAudioContext());

describe("StemPlayer subscription", () => {
  it("getSnapshot returns the same object until state changes", async () => {
    const p = new StemPlayer();
    const first = p.getSnapshot();
    expect(p.getSnapshot()).toBe(first);
    p.pause(); // no-op while stopped
    p.stop(); // nothing changed
    expect(p.getSnapshot()).toBe(first);
    await p.load(stems(), 10, "x");
    const loaded = p.getSnapshot();
    expect(loaded).not.toBe(first);
    expect(loaded).toEqual({ playing: false, ready: true, duration: 10, tag: "x" });
    expect(p.getSnapshot()).toBe(loaded);
  });

  it("notifies subscribers on play, pause and load", async () => {
    const p = new StemPlayer();
    const cb = vi.fn();
    p.subscribe(cb);
    await p.load(stems(), 10, "x");
    expect(cb).toHaveBeenCalledTimes(1);
    await p.play();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(p.getSnapshot().playing).toBe(true);
    p.pause();
    expect(cb).toHaveBeenCalledTimes(3);
    expect(p.getSnapshot().playing).toBe(false);
  });

  it("unsubscribe stops notifications", async () => {
    const p = new StemPlayer();
    const cb = vi.fn();
    const off = p.subscribe(cb);
    off();
    await p.load(stems(), 10);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("StemPlayer analyser (sound waves)", () => {
  it("getAnalyser never creates the AudioContext, and gives the tap once the graph exists", async () => {
    const p = new StemPlayer();
    expect(p.getAnalyser()).toBeNull();
    expect(FakeAudioContext.created).toBe(0);
    await p.load(stems(), 10, "x");
    const analyser = p.getAnalyser();
    expect(analyser).not.toBeNull();
    expect(analyser!.frequencyBinCount).toBe(128);
    expect(p.getAnalyser()).toBe(analyser); // one tap, not one per call
    expect(FakeAudioContext.created).toBe(1);
  });
});

describe("singletons", () => {
  it("do not create an AudioContext until used", () => {
    installFakeAudioContext();
    expect(getPlayer()).toBe(getPlayer());
    expect(getNarrator()).toBe(getNarrator());
    expect(FakeAudioContext.created).toBe(0);
  });
});

describe("usePlayer / usePosition", () => {
  it("usePlayer re-renders on play", async () => {
    const p = getPlayer();
    await act(() => p.load(stems(), 10, "t"));
    const { result } = renderHook(() => usePlayer());
    expect(result.current.playing).toBe(false);
    await act(() => p.play());
    expect(result.current.playing).toBe(true);
    act(() => p.stop());
    expect(result.current.playing).toBe(false);
  });

  it("usePosition runs rAF only while playing and cleans up", async () => {
    const p = getPlayer();
    await act(() => p.load(stems(), 10, "t"));
    const raf = vi.spyOn(globalThis, "requestAnimationFrame");
    const caf = vi.spyOn(globalThis, "cancelAnimationFrame");
    raf.mockClear();
    const { unmount } = renderHook(() => usePosition(10));
    expect(raf).not.toHaveBeenCalled();
    await act(() => p.play());
    expect(raf).toHaveBeenCalled();
    unmount();
    expect(caf).toHaveBeenCalled();
    p.stop();
    raf.mockRestore();
    caf.mockRestore();
  });

  it("usePosition follows seek and stop while paused", async () => {
    const p = getPlayer();
    await act(() => p.load(stems(), 10, "t"));
    const { result } = renderHook(() => usePosition(10));
    act(() => p.seek(5));
    expect(result.current).toBe(5);
    act(() => p.stop());
    expect(result.current).toBe(0);
  });
});

describe("StemPlayer next deck after a newer load (stale decodes)", () => {
  const original = FakeAudioContext.prototype.decodeAudioData;
  afterEach(() => {
    FakeAudioContext.prototype.decodeAudioData = original;
  });
  /** Decodes of 7-byte stems wait for `release()`; every other decode is immediate. */
  function holdDecodes() {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const decode = async (bytes: ArrayBuffer) => {
      if (bytes.byteLength === 7) await gate;
      return { duration: 10 } as unknown as AudioBuffer;
    };
    (FakeAudioContext.prototype as unknown as { decodeAudioData: typeof decode }).decodeAudioData =
      decode;
    return { release: () => release() };
  }
  const slow = () => ({ a: new ArrayBuffer(7) });
  const ctxOf = (p: StemPlayer) => p.input().ctx as unknown as FakeAudioContext;

  it("a fresh deck still decoding when a new piece loads never lands behind the new piece", async () => {
    const hold = holdDecodes();
    const p = new StemPlayer();
    await p.load(stems(), 10, "old");
    p.setRepeat("one");
    await p.play();
    const queued = p.setNext(slow(), 10, "old-fresh"); // a new reading for the old piece, decoding
    await p.load(stems(), 10, "new", { restart: true }); // the person picked another preset meanwhile
    p.setRepeat("one");
    hold.release();
    expect(await queued).toBe(false);
    ctxOf(p).currentTime = 25; // two boundaries later
    p.poll();
    expect(p.getSnapshot().tag).toBe("new");
  });

  it("a tour layer decoding while leaving the tour is dropped by clearNext and the next load", async () => {
    const hold = holdDecodes();
    const p = new StemPlayer();
    await p.load(stems(), 10, "custom");
    p.setRepeat("all");
    await p.play();
    const layer = p.setNext(slow(), 10, "custom"); // the next layer, decoding
    p.clearNext(); // tour.stop()
    await p.load(stems(), 10, "nasa-four", { restart: true });
    p.setRepeat("off");
    hold.release();
    expect(await layer).toBe(false);
    ctxOf(p).currentTime = 15;
    p.poll();
    expect(p.getSnapshot().tag).toBe("nasa-four");
  });

  it("an undisturbed setNext still lands and plays at the boundary", async () => {
    const p = new StemPlayer();
    await p.load(stems(), 10, "a");
    p.setRepeat("all");
    await p.play();
    expect(await p.setNext(stems(), 10, "b")).toBe(true);
    ctxOf(p).currentTime = 10.5;
    p.poll();
    expect(p.getSnapshot().tag).toBe("b");
  });
});

describe("StemPlayer boundary when the audio clock lags the timer", () => {
  afterEach(() => vi.useRealTimers());
  const ctxOf = (p: StemPlayer) => p.input().ctx as unknown as FakeAudioContext;

  it("a timer that fires early re-arms, and the advance still happens once", async () => {
    vi.useFakeTimers();
    const p = new StemPlayer();
    const onAdvance = vi.fn();
    p.onAdvance = onAdvance;
    await p.load(stems(), 10, "a");
    p.setRepeat("all");
    await p.play();
    expect(await p.setNext(stems(), 10, "b")).toBe(true);

    ctxOf(p).currentTime = 9; // the wall-clock timer fires, the audio clock is a second behind
    vi.advanceTimersByTime(10_100);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(p.getSnapshot().tag).toBe("a");

    ctxOf(p).currentTime = 10.1;
    vi.advanceTimersByTime(1_100);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenCalledWith("b");
    expect(p.getSnapshot().tag).toBe("b");
    expect(p.playing).toBe(true);
  });

  it("a state change (resume after an interruption) advances past a missed boundary", async () => {
    const p = new StemPlayer();
    const onAdvance = vi.fn();
    p.onAdvance = onAdvance;
    await p.load(stems(), 10, "a");
    p.setRepeat("all");
    await p.play();
    await p.setNext(stems(), 10, "b");
    const ctx = ctxOf(p) as unknown as { currentTime: number; onstatechange: (() => void) | null };
    ctx.currentTime = 12;
    ctx.onstatechange?.();
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(p.getSnapshot().tag).toBe("b");
  });
});
