import { QueryClient } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A player that keeps the deck state the engine looks at, and lets the test fire a cycle boundary.
const player = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((cb) => cb());
  let snapshot = { playing: false, ready: false, duration: 0, tag: null as unknown };
  const p = {
    playing: false,
    ready: false,
    duration: 0,
    position: 0,
    tag: null as unknown,
    onAdvance: null as null | ((tag: unknown) => void),
    load: vi.fn(
      async (
        _s: Record<string, ArrayBuffer>,
        duration: number,
        tag: unknown,
        opts?: { stale?: () => boolean },
      ) => {
        if (opts?.stale?.()) return false;
        Object.assign(p, { duration, tag, ready: true });
        notify();
        return true;
      },
    ),
    setNext: vi.fn<
      (stems: Record<string, ArrayBuffer>, duration: number, tag: unknown) => Promise<boolean>
    >(async () => true),
    clearNext: vi.fn(),
    setRepeat: vi.fn(),
    setEnabled: vi.fn(),
    setPan: vi.fn(),
    setVolume: vi.fn(),
    getAnalyser: vi.fn((): AnalyserNode | null => null),
    seek: vi.fn(),
    spot: vi.fn(async () => undefined),
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
    input: () => ({ ctx: { state: "running", resume: async () => undefined }, node: {} }),
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    // Stable until a field changes, like the real player: the player bar reads it through useSyncExternalStore.
    getSnapshot: () => {
      const s = snapshot;
      if (
        s.playing !== p.playing ||
        s.ready !== p.ready ||
        s.duration !== p.duration ||
        s.tag !== p.tag
      ) {
        snapshot = { playing: p.playing, ready: p.ready, duration: p.duration, tag: p.tag };
      }
      return snapshot;
    },
    getPositionRev: () => 0,
    reset() {
      Object.assign(p, {
        playing: false,
        ready: false,
        duration: 0,
        position: 0,
        tag: null,
        onAdvance: null,
      });
    },
  };
  return p;
});
const narrator = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
  speaking: false,
  hasVoice: () => true,
}));

vi.mock("../src/audio/player-instance", () => ({
  getPlayer: () => player,
  getNarrator: () => narrator,
}));

import { Providers } from "../src/app/providers";
import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { AppRoutes } from "../src/app/App";
import { LivePanel, resetLiveFlashes, useLiveUpdates } from "../src/features/live";
import {
  presetById,
  usePreset,
  useSession,
  type Preset,
  type SessionPresetId,
} from "../src/features/presets";
import { resetPresetEngine } from "../src/features/presets/engine";
import { resetAnnounce, useNowText } from "../src/features/transport/announce";
import {
  aerosolApi,
  queryKeys,
  weatherApi,
  type Reading,
  type SectionKey,
  type WeatherGrid,
  type WeatherSection,
  type WeatherSoundscape,
} from "../src/shared/api";
import { dictFor, setLang } from "../src/shared/i18n";

const en = dictFor("en");
const uk = dictFor("uk");
const NOW = Date.parse("2026-11-14T14:24:30Z");
const MIN = 60_000;

const local = (iso: string) =>
  new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );

const rain: WeatherSection = {
  key: "precipitation",
  label: "",
  unit: "mm/h",
  low: 0,
  high: 8,
  logScale: true,
  palette: "rain",
  tempoBpm: 76,
  mood: "",
};

const lats = [-60, -20, 20, 60];
const lons = [-135, -45, 45, 135];
const flat = (v: number) => lats.map(() => lons.map(() => v));

function makeGrid(
  over: Partial<WeatherGrid> = {},
  rainAt?: (i: number, j: number) => number,
): WeatherGrid {
  return {
    lats,
    lons,
    observedAt: "2026-11-14T14:00:00Z",
    nextUpdateAt: new Date(NOW + 7 * MIN).toISOString(),
    source: "test",
    isSnapshot: false,
    notes: [],
    values: {
      temperature: flat(20),
      precipitation: rainAt ? lats.map((_, i) => lons.map((_, j) => rainAt(i, j))) : flat(1),
      clouds: flat(50),
      wind: flat(10),
    },
    ...over,
  };
}

function reading(observedAt: string, temperature = 14.2): Reading {
  const means: Record<SectionKey, number> = {
    temperature,
    precipitation: 0.31,
    clouds: 61.5,
    wind: 18.9,
  };
  return { observedAt, isSnapshot: false, means, maxima: means };
}

/** n readings 30 minutes apart, ending at 14:00 UTC. */
function readings(n: number): Reading[] {
  const end = Date.parse("2026-11-14T14:00:00Z");
  return Array.from({ length: n }, (_, k) =>
    reading(new Date(end - (n - 1 - k) * 30 * MIN).toISOString(), 10 + k),
  );
}

function client(grid: WeatherGrid, list?: Reading[]): QueryClient {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  c.setQueryData(queryKeys.weather.grid, grid);
  c.setQueryData(queryKeys.weather.sections, [rain]);
  if (list) c.setQueryData(queryKeys.weather.readings(grid.observedAt), { readings: list });
  return c;
}

function renderPanel(c: QueryClient) {
  return render(
    <Providers client={c}>
      <LivePanel />
    </Providers>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW,
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  player.reset();
  vi.clearAllMocks();
  resetAnnounce();
  resetPresetEngine();
  resetLiveFlashes();
  useSession.setState(
    { ...useSession.getInitialState(), presetId: "live-rain", source: "live" },
    true,
  );
  usePrefs.setState(defaultPrefs(), true);
  setPref("lang", "en");
});

afterEach(() => {
  resetPresetEngine();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setLang("en");
});

describe("LivePanel", () => {
  it("is two lines: pulse, On air and the reading time, then when the next update comes", () => {
    const { container } = renderPanel(client(makeGrid(), readings(10)));
    const panel = screen.getByRole("region", { name: en["live.label"] });
    expect(container.querySelector("[data-pulse]")).toHaveAttribute("data-pulse", "live");
    expect(within(panel).getByText(en["live.onAir"])).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveTextContent(local("2026-11-14T14:00:00Z"));
    expect(within(panel).getByText("Next update in 7 min · every 30 min")).toBeInTheDocument();
    // Nothing else but the credit: no 30-segment bar, no readings strip, no sparkline.
    expect(container.querySelectorAll("p")).toHaveLength(3);
    expect(container.querySelector("[data-segment]")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(container.querySelector("svg polyline")).toBeNull();
  });

  it("the 'i' says where the data comes from, the UTC time and the 30-minute rhythm", async () => {
    renderPanel(client(makeGrid()));
    const info = screen.getByRole("button", { name: en["live.tip.label"] });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => info.focus());
    const tip = screen.getByRole("tooltip");
    expect(info).toHaveAccessibleDescription(tip.textContent!);
    expect(tip).toHaveTextContent("Open-Meteo");
    expect(tip).toHaveTextContent("14:00 UTC");
    expect(tip).toHaveTextContent("every 30 minutes");
  });

  it.each(["en", "uk"] as const)(
    "credits Open-Meteo and its CC BY 4.0 licence in sight, live or snapshot (%s)",
    (lang) => {
      setPref("lang", lang);
      const t = dictFor(lang);
      for (const isSnapshot of [false, true]) {
        const { container, unmount } = renderPanel(client(makeGrid({ isSnapshot })));
        const credit = container.querySelector("p:last-of-type")!;
        expect(credit).toBeVisible();
        expect(credit.textContent).toBe(
          `${t["live.credit"]} ${t["live.credit.source"]} ${t["how2.external"]} (${t["live.credit.license"]} ${t["how2.external"]})`,
        );
        const [source, licence] = within(credit as HTMLElement).getAllByRole("link");
        expect(source).toHaveAttribute("href", "https://open-meteo.com/");
        expect(licence).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
        for (const link of [source!, licence!]) {
          expect(link).toHaveAttribute("target", "_blank");
          expect(link.getAttribute("rel")).toMatch(/\bnoopener\b/);
        }
        unmount();
      }
    },
  );

  it("a next update further than 30 minutes away names the real wait", () => {
    renderPanel(client(makeGrid({ nextUpdateAt: new Date(NOW + 31.5 * MIN).toISOString() })));
    expect(screen.getByText("Next update in 32 min · every 30 min")).toBeInTheDocument();
  });

  it("the live text is Ukrainian in uk", () => {
    setPref("lang", "uk");
    renderPanel(client(makeGrid()));
    expect(screen.getByText(uk["live.onAir"])).toBeInTheDocument();
    expect(screen.getByText(uk["live.next"].replace("{minutes}", "7"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: uk["live.tip.label"] })).toBeInTheDocument();
  });

  it("the countdown ticks and turns into 'updating' when the update is due, never negative", () => {
    renderPanel(client(makeGrid()));
    expect(screen.getByText("Next update in 7 min · every 30 min")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2 * MIN));
    expect(screen.getByText("Next update in 5 min · every 30 min")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(6 * MIN));
    expect(screen.getByText(en["live.updating"])).toBeInTheDocument();
    expect(screen.queryByText(/-\d+ min/)).toBeNull();
  });

  it("a grid without a next update time leaves the second line out", () => {
    const { container } = renderPanel(client(makeGrid({ nextUpdateAt: undefined })));
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(screen.queryByText(/Next update/)).toBeNull();
  });

  it("snapshot grid shows grey pulse and 'Snapshot, not live', with the reason behind the 'i'", () => {
    const { container } = renderPanel(
      client(makeGrid({ isSnapshot: true, notes: ["Offline mode: bundled snapshot."] }), []),
    );
    expect(container.querySelector("[data-pulse]")).toHaveAttribute("data-pulse", "snapshot");
    expect(screen.getByText(en["live.snapshot"])).toBeInTheDocument();
    expect(screen.queryByText(en["live.onAir"])).toBeNull();
    // a snapshot is not on a 30-minute rhythm: no countdown line
    expect(screen.queryByText(/Next update in/)).toBeNull();
    // the reason is read with the panel, and shown in the note
    const panel = screen.getByRole("region", { name: en["live.label"] });
    expect(panel).toHaveTextContent(en["warn.offline"]);
    act(() => screen.getByRole("button", { name: en["live.tip.label"] }).focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent(en["warn.offline"]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("not live");
  });
});

/** What the harness saw on its last render. */
const seen = {
  flashes: -1,
  pick: (async () => undefined) as (
    id: SessionPresetId,
    opts?: { play?: boolean },
  ) => Promise<void>,
};

function Harness() {
  const { flashes } = useLiveUpdates();
  const { pick } = usePreset();
  useEffect(() => {
    seen.flashes = flashes.length;
    seen.pick = pick;
  });
  return null;
}

function renderHarness(c: QueryClient) {
  return render(
    <Providers client={c}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </Providers>,
  );
}

const NEXT = "2026-11-14T14:30:00Z";

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(0);
  });
}

describe("useLiveUpdates", () => {
  it("new observedAt flashes changed points, toasts and announces", async () => {
    const c = client(makeGrid());
    renderHarness(c);
    expect(seen.flashes).toBe(0);

    // two of sixteen cells get much more rain; one changes by a hair
    const next = makeGrid({ observedAt: NEXT }, (i, j) =>
      i === 1 && j < 2 ? 6 : i === 3 && j === 3 ? 1.02 : 1,
    );
    act(() => void c.setQueryData(queryKeys.weather.grid, next));

    expect(seen.flashes).toBe(2);
    expect(screen.getByText(`New reading ${local(NEXT)}`)).toBeInTheDocument();
    expect(useNowText.getState().text).toBe(`New weather reading at ${local(NEXT)}`);
    expect(narrator.speak).toHaveBeenCalledWith(`New weather reading at ${local(NEXT)}`);
    // one polite message for screen readers: the toast is shown, not read out a second time
    expect(screen.getByRole("status")).not.toHaveTextContent("New reading");
  });

  it("same observedAt after refetch: no flash, no toast", async () => {
    const c = client(makeGrid());
    renderHarness(c);
    act(
      () =>
        void c.setQueryData(
          queryKeys.weather.grid,
          makeGrid({}, () => 6),
        ),
    );
    expect(seen.flashes).toBe(0);
    expect(screen.queryByText(/New reading/)).toBeNull();
    expect(useNowText.getState().text).toBe("");
  });

  it("a new reading while the archive is on stage changes no live signal", async () => {
    const c = client(makeGrid());
    useSession.setState({ source: "nasa" });
    renderHarness(c);
    act(
      () =>
        void c.setQueryData(
          queryKeys.weather.grid,
          makeGrid({ observedAt: NEXT }, () => 6),
        ),
    );
    expect(seen.flashes).toBe(0);
    expect(screen.queryByText(/New reading/)).toBeNull();
  });

  describe("music", () => {
    let version = 1;
    const scape = (section: SectionKey) =>
      ({
        id: `w-${section}-v${version}`,
        section: { key: section },
        durationSec: 60,
        observedAt: version === 1 ? "2026-11-14T14:00:00Z" : NEXT,
        composer: { requested: "algorithmic", used: "rules", aiAvailable: true },
        path: { t: [0, 1], lat: [0, 0], lon: [-180, 180], value: [1, 1], level: [0.5, 0.5] },
        parts: [{ key: "lead", instrument: "harp" }], // the player bar lists them as mix chips on every page
        artifacts: { stems: { lead: `/w/${section}-v${version}/lead.wav` }, mix: "" },
      }) as unknown as WeatherSoundscape;

    beforeEach(() => {
      version = 1;
      vi.spyOn(weatherApi, "compose").mockImplementation(async (s) => scape(s.section));
      vi.spyOn(aerosolApi, "bytes").mockImplementation(
        async (url: string) => new TextEncoder().encode(url).buffer as ArrayBuffer,
      );
    });

    const deckOf = (call: unknown[]) =>
      new TextDecoder().decode(Object.values(call[0] as Record<string, ArrayBuffer>)[0]);

    it("new reading during playback queues music for the next cycle boundary", async () => {
      const c = client(makeGrid());
      renderHarness(c);
      await act(() => seen.pick("live-rain"));
      await flush();
      expect(player.load).toHaveBeenCalledTimes(1);
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v1");

      version = 2;
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();

      expect(player.load).toHaveBeenCalledTimes(1); // nothing cut in mid-cycle
      expect(player.setNext).toHaveBeenCalledTimes(1);
      expect(deckOf(player.setNext.mock.calls[0])).toBe("/w/precipitation-v2/lead.wav");
      expect(player.setNext.mock.calls[0][2]).toBe("live-rain");
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v1"); // still the old piece until the boundary

      act(() => player.onAdvance?.("live-rain"));
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v2");
    });

    it("an unchanged composition after a new reading queues nothing", async () => {
      const c = client(makeGrid());
      renderHarness(c);
      await act(() => seen.pick("live-rain"));
      await flush();
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();
      expect(weatherApi.compose).toHaveBeenCalledTimes(2);
      expect(player.setNext).not.toHaveBeenCalled();
      expect(player.load).toHaveBeenCalledTimes(1);
    });

    it("the layer tour takes the new reading through its own queue, at the boundary", async () => {
      const c = client(makeGrid());
      renderHarness(c);
      // A live mix set to repeat every layer, as Sound settings makes it.
      const rain = presetById("live-rain")!;
      if (rain.source !== "live") throw new Error("live-rain is live");
      const tour = {
        ...rain,
        settings: { ...rain.settings, section: "temperature" as const, cycles: 2, durationSec: 40 },
        repeat: "all" as const,
      };
      act(() => useSession.getState().setCustom(tour));
      await act(() => seen.pick("custom"));
      await flush();
      expect(player.load).toHaveBeenCalledTimes(1);
      expect(deckOf(player.setNext.mock.calls.at(-1)!)).toBe("/w/precipitation-v1/lead.wav");
      player.setNext.mockClear();

      version = 2;
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();

      expect(player.load).toHaveBeenCalledTimes(1);
      expect(player.setNext).toHaveBeenCalledTimes(1);
      expect(deckOf(player.setNext.mock.calls[0])).toBe("/w/precipitation-v2/lead.wav");
      expect(useSession.getState().soundscape?.id).toBe("w-temperature-v1");
      act(() => player.onAdvance?.("custom"));
      await flush();
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v2");
    });

    it("a boundary while the fresh deck still decodes keeps showing the old piece", async () => {
      const c = client(makeGrid());
      renderHarness(c);
      await act(() => seen.pick("live-rain"));
      await flush();
      let decoded!: () => void;
      player.setNext.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (decoded = () => resolve(true))),
      );

      version = 2;
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();
      expect(player.setNext).toHaveBeenCalledTimes(1);

      // repeat "one": the old deck loops and the player fires onAdvance at that boundary
      act(() => player.onAdvance?.("live-rain"));
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v1");

      await act(async () => decoded());
      await flush();
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v1");
      act(() => player.onAdvance?.("live-rain"));
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v2");
    });

    it("a live piece that does not loop (repeat off) gets no fresh deck after its end", async () => {
      const base = presetById("live-rain")!;
      const once = { ...base, repeat: "off" } as Preset;
      useSession.getState().setCustom(once);
      const c = client(makeGrid());
      renderHarness(c);
      await act(() => seen.pick("custom"));
      await flush();
      expect(player.load).toHaveBeenCalledTimes(1);

      version = 2;
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();
      expect(weatherApi.compose).toHaveBeenCalledTimes(1);
      expect(player.setNext).not.toHaveBeenCalled();
    });

    it("a new reading while on /how still reaches the music, without the home-screen signals", async () => {
      const c = client(makeGrid());
      function PickProbe() {
        const { pick } = usePreset();
        useEffect(() => {
          seen.pick = pick;
        });
        return null;
      }
      render(
        <Providers client={c}>
          <MemoryRouter initialEntries={["/how"]}>
            <AppRoutes />
            <PickProbe />
          </MemoryRouter>
        </Providers>,
      );
      await act(() => seen.pick("live-rain"));
      await flush();
      narrator.speak.mockClear(); // "Playing: …" was said for the pick; below only the reading counts

      version = 2;
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();
      expect(weatherApi.compose).toHaveBeenCalledTimes(2);
      expect(deckOf(player.setNext.mock.calls[0])).toBe("/w/precipitation-v2/lead.wav");
      expect(player.load).toHaveBeenCalledTimes(1);
      // Not the toast; the page itself says "Every 30 min".
      expect(screen.queryByText(/^New reading \d/)).toBeNull();
      expect(narrator.speak).not.toHaveBeenCalled();
    });

    it("a pick that only warmed (no sound) gets no fresh deck behind the piece the player still holds", async () => {
      const c = client(makeGrid());
      renderHarness(c);
      await act(() => seen.pick("live-rain"));
      await flush();
      await act(() => seen.pick("live-wind", { play: false })); // selected without sound: live-rain plays on
      await flush();
      expect(player.tag).toBe("live-rain");

      version = 2;
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();
      expect(player.setNext).not.toHaveBeenCalled();
      expect(player.load).toHaveBeenCalledTimes(1);
    });

    it("a fresh deck the player dropped (a load came while it decoded) is never shown at the boundary", async () => {
      const c = client(makeGrid());
      renderHarness(c);
      await act(() => seen.pick("live-rain"));
      await flush();
      player.setNext.mockImplementationOnce(async () => false);

      version = 2;
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();
      expect(player.setNext).toHaveBeenCalledTimes(1);
      act(() => player.onAdvance?.("live-rain"));
      expect(useSession.getState().soundscape?.id).toBe("w-precipitation-v1");
    });

    it("a preset that starts playing is announced politely with its title and length, in both languages", async () => {
      const c = client(makeGrid());
      function PickProbe() {
        const { pick } = usePreset();
        useEffect(() => {
          seen.pick = pick;
        });
        return null;
      }
      render(
        <Providers client={c}>
          <MemoryRouter initialEntries={["/how"]}>
            <AppRoutes />
            <PickProbe />
          </MemoryRouter>
        </Providers>,
      );
      await act(() => seen.pick("live-rain"));
      await flush();
      expect(useNowText.getState().text).toBe("Playing: Rain right now. 60 seconds");
      expect(narrator.speak).toHaveBeenCalledWith("Playing: Rain right now. 60 seconds");

      act(() => setPref("lang", "uk"));
      await act(() => seen.pick("live-wind"));
      await flush();
      expect(useNowText.getState().text).toBe("Грає: Карта вітрів. 60 секунд");
    });

    it("nothing playing: a new reading composes nothing", async () => {
      const c = client(makeGrid());
      renderHarness(c);
      act(() => void c.setQueryData(queryKeys.weather.grid, makeGrid({ observedAt: NEXT })));
      await flush();
      expect(weatherApi.compose).not.toHaveBeenCalled();
      expect(player.setNext).not.toHaveBeenCalled();
    });
  });
});
