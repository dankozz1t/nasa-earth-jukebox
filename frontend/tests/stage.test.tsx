import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useState, type ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
    load: vi.fn(),
    seek: vi.fn(),
    spot: vi.fn(async () => undefined),
    setPan: vi.fn(),
    setEnabled: vi.fn(),
    input: vi.fn(() => ({ ctx: { resume: async () => undefined }, node: {} })),
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot: () => snapshot,
    getPositionRev: () => 0,
    set(over: Partial<{ playing: boolean; ready: boolean; position: number }>) {
      Object.assign(p, over);
      notify();
    },
    reset() {
      p.playing = false;
      p.ready = false;
      p.position = 0;
      notify();
    },
  };
  return p;
});
const narrator = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn(), speaking: false }));
const pick = vi.hoisted(() => vi.fn(async () => undefined));
const probeVoice = vi.hoisted(() => ({ play: vi.fn(), release: vi.fn() }));

vi.mock("../src/audio/player-instance", () => ({
  getPlayer: () => player,
  getNarrator: () => narrator,
}));
vi.mock("../src/audio/probe-voice", () => ({ ProbeVoice: vi.fn(() => probeVoice) }));
vi.mock("../src/features/presets/usePreset", async (orig) => ({
  ...(await orig<typeof import("../src/features/presets/usePreset")>()),
  usePreset: () => ({ pick, prefetchCompose: vi.fn(), prefetchDefault: vi.fn(), progress: {} }),
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { useSession } from "../src/features/presets";
import { SourceSwitch, Stage, StageSourceSwitch } from "../src/features/stage";
import { PlayControl, PlayDisc } from "../src/features/transport";
import { resetExplore } from "../src/features/stage/explore";
import {
  queryKeys,
  type Frame,
  type Soundscape,
  type WeatherGrid,
  type WeatherSection,
  type WeatherSoundscape,
} from "../src/shared/api";
import { dictFor, setLang } from "../src/shared/i18n";

const en = dictFor("en");

// jsdom has no 2D canvas: a context that accepts every call and records nothing.
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const methods: Record<string, unknown> = {
    canvas,
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) =>
      key in methods ? methods[key] : key in target ? target[key] : () => undefined,
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return fakeContext(this);
  } as never);
});

const frame: Frame = {
  id: "svs-5669",
  title: "GEOS Aerosols",
  source: "NASA SVS 5669",
  pageUrl: "",
  timestampUtc: "2025-08-19T20:00:00Z",
  imageUrl: "/api/frames/svs-5669/image",
};

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

function aerosolScape(): Soundscape {
  return {
    id: "a1",
    width: 8,
    height: 4,
    bins: 4,
    durationSec: 64,
    stepSec: 16,
    layers: [
      {
        key: "dust",
        label: "Dust",
        color: "#c08040",
        voice: "",
        about: "",
        pitchLow: 0,
        pitchHigh: 0,
        pixelCount: 10,
        share: 0.3,
      },
    ],
    profiles: [{ coverage: [1, 1, 1, 1], position: [0.5, 0.5, 0.5, 0.5] }],
    steps: [0, 1, 2, 3].map(() => ({ chord: "Dm9", strength: [0.5] })),
    artifacts: { classMap: "/c.png", stems: { dust: "/d.wav", bed: "/b.wav" }, mix: "", midi: "" },
    frame,
  } as unknown as Soundscape;
}

function weatherScape(): WeatherSoundscape {
  const n = 8;
  const t = Array.from({ length: n }, (_, k) => k / (n - 1));
  return {
    id: "w1",
    section: rain,
    durationSec: 60,
    maxLat: 80,
    path: {
      t,
      lat: t.map((x) => 60 * Math.cos(2 * Math.PI * x)),
      lon: t.map((x) => -180 + 360 * x),
      value: t.map(() => 2),
      level: t.map(() => 0.5),
    },
    notes: [],
    parts: [{ key: "lead", instrument: "harp" }],
    artifacts: { stems: { lead: "/l.wav" }, mix: "" },
  } as unknown as WeatherSoundscape;
}

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderStage(ui: ReactNode = <Stage />) {
  return render(ui, { wrapper: Providers });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(queryKeys.frames, [frame]);
  client.setQueryData(queryKeys.weather.grid, grid);
  client.setQueryData(queryKeys.weather.sections, [rain]);
  player.reset();
  vi.clearAllMocks();
  resetExplore();
  // Most of the stage's behaviour is the live map's; the archive cases switch the source themselves.
  useSession.setState(
    { ...useSession.getInitialState(), presetId: "live-rain", source: "live" },
    true,
  );
  usePrefs.setState(defaultPrefs(), true);
});

afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
  setLang("en");
});

describe("SourceSwitch", () => {
  it("source switch is a labelled radiogroup with icon, name and subtitle", async () => {
    const onChange = vi.fn();
    render(<SourceSwitch value="live" onChange={onChange} nasaTimestamp={frame.timestampUtc} />);
    const group = screen.getByRole("radiogroup", { name: en["source.label"] });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);

    const nasa = within(group).getByRole("radio", { name: en["source.nasa"] });
    const live = within(group).getByRole("radio", { name: en["source.live"] });
    expect(live).toHaveAttribute("aria-checked", "true");
    expect(nasa).toHaveAttribute("aria-checked", "false");
    expect(nasa).toHaveAccessibleDescription("08/19/2025");
    expect(live).toHaveAccessibleDescription(en["source.live.every"]);
    for (const r of radios) expect(r.querySelector("svg")).not.toBeNull();

    // one Tab stop; arrows select
    expect(live).toHaveAttribute("tabindex", "0");
    expect(nasa).toHaveAttribute("tabindex", "-1");
    live.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("nasa");
  });

  it("shows the archive date in the interface language", () => {
    setLang("uk");
    render(<SourceSwitch value="nasa" onChange={() => {}} nasaTimestamp={frame.timestampUtc} />);
    expect(
      screen.getByRole("radio", { name: dictFor("uk")["source.nasa"] }),
    ).toHaveAccessibleDescription("19.08.2025");
  });

  it("changing the source moves the session and does not start sound", async () => {
    renderStage(<StageSourceSwitch />);
    await userEvent.click(screen.getByRole("radio", { name: en["source.nasa"] }));
    expect(useSession.getState().source).toBe("nasa");
    expect(player.play).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
  });
});

describe("Stage", () => {
  it("archive source shows the static-frame badge and no live indicator", () => {
    useSession.setState({ source: "nasa" });
    renderStage();
    expect(
      screen.getByText(en["stage.staticFrame"].replace("{date}", "08/19/2025, 20:00")),
    ).toBeInTheDocument();
    expect(screen.queryByText(en["stage.ear.left"])).toBeNull();
    expect(screen.queryByText(en["stage.ear.right"])).toBeNull();
    expect(screen.getByRole("slider", { name: en["explorer.label"] })).toBeInTheDocument();
  });

  it("live source shows the headphone labels (north left, south right) and no archive badge", () => {
    renderStage();
    const left = screen.getByText(en["stage.ear.left"]);
    const right = screen.getByText(en["stage.ear.right"]);
    expect(left.querySelector("svg[data-ear='left']")).not.toBeNull();
    expect(right.querySelector("svg[data-ear='right']")).not.toBeNull();
    expect(en["stage.ear.left"]).toBe("Left headphone · north");
    expect(screen.queryByText(/Static frame/)).toBeNull();
    // The balance under the map draws both headphones, and an "i" says what left and right mean.
    const balance = document.querySelector<HTMLElement>("[data-balance]")!;
    expect(balance.querySelectorAll("svg[data-ear]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: en["balance.tip.label"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en["legend.tip.label"] })).toBeInTheDocument();
  });

  it("mono hides the ear labels", () => {
    setPref("stereo", false);
    renderStage();
    expect(screen.queryByText(en["stage.ear.left"])).toBeNull();
    expect(screen.queryByRole("button", { name: en["balance.tip.label"] })).toBeNull();
  });

  it("explorer ArrowRight updates aria-valuetext with the place name", async () => {
    renderStage();
    const slider = screen.getByRole("slider", { name: en["w.explorer"] });
    expect(slider).toHaveAttribute("aria-valuetext", en["explorer.notStarted"]);
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "5");
    expect(slider.getAttribute("aria-valuetext")).toContain("the South Atlantic");
    expect(slider.getAttribute("aria-valuetext")).toContain("2.0 mm/h");
    // a key press is a gesture: the probe sounds while the piece is not playing
    expect(probeVoice.play).toHaveBeenCalledWith(
      "precipitation",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("the keyboard explorer's place shows in the line under the map, like the pointer's", async () => {
    renderStage();
    const readout = () =>
      document.querySelector<HTMLElement>("[data-balance]")!.parentElement!.querySelector("p")!;
    expect(readout()).toHaveTextContent(en["readout.hover"]);
    const slider = screen.getByRole("slider", { name: en["w.explorer"] });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(readout()).toBeVisible();
    expect(readout().textContent).toMatch(/^2\.0 mm\/h · the South Atlantic \(/);
  });

  it("live playback: the line under the map follows the sound, and the balance dot shows the ear (hidden in mono)", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      useSession.setState({ source: "live", soundscape: weatherScape() });
      player.set({ ready: true, playing: true, position: 0.01 });
      const { unmount } = renderStage();
      act(() => vi.advanceTimersToNextFrame());
      const balance = document.querySelector<HTMLElement>("[data-balance]")!;
      expect(balance).toHaveAttribute("aria-hidden", "true");
      const dot = balance.querySelector<HTMLElement>("[data-balance-dot]")!;
      expect(parseFloat(dot.style.left)).toBeLessThan(50); // the path starts at 60° N: left ear
      expect(balance.parentElement!.querySelector("p")!.textContent).toMatch(
        /^2\.0 mm\/h · .+\(60/,
      );
      unmount();

      act(() => setPref("stereo", false));
      renderStage();
      expect(document.querySelector("[data-balance]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("explorer probe stays silent while the piece plays", async () => {
    player.set({ ready: true, playing: true });
    renderStage();
    const slider = screen.getByRole("slider", { name: en["w.explorer"] });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(slider.getAttribute("aria-valuetext")).toContain("the South Atlantic");
    expect(probeVoice.play).not.toHaveBeenCalled();
  });

  it("aerosol explorer steps across the frame and names the spot", async () => {
    const s = aerosolScape();
    useSession.setState({ source: "nasa", soundscape: s });
    renderStage();
    const slider = screen.getByRole("slider", { name: en["explorer.label"] });
    expect(slider).toHaveAttribute("aria-valuemax", "3");
    slider.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    // the class map is still loading: the cursor moves, the words wait for it
    expect(slider).toHaveAttribute("aria-valuetext", en["explorer.notStarted"]);
  });

  it("W says where you are on the live path", async () => {
    useSession.setState({ soundscape: weatherScape() });
    renderStage();
    const slider = screen.getByRole("slider", { name: en["w.explorer"] });
    slider.focus();
    await userEvent.keyboard("w");
    expect(narrator.speak).toHaveBeenCalledWith(expect.stringContaining("2.0 mm/h"));
    expect(screen.getByRole("status")).toHaveTextContent("2.0 mm/h");
  });

  // Play lives in the player bar now; these check the toggle it shares with the stage's source.
  it("Play picks the session preset while the player is not ready", async () => {
    renderStage(
      <>
        <Stage />
        <PlayControl />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: en["play.listen"] }));
    expect(pick).toHaveBeenCalledWith("live-rain");
    expect(player.play).not.toHaveBeenCalled();
  });

  it("Play picks the first archive preset when the archive side is shown", async () => {
    useSession.setState({ source: "nasa" });
    renderStage(
      <>
        <Stage />
        <PlayControl />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: en["play.listen"] }));
    expect(pick).toHaveBeenCalledWith("nasa-four");
  });

  it("Play toggles the loaded piece without composing again", async () => {
    useSession.setState({ soundscape: weatherScape() });
    player.set({ ready: true });
    renderStage(
      <>
        <Stage />
        <PlayControl />
      </>,
    );
    const disc = screen.getByRole("button", { name: en["play.listen"] });
    await userEvent.click(disc);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(disc).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(disc);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(pick).not.toHaveBeenCalled();
  });

  it("the stage itself has no Play: the player bar holds the only one", () => {
    renderStage();
    expect(screen.queryByRole("button", { name: en["play.listen"] })).toBeNull();
  });

  it("archive soundscape centres the pan; live playback pans by latitude, mono keeps it centred", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      useSession.setState({ source: "nasa", soundscape: aerosolScape() });
      const { unmount } = renderStage();
      expect(player.setPan).toHaveBeenLastCalledWith(0);
      unmount();

      player.setPan.mockClear();
      useSession.setState({ source: "live", soundscape: weatherScape() });
      player.set({ ready: true, playing: true, position: 0.01 });
      renderStage();
      act(() => vi.advanceTimersToNextFrame());
      const north = player.setPan.mock.calls.at(-1)?.[0] as number;
      expect(north).toBeLessThan(0); // path starts at 60°N: left ear

      act(() => setPref("stereo", false));
      act(() => vi.advanceTimersToNextFrame());
      expect(player.setPan).toHaveBeenLastCalledWith(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("while the wave is reshaped in Tune the pan follows the drawn preview", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      useSession.setState({ source: "live", soundscape: weatherScape() });
      player.set({ ready: true, playing: true, position: 0.01 });
      renderStage();
      act(() => vi.advanceTimersToNextFrame());
      expect(player.setPan.mock.calls.at(-1)?.[0] as number).toBeCloseTo(-0.75, 1); // the sounding path starts at 60° N

      act(() => useSession.getState().setPreview({ cycles: 1, amplitude: 0.2 }));
      act(() => vi.advanceTimersToNextFrame());
      // The drawn wave starts at 16° N, so the dot and the ear are both near the middle.
      expect(player.setPan.mock.calls.at(-1)?.[0] as number).toBeCloseTo(-0.185, 1);

      act(() => useSession.getState().setPreview(null));
      act(() => vi.advanceTimersToNextFrame());
      expect(player.setPan.mock.calls.at(-1)?.[0] as number).toBeCloseTo(-0.75, 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pointer on the live map sounds the probe only after audio exists", () => {
    renderStage();
    const map = screen.getByRole("slider", { name: en["w.explorer"] }).parentElement!;
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 360,
      height: 180,
      right: 360,
      bottom: 180,
      x: 0,
      y: 0,
      toJSON() {},
    });
    fireEvent.pointerMove(map, { clientX: 185, clientY: 90 });
    expect(probeVoice.play).not.toHaveBeenCalled(); // no AudioContext before a gesture
    fireEvent.pointerDown(map, { clientX: 185, clientY: 90 });
    expect(probeVoice.play).toHaveBeenCalledTimes(1);
    expect(narrator.speak).toHaveBeenCalledWith(expect.stringContaining("the South Atlantic"));
  });
});

describe("Stage fixes", () => {
  // StrictMode (dev) and <Activity> both run effect cleanups and set-ups again on the same refs.
  // StrictMode's double effects do not fire under this test renderer, so Activity reproduces the remount.
  it("keeps animating after its effects are torn down and set up again", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      const raf = vi.spyOn(window, "requestAnimationFrame");
      const ui = (mode: "visible" | "hidden") => (
        <Activity mode={mode}>
          <Stage />
        </Activity>
      );
      const { rerender } = renderStage(ui("visible")); // a frame is pending now
      rerender(ui("hidden"));
      rerender(ui("visible"));
      act(() => vi.advanceTimersToNextFrame());
      raf.mockClear();
      act(() => player.set({ ready: true }));
      expect(raf).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a frame image that fails to load shows an error, not loading", async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailingImage);
    useSession.setState({ source: "nasa" });
    renderStage();
    expect(await screen.findByText(en["stage.frameError"])).toBeInTheDocument();
    expect(screen.queryByText(en["stage.loadingFrame"])).toBeNull();
  });

  it("shows the loading label while the frame image loads", () => {
    useSession.setState({ source: "nasa" });
    renderStage();
    expect(screen.getByText(en["stage.loadingFrame"])).toBeInTheDocument();
  });
});

describe("PlayDisc", () => {
  it("PlayDisc toggles aria-pressed", async () => {
    function Harness() {
      const [playing, setPlaying] = useState(false);
      return <PlayDisc playing={playing} onToggle={() => setPlaying(!playing)} />;
    }
    render(<Harness />);
    const disc = screen.getByRole("button", { name: en["play.listen"] });
    expect(disc).toHaveAttribute("aria-pressed", "false");
    expect(disc).toHaveTextContent(en["play.listen"]);
    await userEvent.click(disc);
    expect(disc).toHaveAttribute("aria-pressed", "true");
    expect(disc).not.toHaveTextContent(en["play.listen"]); // the word goes after the first play
    await userEvent.click(disc);
    expect(disc).toHaveAttribute("aria-pressed", "false");
  });
});
