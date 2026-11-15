import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const player = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let snapshot = { playing: false, ready: false, duration: 0, tag: null as unknown };
  const notify = () => {
    snapshot = { playing: p.playing, ready: p.ready, duration: p.duration, tag: null };
    listeners.forEach((cb) => cb());
  };
  const p = {
    playing: false,
    ready: false,
    duration: 0,
    position: 0,
    play: vi.fn(async () => {
      p.playing = true;
      notify();
    }),
    pause: vi.fn(() => {
      p.playing = false;
      notify();
    }),
    seek: vi.fn(),
    setVolume: vi.fn(),
    getAnalyser: vi.fn((): AnalyserNode | null => null),
    setRepeat: vi.fn(),
    setEnabled: vi.fn(),
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot: () => snapshot,
    getPositionRev: () => 0,
    set(over: Partial<{ playing: boolean; ready: boolean; position: number; duration: number }>) {
      Object.assign(p, over);
      notify();
    },
    reset() {
      p.playing = false;
      p.ready = false;
      p.position = 0;
      p.duration = 0;
      notify();
    },
  };
  return p;
});
const narrator = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
  speaking: false,
  enabled: false,
}));
const pick = vi.hoisted(() => vi.fn(async () => undefined));
const applyRepeatPref = vi.hoisted(() => vi.fn());

vi.mock("../src/audio/player-instance", () => ({
  getPlayer: () => player,
  getNarrator: () => narrator,
}));
vi.mock("../src/features/presets/usePreset", async (orig) => ({
  ...(await orig<typeof import("../src/features/presets/usePreset")>()),
  usePreset: () => ({ pick, prefetchCompose: vi.fn(), prefetchDefault: vi.fn(), progress: {} }),
}));
vi.mock("../src/features/presets/engine", async (orig) => ({
  ...(await orig<typeof import("../src/features/presets/engine")>()),
  applyRepeatPref,
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { END_GRACE_SEC, useSession } from "../src/features/presets";
import {
  Captions,
  MixChips,
  NowPlaying,
  resetAnnounce,
  TransportBar,
} from "../src/features/transport";
import {
  queryKeys,
  type Soundscape,
  type WeatherGrid,
  type WeatherSection,
  type WeatherSoundscape,
} from "../src/shared/api";
import { dictFor, setLang } from "../src/shared/i18n";
import { ToastProvider } from "../src/shared/ui";

const en = dictFor("en");
const uk = dictFor("uk");

const lats = [-60, -20, 20, 60];
const lons = [-135, -45, 45, 135];
const grid: WeatherGrid = {
  lats,
  lons,
  observedAt: "2026-11-14T12:00:00Z",
  source: "test",
  isSnapshot: false,
  notes: [],
  values: {
    temperature: lats.map(() => lons.map(() => 20)),
    precipitation: lats.map(() => lons.map(() => 2)),
    clouds: lats.map(() => lons.map(() => 50)),
    wind: lats.map(() => lons.map(() => 10)),
  },
};
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

function layer(key: string, color: string) {
  return {
    key,
    label: key,
    color,
    voice: "",
    about: "",
    pitchLow: 0,
    pitchHigh: 0,
    pixelCount: 10,
    share: 0.3,
  };
}

function aerosolScape(): Soundscape {
  return {
    id: "a1",
    mode: "harmony",
    width: 8,
    height: 4,
    bins: 4,
    durationSec: 64,
    stepSec: 16,
    layers: [layer("dust", "#c08040"), layer("sea_salt", "#4080c0"), layer("sulfate", "#c0c040")],
    profiles: [0, 1, 2].map(() => ({ coverage: [1, 1, 1, 1], position: [0.5, 0.5, 0.5, 0.5] })),
    steps: [0, 1, 2, 3].map(() => ({ chord: "Dm9", strength: [0.9, 0.5, 0.2] })),
    artifacts: {
      classMap: "/c.png",
      stems: { dust: "/d.wav", sea_salt: "/s.wav", sulfate: "/u.wav", bed: "/b.wav" },
      mix: "",
      midi: "",
    },
  } as unknown as Soundscape;
}

function weatherScape(): WeatherSoundscape {
  const n = 8;
  const t = Array.from({ length: n }, (_, k) => k / (n - 1));
  return {
    id: "w1",
    section: rain,
    observedAt: "2026-11-14T12:00:00Z",
    durationSec: 60,
    maxLat: 80,
    title: "Rain",
    rationaleEn: "Rain is heavy near the equator.",
    rationaleUk: "Дощ сильний біля екватора.",
    path: {
      t,
      lat: t.map((x) => 60 * Math.cos(2 * Math.PI * x)),
      lon: t.map((x) => -180 + 360 * x),
      value: t.map(() => 2),
      level: t.map(() => 0.5),
    },
    notes: [{ part: "lead", time: 0, duration: 100, pitch: 80, velocity: 1 }],
    parts: [
      { key: "lead", instrument: "harp" },
      { key: "bass", instrument: "bass" },
    ],
    artifacts: { stems: { lead: "/l.wav", bass: "/b.wav" }, mix: "" },
  } as unknown as WeatherSoundscape;
}

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function renderBar(ui: ReactNode = <TransportBar />) {
  return render(ui, { wrapper: Providers });
}

function showArchive() {
  useSession.setState({
    source: "nasa",
    soundscape: aerosolScape(),
    muted: { dust: false, sea_salt: false, sulfate: false, bed: false },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(queryKeys.weather.grid, grid);
  player.reset();
  vi.clearAllMocks();
  narrator.speaking = false;
  narrator.enabled = false;
  resetAnnounce();
  useSession.setState(useSession.getInitialState(), true);
  usePrefs.setState(defaultPrefs(), true);
});

afterEach(() => {
  vi.useRealTimers();
  client.clear();
  vi.unstubAllGlobals();
  setLang("en");
});

describe("MixChips", () => {
  const parts = [
    { key: "dust", label: "Dust", color: "#c08040", texture: "dots" as const },
    { key: "sea_salt", label: "Sea salt", color: "#4080c0", texture: "horizontal" as const },
  ];

  it("chip click mutes and sets aria-pressed=false with dashed style", async () => {
    showArchive();
    renderBar();
    const chip = screen.getByRole("button", { name: /Dust/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).not.toHaveStyle({ borderStyle: "dashed" });
    await userEvent.click(chip);
    expect(useSession.getState().muted.dust).toBe(true);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveStyle({ borderStyle: "dashed", textDecoration: "line-through" });
    expect(player.setEnabled).toHaveBeenCalledWith("dust", false);
  });

  it("shift+click solos", () => {
    const onToggle = vi.fn();
    const onSolo = vi.fn();
    render(<MixChips parts={parts} muted={{}} onToggle={onToggle} onSolo={onSolo} />);
    fireEvent.click(screen.getByRole("button", { name: /Sea salt/ }), { shiftKey: true });
    expect(onSolo).toHaveBeenCalledWith("sea_salt");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("every chip carries a texture swatch and its shortcut", () => {
    render(<MixChips parts={parts} muted={{}} onToggle={() => {}} onSolo={() => {}} />);
    const chips = screen.getAllByRole("button");
    expect(chips).toHaveLength(2);
    for (const c of chips) expect(c.querySelector("svg")).not.toBeNull();
    expect(chips[1]).toHaveAttribute("aria-keyshortcuts", "2 Shift+2");
  });

  it("archive chips take the layer colour, or the colour-safe one with a texture", () => {
    showArchive();
    const { unmount } = renderBar();
    expect(screen.getByRole("button", { name: /Dust/ }).querySelector("rect")).toHaveAttribute(
      "fill",
      "#c08040",
    );
    unmount();
    setPref("colorSafe", true);
    renderBar();
    expect(screen.getByRole("button", { name: /Dust/ }).querySelector("rect")).toHaveAttribute(
      "fill",
      "#CC79A7",
    );
  });

  it("live chips list the soundscape parts with their names", () => {
    useSession.setState({ soundscape: weatherScape(), muted: {} });
    renderBar();
    const list = screen.getByRole("list", { name: en["mix.label"] });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([`${en["w.part.lead"]}1`, `${en["w.part.bass"]}2`]);
  });
});

describe("TransportBar keys", () => {
  it("Space toggles play outside inputs", () => {
    player.set({ ready: true, duration: 64 });
    showArchive();
    renderBar();
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(player.play).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(pick).not.toHaveBeenCalled();
  });

  it("Space with no sound ready picks the preset of the shown source", () => {
    renderBar();
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(pick).toHaveBeenCalledWith("nasa-four");
    expect(player.play).not.toHaveBeenCalled();
  });

  it("Space does nothing when focus is on a range input", () => {
    player.set({ ready: true, duration: 64 });
    showArchive();
    renderBar();
    const seek = screen.getByRole("slider", { name: en["transport.seek"] });
    seek.focus();
    fireEvent.keyDown(seek, { code: "Space", key: " " });
    expect(player.play).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
  });

  it("Space does nothing when the access drawer is open", () => {
    player.set({ ready: true, duration: 64 });
    showArchive();
    render(
      <>
        <TransportBar />
        <dialog open>
          <button type="button">Close</button>
        </dialog>
      </>,
      { wrapper: Providers },
    );
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(player.play).not.toHaveBeenCalled();
  });

  it("digit toggles the part and says so, Shift+2 solos the second one", async () => {
    showArchive();
    renderBar();
    await userEvent.keyboard("1");
    expect(useSession.getState().muted.dust).toBe(true);
    expect(narrator.speak).toHaveBeenLastCalledWith(
      en["announce.layerOff"].replace("{layer}", "Dust"),
    );
    await userEvent.keyboard("1");
    expect(useSession.getState().muted.dust).toBe(false);

    await userEvent.keyboard("{Shift>}2{/Shift}");
    expect(useSession.getState().muted).toMatchObject({
      dust: true,
      sea_salt: false,
      sulfate: true,
    });
    expect(narrator.speak).toHaveBeenLastCalledWith(
      en["announce.solo"].replace("{layer}", "Sea Salt"),
    );
    await userEvent.keyboard("{Shift>}2{/Shift}");
    expect(useSession.getState().muted).toMatchObject({
      dust: false,
      sea_salt: false,
      sulfate: false,
    });
    expect(narrator.speak).toHaveBeenLastCalledWith(en["announce.allOn"]);
  });

  it("a digit beyond the parts does nothing", async () => {
    showArchive();
    renderBar();
    await userEvent.keyboard("7");
    expect(useSession.getState().muted).toMatchObject({
      dust: false,
      sea_salt: false,
      sulfate: false,
    });
  });

  it("minus and equals move the volume by 5 points and clamp", async () => {
    renderBar();
    await userEvent.keyboard("-");
    expect(usePrefs.getState().volume).toBeCloseTo(0.65);
    expect(player.setVolume).toHaveBeenLastCalledWith(expect.closeTo(0.65));
    await userEvent.keyboard("==");
    expect(usePrefs.getState().volume).toBeCloseTo(0.75);
    setPref("volume", 0.98);
    await userEvent.keyboard("=");
    expect(usePrefs.getState().volume).toBe(1);
  });

  it("S toggles speech and speaks the answer at once", async () => {
    renderBar();
    await userEvent.keyboard("s");
    expect(usePrefs.getState().speech).toBe(true);
    expect(narrator.enabled).toBe(true);
    expect(narrator.speak).toHaveBeenLastCalledWith(en["announce.speechOn"]);
    await userEvent.keyboard("s");
    expect(usePrefs.getState().speech).toBe(false);
    expect(screen.queryByText(en["announce.speechOff"])).toBeNull(); // no NowPlaying here
  });

  it("D describes the whole archive map, or the live piece's rationale", async () => {
    showArchive();
    const { unmount } = renderBar();
    await userEvent.keyboard("d");
    const said = narrator.speak.mock.lastCall![0] as string;
    expect(said).toContain("Map of 3 aerosol types");
    unmount();
    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderBar();
    await userEvent.keyboard("d");
    expect(narrator.speak).toHaveBeenLastCalledWith("Rain. Rain is heavy near the equator.");
  });

  it("W speaks where the wave is, but stays quiet when the map explorer has focus", () => {
    useSession.setState({ source: "live", soundscape: weatherScape() });
    render(
      <>
        <TransportBar />
        <div role="slider" tabIndex={0} aria-label="explorer" aria-valuenow={0} data-explorer="" />
      </>,
      { wrapper: Providers },
    );
    fireEvent.keyDown(document.body, { code: "KeyW", key: "w" });
    expect(narrator.speak).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("slider", { name: "explorer" }), { code: "KeyW", key: "w" });
    expect(narrator.speak).toHaveBeenCalledTimes(1);
  });
});

describe("TransportBar sliders", () => {
  it("seek commits to the player and reads m:ss", () => {
    player.set({ ready: true, duration: 125, position: 65 });
    showArchive();
    renderBar();
    const seek = screen.getByRole("slider", { name: en["transport.seek"] });
    expect(seek).toHaveAttribute("aria-valuetext", "1:05");
    expect(seek).toHaveAttribute("max", "125");
    fireEvent.change(seek, { target: { value: "90" } });
    expect(player.seek).not.toHaveBeenCalled();
    fireEvent.pointerUp(seek);
    expect(player.seek).toHaveBeenCalledWith(90);
  });

  it("volume applies live while dragging and is saved on commit", () => {
    renderBar();
    const volume = screen.getByRole("slider", { name: en["vol.label"] });
    expect(volume).toHaveAttribute("aria-valuetext", "70%");
    fireEvent.change(volume, { target: { value: "0.3" } });
    expect(player.setVolume).toHaveBeenLastCalledWith(0.3);
    expect(usePrefs.getState().volume).toBe(0.7);
    fireEvent.pointerUp(volume);
    expect(usePrefs.getState().volume).toBe(0.3);
  });

  it("repeat changed during playback is re-applied to the player", () => {
    renderBar();
    expect(applyRepeatPref).not.toHaveBeenCalled();
    act(() => setPref("repeat", "off"));
    expect(applyRepeatPref).toHaveBeenCalledTimes(1);
  });

  it("announces the end when playback stops at the end of the scan, not on a pause", () => {
    vi.useFakeTimers();
    showArchive();
    renderBar(
      <>
        <TransportBar />
        <NowPlaying />
      </>,
    );
    act(() => player.set({ ready: true, duration: 64, playing: true, position: 10 }));
    act(() => {
      player.position = 20;
      vi.advanceTimersByTime(500);
    });
    act(() => player.set({ playing: false }));
    expect(screen.queryByText(en["announce.end"])).toBeNull();

    act(() => player.set({ playing: true, position: 60 }));
    act(() => {
      player.position = 64 + END_GRACE_SEC;
      vi.advanceTimersByTime(300);
    });
    act(() => player.set({ playing: false, position: 0 }));
    expect(screen.getByText(en["announce.end"])).toBeInTheDocument();
  });
});

describe("NowPlaying", () => {
  it("is a polite live region", () => {
    renderBar(<NowPlaying />);
    expect(document.querySelector("[aria-live=polite]")).not.toBeNull();
  });

  it("NowPlaying announces at most once per 4 s", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    showArchive();
    renderBar(<NowPlaying />);
    act(() => player.set({ ready: true, duration: 64, playing: true, position: 1 }));
    const region = () => document.querySelector("[aria-live=polite]")!.textContent;
    const first = region();
    expect(first).toContain("Dust");
    expect(narrator.speak).toHaveBeenCalledTimes(1);

    // step 1 begins at 16 s: a new sentence, but it is only 1.5 s after the last
    act(() => {
      player.position = 17;
      vi.advanceTimersByTime(1500);
    });
    expect(region()).toBe(first);
    expect(narrator.speak).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(3000));
    expect(region()).not.toBe(first);
    expect(narrator.speak).toHaveBeenCalledTimes(2);

    // step 2 begins at 32 s: 1 s later it waits again
    act(() => {
      player.position = 33;
      vi.advanceTimersByTime(1000);
    });
    expect(narrator.speak).toHaveBeenCalledTimes(2);
  });

  it("does not talk over the narrator", () => {
    vi.useFakeTimers();
    narrator.speaking = true;
    showArchive();
    renderBar(<NowPlaying />);
    act(() => player.set({ ready: true, duration: 64, playing: true, position: 1 }));
    expect(narrator.speak).not.toHaveBeenCalled();
    expect(document.querySelector("[aria-live=polite]")!.textContent).toBe("");
  });

  it("live: describes the point on the path", () => {
    vi.useFakeTimers();
    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderBar(<NowPlaying />);
    act(() => player.set({ ready: true, duration: 60, playing: true, position: 5 }));
    expect(document.querySelector("[aria-live=polite]")!.textContent).toMatch(
      /near .*: 2\.0 mm\/h/,
    );
  });
});

describe("Captions", () => {
  it("shows the idle line until playback, then the sounding voices", () => {
    showArchive();
    renderBar(<Captions />);
    expect(screen.getByText(en["captions.idle"])).toBeInTheDocument();
    act(() => player.set({ ready: true, duration: 64, playing: true, position: 1 }));
    expect(screen.queryByText(en["captions.idle"])).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("muted layers leave the captions", () => {
    showArchive();
    useSession.setState({ muted: { dust: true, sea_salt: true, sulfate: true, bed: false } });
    renderBar(<Captions />);
    act(() => player.set({ ready: true, duration: 64, playing: true, position: 1 }));
    expect(screen.getByText(en["captions.silence"])).toBeInTheDocument();
  });

  it("live: lists the parts that sound at this time", () => {
    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderBar(<Captions />);
    act(() => player.set({ ready: true, duration: 60, playing: true, position: 5 }));
    expect(screen.getByText(new RegExp(en["w.part.lead"]))).toBeInTheDocument();
  });

  it("live: the first seconds of a piece built from a newer reading say so", async () => {
    const old = { ...weatherScape(), id: "w-old", observedAt: "2026-11-14T14:15:00Z" };
    useSession.setState({ source: "live", soundscape: old });
    renderBar(<Captions />);
    act(() => player.set({ ready: true, duration: 60, playing: true, position: 2 }));
    expect(screen.queryByText(/New data/)).toBeNull();

    const fresh = { ...old, id: "w-new", observedAt: "2026-11-14T14:30:00Z" };
    act(() => useSession.setState({ soundscape: fresh }));
    act(() => player.set({ position: 1 }));
    const time = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(fresh.observedAt));
    expect(screen.getByText(`♪ New data ${time}`)).toBeInTheDocument();
    act(() => player.set({ position: 8 }));
    await waitFor(() => expect(screen.queryByText(/New data/)).toBeNull()); // the position follows in rAF
  });

  it("is a fixed-height box that scrolls inside, not a live region", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/features/transport/transport.module.css", "utf8");
    const rule = css.match(/\.captions \{[^}]*\}/)![0];
    expect(rule).toMatch(/\bheight:\s*calc\(/);
    expect(rule).not.toMatch(/min-height/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).not.toMatch(/transition/);
    showArchive();
    renderBar(<Captions />);
    const box = screen.getByRole("region", { name: en["captions.label"] });
    expect(box).not.toHaveAttribute("aria-live");
    expect(box.querySelector("[aria-live]")).toBeNull();
    expect(box).not.toHaveAttribute("tabindex"); // focusable only when its lines overflow
  });

  it("is hidden when captions are off", () => {
    setPref("captions", false);
    renderBar(<Captions />);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("turned off, it does not follow the position while the music plays (no 10 renders a second)", () => {
    setPref("captions", false);
    useSession.setState({ source: "live", soundscape: weatherScape() });
    const raf = vi.spyOn(window, "requestAnimationFrame");
    renderBar(<Captions />);
    act(() => player.set({ playing: true, ready: true, duration: 60 }));
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });

  it("follows the interface language", () => {
    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderBar(<Captions />);
    act(() => setLang("uk"));
    expect(screen.getByText(uk["captions.idle"])).toBeInTheDocument();
  });
});
