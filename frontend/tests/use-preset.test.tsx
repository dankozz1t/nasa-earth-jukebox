import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const player = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let startedAt = 0;
  let offset = 0;
  const notify = () => listeners.forEach((cb) => cb());
  const p = {
    playing: false,
    ready: false,
    duration: 0,
    ctx: { state: "running" as string, resume: vi.fn(async () => undefined) },
    onAdvance: null as null | ((tag: unknown) => void),
    get position() {
      return p.playing ? offset + (Date.now() - startedAt) / 1000 : offset;
    },
    load: vi.fn(
      async (
        _stems: Record<string, ArrayBuffer>,
        duration: number,
        _tag: unknown,
        opts?: { restart?: boolean; stale?: () => boolean },
      ) => {
        if (opts?.stale?.()) return false;
        p.duration = duration;
        p.ready = true;
        offset = 0;
        startedAt = Date.now();
        notify();
        return true;
      },
    ),
    setNext: vi.fn(async () => true),
    clearNext: vi.fn(),
    setRepeat: vi.fn(),
    setEnabled: vi.fn(),
    setPan: vi.fn(),
    setVolume: vi.fn(),
    play: vi.fn(async () => {
      p.playing = true;
      startedAt = Date.now();
      notify();
    }),
    pause: vi.fn(() => {
      offset = p.position;
      p.playing = false;
      notify();
    }),
    stop: vi.fn(() => {
      p.playing = false;
      offset = 0;
      notify();
    }),
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    input: () => ({ ctx: p.ctx, node: {} }),
    reset() {
      listeners.clear();
      p.playing = false;
      p.ready = false;
      p.duration = 0;
      p.ctx.state = "running";
      p.onAdvance = null;
      offset = 0;
    },
  };
  return p;
});

vi.mock("../src/audio/player-instance", () => ({
  getPlayer: () => player,
  getNarrator: () => ({ speak() {}, stop() {} }),
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import {
  PresetShelf,
  presetById,
  usePreset,
  usePresetUrlSync,
  useSession,
  type PresetId,
} from "../src/features/presets";
import { PEEK_DWELL_MS } from "../src/features/presets/Sleeve";
import { cancelPendingPlay, resetPresetEngine } from "../src/features/presets/engine";
import { usePlayToggle } from "../src/features/stage";
import {
  aerosolApi,
  ApiError,
  weatherApi,
  type Soundscape,
  type WeatherSettings,
  type WeatherSoundscape,
} from "../src/shared/api";
import { ToastProvider } from "../src/shared/ui";

const AEROSOL_KEYS = ["black_carbon", "dust", "sea_salt", "sulfate", "bed"];

function aerosolScape(id: string): Soundscape {
  return {
    id,
    durationSec: 64,
    artifacts: {
      stems: Object.fromEntries(AEROSOL_KEYS.map((k) => [k, `/a/${id}/${k}.wav`])),
      mix: "",
      midi: "",
      classMap: "",
    },
  } as unknown as Soundscape;
}

function weatherScape(
  id: string,
  section: WeatherSettings["section"],
  used = "rules",
): WeatherSoundscape {
  return {
    id,
    section: { key: section },
    durationSec: 60,
    composer: { requested: "algorithmic", used, aiAvailable: true },
    artifacts: { stems: { lead: `/w/${id}/lead.wav`, bass: `/w/${id}/bass.wav` }, mix: "" },
  } as unknown as WeatherSoundscape;
}

const abortable = <T,>(
  signal: AbortSignal | undefined,
  run: (resolve: (v: T) => void, reject: (e: unknown) => void) => void,
) =>
  new Promise<T>((resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    run(resolve, reject);
  });

let client: QueryClient;

/** A live mix from Sound settings that repeats every layer, starting at temperature. */
function tourMix() {
  const rain = presetById("live-rain")!;
  if (rain.source !== "live") throw new Error("live-rain is live");
  return {
    ...rain,
    settings: { ...rain.settings, section: "temperature" as const, cycles: 2, durationSec: 40 },
    repeat: "all" as const,
  };
}

function wrapper(url = "/") {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <ToastProvider>{children}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function renderPreset(url = "/") {
  return renderHook(() => usePreset(), { wrapper: wrapper(url) });
}

/** Let promise chains and due timers run. */
async function flush(ms = 0) {
  await act(async () => {
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(i === 0 ? ms : 0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  player.reset();
  vi.clearAllMocks();
  resetPresetEngine();
  useSession.setState(useSession.getInitialState(), true);
  usePrefs.setState(defaultPrefs());
  vi.spyOn(aerosolApi, "compose").mockImplementation(async (_frame, s) =>
    aerosolScape(`a-${s.mode}`),
  );
  vi.spyOn(weatherApi, "compose").mockImplementation(async (s) =>
    weatherScape(`w-${s.section}-${s.composer}`, s.section),
  );
  vi.spyOn(aerosolApi, "bytes").mockImplementation(async () => new ArrayBuffer(8));
});

afterEach(() => {
  resetPresetEngine();
  client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePreset", () => {
  it("pick composes, loads stems and plays", async () => {
    const { result } = renderPreset();
    await act(() => result.current.pick("nasa-four"));

    expect(player.ctx.resume).toHaveBeenCalled(); // unlocked inside the click
    expect(aerosolApi.compose).toHaveBeenCalledWith(
      "svs-5669",
      { mode: "harmony", durationSec: 64, sensitivity: 2 },
      expect.any(AbortSignal),
    );
    expect(aerosolApi.bytes).toHaveBeenCalledTimes(AEROSOL_KEYS.length);
    expect(player.load).toHaveBeenCalledTimes(1);
    const [stems, duration, tag, opts] = player.load.mock.calls[0];
    expect(Object.keys(stems).sort()).toEqual([...AEROSOL_KEYS].sort());
    expect([duration, tag, opts?.restart]).toEqual([64, "nasa-four", true]);
    expect(player.setRepeat).toHaveBeenCalledWith("one");
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(useSession.getState()).toMatchObject({
      presetId: "nasa-four",
      source: "nasa",
      soundscape: { id: "a-harmony" },
    });
    expect(result.current.progress).toEqual({});
  });

  it("three quick picks: only the last one loads", async () => {
    const calls: {
      s: WeatherSettings;
      signal?: AbortSignal;
      resolve(v: WeatherSoundscape): void;
    }[] = [];
    vi.mocked(weatherApi.compose).mockImplementation((s, signal) =>
      abortable<WeatherSoundscape>(signal, (resolve) => calls.push({ s, signal, resolve })),
    );
    const { result } = renderPreset();

    let picks: Promise<void>[] = [];
    act(() => {
      picks = (["live-rain", "live-heat", "live-wind"] as PresetId[]).map((id) =>
        result.current.pick(id),
      );
    });
    expect(calls.map((c) => c.s.section)).toEqual(["precipitation", "temperature", "wind"]);
    expect(calls[0].signal?.aborted).toBe(true);
    expect(calls[1].signal?.aborted).toBe(true);
    expect(calls[2].signal?.aborted).toBe(false);
    expect(result.current.progress).toEqual({ "live-wind": { phase: "compose" } });

    calls.forEach((c) => c.resolve(weatherScape(`w-${c.s.section}`, c.s.section)));
    await act(() => Promise.all(picks));

    expect(player.load).toHaveBeenCalledTimes(1);
    expect(player.load.mock.calls[0][2]).toBe("live-wind");
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(useSession.getState().presetId).toBe("live-wind");
  });

  it("a stale compose result is ignored", async () => {
    let late: (v: Soundscape) => void = () => undefined;
    vi.mocked(aerosolApi.compose).mockImplementation((_f, s) =>
      s.mode === "scale"
        ? new Promise<Soundscape>((resolve) => {
            late = resolve;
          }) // ignores the abort, answers late
        : Promise.resolve(aerosolScape(`a-${s.mode}`)),
    );
    const { result } = renderPreset();

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.pick("nasa-scale");
    });
    await act(() => result.current.pick("nasa-four"));
    late(aerosolScape("a-scale"));
    await act(() => first);
    await flush();

    expect(player.load).toHaveBeenCalledTimes(1);
    expect(player.load.mock.calls[0][2]).toBe("nasa-four");
    expect(useSession.getState().soundscape?.id).toBe("a-harmony");
  });

  it("?p=nasa-scale selects the preset without playing", async () => {
    renderHook(() => usePresetUrlSync(), { wrapper: wrapper("/?p=nasa-scale") });
    await flush();

    expect(useSession.getState().presetId).toBe("nasa-scale");
    expect(aerosolApi.compose).toHaveBeenCalledWith(
      "svs-5669",
      expect.objectContaining({ mode: "scale" }),
      expect.any(AbortSignal),
    );
    expect(aerosolApi.bytes).toHaveBeenCalled(); // warmed for a quick first Play
    expect(player.ctx.resume).not.toHaveBeenCalled(); // no gesture, no AudioContext
    expect(player.load).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("an archive mix without the drone keeps every voice and drops the drone", async () => {
    const four = presetById("nasa-four")!;
    if (four.source !== "nasa") throw new Error("nasa-four is an archive preset");
    const { result } = renderPreset();
    act(() =>
      useSession
        .getState()
        .setCustom({ ...four, bed: false, settings: { ...four.settings, mode: "raw" } }),
    );
    await act(() => result.current.pick("custom"));
    expect(aerosolApi.compose).toHaveBeenLastCalledWith(
      "svs-5669",
      expect.objectContaining({ mode: "raw" }),
      expect.any(AbortSignal),
    );
    expect(useSession.getState().muted).toEqual({
      black_carbon: false,
      dust: false,
      sea_salt: false,
      sulfate: false,
      bed: true,
    });
  });

  it("live-ai plays rules first and offers the AI score when ready", async () => {
    let aiReady: (v: WeatherSoundscape) => void = () => undefined;
    vi.mocked(weatherApi.compose).mockImplementation((s, signal) =>
      s.composer === "ai"
        ? abortable<WeatherSoundscape>(signal, (resolve) => {
            aiReady = resolve;
          })
        : Promise.resolve(weatherScape("rules", s.section)),
    );
    const { result } = renderHook(() => usePreset(), { wrapper: wrapper() });
    await act(() => result.current.pick("live-ai"));

    expect(vi.mocked(weatherApi.compose).mock.calls.map(([s]) => s.composer)).toEqual([
      "algorithmic",
      "ai",
    ]);
    expect(player.load).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("AI finished the score. Switch to it?")).toBeNull();

    aiReady(weatherScape("ai-score", "precipitation", "ai:claude"));
    await flush();
    expect(screen.getByText("AI finished the score. Switch to it?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch on" }));
    await flush();
    expect(player.load).toHaveBeenCalledTimes(2);
    expect(player.load.mock.calls[1][3]?.restart).toBe(false);
    expect(useSession.getState().soundscape?.id).toBe("ai-score");
  });

  it("compose error keeps the old sound and shows a retry toast", async () => {
    const { result } = renderHook(() => usePreset(), { wrapper: wrapper() });
    await act(() => result.current.pick("nasa-four"));
    vi.mocked(aerosolApi.compose).mockRejectedValueOnce(new ApiError("down", 503));

    await act(() => result.current.pick("nasa-scale"));

    expect(player.load).toHaveBeenCalledTimes(1);
    expect(player.stop).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.playing).toBe(true);
    expect(result.current.error).toBe("The sound service is unavailable");
    expect(screen.getByText("The sound service is unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(player.load).toHaveBeenCalledTimes(2);
    expect(player.load.mock.calls[1][2]).toBe("nasa-scale");
  });

  /** Picks nasa-four (plays), then nasa-scale with its compose held until `release`. */
  async function pendingSecondPick() {
    let release: (v: Soundscape) => void = () => undefined;
    const { result } = renderHook(() => ({ preset: usePreset(), toggle: usePlayToggle() }), {
      wrapper: wrapper(),
    });
    await act(() => result.current.preset.pick("nasa-four"));
    expect(player.playing).toBe(true);

    vi.mocked(aerosolApi.compose).mockImplementation(
      (_f, s) =>
        new Promise<Soundscape>((resolve) => {
          release = () => resolve(aerosolScape(`a-${s.mode}`));
        }),
    );
    let second: Promise<void> = Promise.resolve();
    act(() => {
      second = result.current.preset.pick("nasa-scale");
    });
    player.play.mockClear();
    return { result, release: () => release(aerosolScape("a-scale")), second: () => second };
  }

  it("Pause while a pick still loads: the piece arrives but does not start", async () => {
    const { result, release, second } = await pendingSecondPick();
    act(() => result.current.toggle()); // Pause (the Play disc or Space)
    expect(player.playing).toBe(false);

    release();
    await act(() => second());
    await flush();
    expect(player.load).toHaveBeenCalledTimes(2);
    expect(player.load.mock.calls[1][2]).toBe("nasa-scale");
    expect(useSession.getState().soundscape?.id).toBe("a-scale");
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
  });

  it("Stop while a pick still loads: the piece does not start", async () => {
    const { release, second } = await pendingSecondPick();
    act(() => {
      cancelPendingPlay(); // what the Stop button does before player.stop()
      player.stop();
    });
    release();
    await act(() => second());
    await flush();
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
  });

  it("suspended AudioContext after play shows the iPhone silent-mode hint", async () => {
    player.ctx.state = "suspended";
    const { result } = renderHook(() => usePreset(), { wrapper: wrapper() });
    await act(() => result.current.pick("nasa-four"));
    expect(screen.queryByText("On iPhone, turn off silent mode")).toBeNull();

    await flush(500);
    expect(screen.getByText("On iPhone, turn off silent mode")).toBeInTheDocument();
  });

  it("a running AudioContext shows no hint", async () => {
    const { result } = renderHook(() => usePreset(), { wrapper: wrapper() });
    await act(() => result.current.pick("nasa-four"));
    await flush(500);
    expect(screen.queryByText("On iPhone, turn off silent mode")).toBeNull();
  });

  it("a pointer resting on a sleeve prefetches its compose JSON only, a sweep prefetches nothing", async () => {
    function Shelf() {
      const { pick, prefetchCompose } = usePreset();
      return (
        <PresetShelf
          source="nasa"
          selectedId={null}
          playingId={null}
          progressFor={() => undefined}
          disabledFor={() => undefined}
          onPick={(id) => void pick(id)}
          onMix={() => undefined}
          onPeek={prefetchCompose}
        />
      );
    }
    render(<Shelf />, { wrapper: wrapper() });

    // Sweeping across the shelf composes nothing: only a pointer that rests 300 ms does.
    fireEvent.pointerEnter(screen.getByRole("radio", { name: /Gentle scale/ }));
    await flush(PEEK_DWELL_MS - 50);
    fireEvent.pointerLeave(screen.getByRole("radio", { name: /Gentle scale/ }));
    fireEvent.focus(screen.getByRole("radio", { name: /Quick tour/ }));
    await flush(PEEK_DWELL_MS - 50);
    fireEvent.blur(screen.getByRole("radio", { name: /Quick tour/ }));
    // The mix record composes nothing on its own: it has no preset to warm.
    fireEvent.pointerEnter(screen.getByRole("radio", { name: /Create your mix/ }));
    await flush(PEEK_DWELL_MS * 2);
    await flush(1000);
    expect(aerosolApi.compose).not.toHaveBeenCalled();

    fireEvent.pointerEnter(screen.getByRole("radio", { name: /Four aerosols/ }));
    await flush(PEEK_DWELL_MS);
    expect(aerosolApi.compose).toHaveBeenCalledTimes(1);
    expect(aerosolApi.bytes).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Four aerosols/ }));
    await flush();
    expect(aerosolApi.compose).toHaveBeenCalledTimes(1); // served from the Query cache
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("prefetchDefault composes and fetches the default preset without playing", async () => {
    const { result } = renderPreset();
    await act(() => result.current.prefetchDefault());

    expect(aerosolApi.compose).toHaveBeenCalledWith(
      "svs-5669",
      { mode: "harmony", durationSec: 64, sensitivity: 2 },
      expect.any(AbortSignal),
    );
    expect(weatherApi.compose).not.toHaveBeenCalled();
    expect(aerosolApi.bytes).toHaveBeenCalledTimes(AEROSOL_KEYS.length);
    expect(player.ctx.resume).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();

    await act(() => result.current.pick("nasa-four"));
    expect(aerosolApi.compose).toHaveBeenCalledTimes(1);
    expect(aerosolApi.bytes).toHaveBeenCalledTimes(AEROSOL_KEYS.length); // stems came from the cache
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("remembers a preset in prefs once it plays, not when it is only warmed", async () => {
    const { result } = renderPreset();
    await act(() => result.current.pick("nasa-scale", { play: false }));
    expect(usePrefs.getState().lastPreset).toBe("nasa-four");
    await act(() => result.current.pick("live-rain"));
    expect(usePrefs.getState().lastPreset).toBe("live-rain");
  });

  it("without ?p= the last played preset is selected, not played", async () => {
    setPref("lastPreset", "nasa-scale");
    renderHook(() => usePresetUrlSync(), { wrapper: wrapper("/") });
    await flush();
    expect(useSession.getState()).toMatchObject({ presetId: "nasa-scale", source: "nasa" });
    expect(player.ctx.resume).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();
  });

  it("a remount of the URL sync keeps the current selection", async () => {
    setPref("lastPreset", "nasa-scale");
    const first = renderHook(() => usePresetUrlSync(), { wrapper: wrapper("/") });
    await flush();
    act(() => useSession.getState().pick("live-heat"));
    first.unmount();
    renderHook(() => usePresetUrlSync(), { wrapper: wrapper("/") });
    await flush();
    expect(useSession.getState().presetId).toBe("live-heat");
  });

  it("coming back to / without ?p= (logo, a link from /how) puts the selection back in the URL", async () => {
    let search = "";
    function Probe() {
      usePresetUrlSync();
      search = useLocation().search;
      return null;
    }
    const first = render(<Probe />, { wrapper: wrapper("/?p=live-wind") });
    await flush();
    expect(search).toBe("?p=live-wind");
    first.unmount();
    render(<Probe />, { wrapper: wrapper("/") });
    await flush();
    expect(useSession.getState().presetId).toBe("live-wind");
    expect(search).toBe("?p=live-wind");
  });

  it("?p= wins over the last played preset", async () => {
    setPref("lastPreset", "nasa-scale");
    renderHook(() => usePresetUrlSync(), { wrapper: wrapper("/?p=live-wind") });
    await flush();
    expect(useSession.getState().presetId).toBe("live-wind");
  });

  it("prefetchDefault warms the preset the screen opened with", async () => {
    useSession.getState().pick("nasa-four");
    const { result } = renderPreset();
    await act(() => result.current.prefetchDefault());
    expect(aerosolApi.compose).toHaveBeenCalledWith(
      "svs-5669",
      expect.objectContaining({ mode: "harmony" }),
      expect.any(AbortSignal),
    );
    expect(weatherApi.compose).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();
  });

  it("repeat off stops the player when the tail ends, and pause cancels that", async () => {
    setPref("repeat", "off");
    const { result } = renderPreset();
    await act(() => result.current.pick("nasa-four"));
    expect(player.setRepeat).toHaveBeenLastCalledWith("off");

    await flush(30_000);
    act(() => player.pause());
    await flush(60_000);
    expect(player.stop).not.toHaveBeenCalled();

    await act(() => player.play());
    await flush((64 + 3 - 30) * 1000 + 10);
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(player.playing).toBe(false);
  });

  it("mono keeps the pan at the centre", async () => {
    const { result } = renderPreset();
    await act(() => result.current.pick("live-rain"));
    expect(player.setPan).not.toHaveBeenCalled();

    act(() => setPref("stereo", false));
    expect(player.setPan).toHaveBeenLastCalledWith(0);

    player.setPan.mockClear();
    await act(() => result.current.pick("live-wind"));
    expect(player.setPan).toHaveBeenCalledWith(0);
  });

  it("a live mix set to repeat every layer tours them, queuing the next one at the boundary", async () => {
    const { result } = renderPreset();
    act(() => useSession.getState().setCustom(tourMix()));
    await act(() => result.current.pick("custom"));
    await flush();

    expect(
      vi
        .mocked(weatherApi.compose)
        .mock.calls.map(([s]) => s.section)
        .sort(),
    ).toEqual(["clouds", "precipitation", "temperature", "wind"]);
    expect(player.setRepeat).toHaveBeenCalledWith("all");
    expect(player.load.mock.calls[0][2]).toBe("custom");
    expect(useSession.getState().soundscape?.id).toBe("w-temperature-algorithmic");
    expect(player.setNext).toHaveBeenCalledTimes(1);
    expect(result.current.tour).toEqual({ ready: 4, total: 4, id: "custom" });
    expect(player.play).toHaveBeenCalledTimes(1);

    act(() => player.onAdvance?.("custom"));
    await flush();
    expect(useSession.getState().soundscape?.id).toBe("w-precipitation-algorithmic");
    expect(player.setNext).toHaveBeenCalledTimes(2);
  });

  it("a Tune change during the tour keeps the layer that sounds, a changed layer tile starts there", async () => {
    const { result } = renderPreset();
    const tourPreset = tourMix();
    act(() => useSession.getState().setCustom(tourPreset));
    await act(() => result.current.pick("custom"));
    await flush();
    act(() => player.onAdvance?.("custom"));
    await flush();
    expect((useSession.getState().soundscape as WeatherSoundscape | undefined)?.section).toEqual({
      key: "precipitation",
    });

    act(() =>
      useSession
        .getState()
        .setCustom({ ...tourPreset, settings: { ...tourPreset.settings, cycles: 5 } }),
    );
    await act(() => result.current.pick("custom"));
    await flush();
    expect((useSession.getState().soundscape as WeatherSoundscape | undefined)?.section).toEqual({
      key: "precipitation",
    }); // not back to temperature

    act(() =>
      useSession
        .getState()
        .setCustom({ ...tourPreset, settings: { ...tourPreset.settings, section: "wind" } }),
    );
    await act(() => result.current.pick("custom"));
    await flush();
    expect((useSession.getState().soundscape as WeatherSoundscape | undefined)?.section).toEqual({
      key: "wind",
    });
  });

  it("writes later picks to ?p= and leaves a first visit clean", async () => {
    let search = "";
    function Probe() {
      usePresetUrlSync();
      const { pick } = usePreset();
      search = useLocation().search;
      return (
        <button type="button" onClick={() => void pick("nasa-scale")}>
          go
        </button>
      );
    }
    render(<Probe />, { wrapper: wrapper("/") });
    await flush();
    expect(aerosolApi.compose).not.toHaveBeenCalled();
    expect(search).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await flush();
    expect(search).toBe("?p=nasa-scale");
  });
});
