import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pick = vi.hoisted(() => vi.fn(async () => undefined));
const pending = vi.hoisted(() => vi.fn<(id?: string) => boolean>(() => false));

vi.mock("../src/audio/player-instance", async () => (await import("./fakes/player")).playerModule);
vi.mock("../src/audio/probe-voice", () => ({
  ProbeVoice: vi.fn(() => ({ play: vi.fn(), release: vi.fn() })),
}));
vi.mock("../src/features/presets/usePreset", async (orig) => ({
  ...(await orig<typeof import("../src/features/presets/usePreset")>()),
  usePreset: () => ({
    pick,
    prefetchCompose: vi.fn(),
    prefetchDefault: vi.fn(async () => undefined),
    progress: {},
  }),
}));
vi.mock("../src/features/presets/engine", async (orig) => ({
  ...(await orig<typeof import("../src/features/presets/engine")>()),
  isPlayPending: pending,
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { useSession } from "../src/features/presets";
import { resetAnnounce } from "../src/features/transport";
import {
  barLevels,
  BARS,
  drawBars,
  drawFlat,
  REDUCED_FPS,
} from "../src/features/transport/draw-waves";
import { resetExplore } from "../src/features/stage/explore";
import { dictFor, setLang } from "../src/shared/i18n";
import { installCanvas, player, renderApp, seededClient, weatherScape } from "./fakes/home";

const en = dictFor("en");

/** An analyser that counts how often the waves read it. */
function fakeAnalyser() {
  return {
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn((out: Uint8Array) => out.fill(200)),
  };
}

const bar = () => screen.getByRole("region", { name: en["transport.label"] });

beforeAll(installCanvas);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  player.reset();
  vi.clearAllMocks();
  pending.mockImplementation(() => false);
  player.getAnalyser.mockReturnValue(null);
  resetExplore();
  resetAnnounce();
  useSession.setState(useSession.getInitialState(), true);
  usePrefs.setState(defaultPrefs(), true);
  setPref("lang", "en");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setLang("en");
});

describe("player bar", () => {
  it("is on / and holds the only Play disc (the stage has none)", () => {
    renderApp("/", seededClient());
    const region = bar();
    expect(region).toHaveAttribute("id", "player");
    expect(screen.getAllByRole("button", { name: en["play.listen"] })).toHaveLength(1);
    expect(within(region).getByRole("button", { name: en["play.listen"] })).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).queryByRole("button", { name: en["play.listen"] }),
    ).toBeNull();
    // Outside <main>, after it: a landmark of its own that every page shares.
    expect(screen.getByRole("main").contains(region)).toBe(false);
  });

  it("is on /how too, with seek, volume, Tune and Save, and a skip link to it", async () => {
    renderApp("/how", seededClient());
    await screen.findByRole("heading", { level: 1, name: en["how2.title"] });
    const region = bar();
    expect(within(region).getByRole("slider", { name: en["transport.seek"] })).toBeInTheDocument();
    expect(within(region).getByRole("slider", { name: en["vol.label"] })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: en["tune.open"] })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: en["save.open"] })).toBeInTheDocument();
    const skips = within(screen.getByRole("navigation", { name: en["skip.label"] })).getAllByRole(
      "link",
    );
    expect(skips.map((a) => a.textContent)).toEqual([en["skip.toMain"], en["skip.toPlayer"]]);
    await userEvent.click(skips[1]!);
    expect(document.activeElement).toBe(region);
  });

  it("stays the same element across / -> /how -> /, and the sound goes on", async () => {
    const user = userEvent.setup();
    useSession.setState({ presetId: "live-rain", source: "live", soundscape: weatherScape() });
    player.set({ ready: true, playing: true, duration: 60, position: 5, tag: "live-rain" });
    renderApp("/", seededClient());
    const first = bar();

    await user.click(screen.getByRole("link", { name: en["nav.how"] }));
    await screen.findByRole("heading", { level: 1, name: en["how2.title"] });
    expect(bar()).toBe(first);
    expect(within(first).getByRole("button", { name: en["play.listen"] })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The mix chips come along: the piece is still the one on the player.
    expect(within(first).getByRole("list", { name: en["mix.label"] })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: en["app.title"] }));
    expect(bar()).toBe(first);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.stop).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
    expect(player.playing).toBe(true);
  });

  it("Play on /how picks the selection when nothing is loaded; Space there keeps scrolling", async () => {
    renderApp("/how", seededClient());
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(within(bar()).getByRole("button", { name: en["play.listen"] }));
    expect(pick).toHaveBeenCalledWith("nasa-four");
    const space = new KeyboardEvent("keydown", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    expect(pick).toHaveBeenCalledTimes(1);
    // Other transport keys stay global: volume still moves on /how.
    fireEvent.keyDown(document.body, { code: "Equal", key: "=" });
    expect(usePrefs.getState().volume).toBeCloseTo(0.75);
  });

  it("Play while that same piece is still loading from a click does not start it over", async () => {
    renderApp("/", seededClient());
    pending.mockImplementation((id?: string) => id === "nasa-four");
    await userEvent.click(within(bar()).getByRole("button", { name: en["play.listen"] }));
    expect(pick).not.toHaveBeenCalled();
    pending.mockImplementation((id?: string) => id === "nasa-scale"); // another piece loading: Play starts the selection
    await userEvent.click(within(bar()).getByRole("button", { name: en["play.listen"] }));
    expect(pick).toHaveBeenCalledWith("nasa-four");
  });

  it("Stop sends the piece back to the start and keeps it silent; it waits until something is loaded", async () => {
    renderApp("/", seededClient());
    const stop = within(bar()).getByRole("button", { name: en["transport.stop"] });
    expect(stop).toBeDisabled();
    act(() =>
      player.set({ ready: true, playing: true, duration: 60, position: 20, tag: "live-rain" }),
    );
    expect(stop).toBeEnabled();
    await userEvent.click(stop);
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(player.setPan).toHaveBeenLastCalledWith(0);
    expect(player.playing).toBe(false);
    expect(pick).not.toHaveBeenCalled();
  });

  it("Space plays on Home", async () => {
    renderApp("/", seededClient());
    const space = new KeyboardEvent("keydown", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(pick).toHaveBeenCalledWith("nasa-four");
  });

  it("shows what plays: state, title and source", () => {
    useSession.setState({ presetId: "nasa-scale", source: "nasa", booted: true });
    const { unmount } = renderApp("/", seededClient());
    expect(within(bar()).getByText(en["player.ready"])).toBeInTheDocument();
    expect(within(bar()).getByText(en["preset.nasa-scale.title"])).toBeInTheDocument();
    expect(within(bar()).getByText(en["preset.badge.nasa"])).toBeInTheDocument();
    unmount();

    // The piece on the player wins over the selection, and says whether it plays or waits.
    player.set({ ready: true, playing: true, duration: 60, tag: "live-heat" });
    renderApp("/", seededClient());
    expect(within(bar()).getByText(en["player.now"])).toBeInTheDocument();
    expect(within(bar()).getByText(en["preset.live-heat.title"])).toBeInTheDocument();
    act(() => player.set({ playing: false }));
    expect(within(bar()).getByText(en["player.paused"])).toBeInTheDocument();
  });

  it("the Instruments toggle opens volume and the chips, Escape closes it and returns focus", async () => {
    const user = userEvent.setup();
    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderApp("/", seededClient());
    const toggle = within(bar()).getByRole("button", { name: en["player.tools"] });
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toContainElement(within(bar()).getByRole("slider", { name: en["vol.label"] }));
    expect(panel).toContainElement(within(bar()).getByRole("list", { name: en["mix.label"] }));
    expect(panel).not.toHaveAttribute("data-open");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("data-open");
    within(panel).getByRole("slider", { name: en["vol.label"] }).focus();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(toggle);
  });

  it("icon-only buttons: each keeps its name for assistive tech and shows it as a tooltip", () => {
    useSession.setState({
      presetId: "live-rain",
      source: "live",
      soundscape: weatherScape(),
      booted: true,
    });
    renderApp("/", seededClient());
    for (const key of ["transport.stop", "player.tools", "tune.open", "save.open"]) {
      const button = within(bar()).getByRole("button", { name: en[key] });
      const tip = button.closest("[data-align]")!.lastElementChild!;
      expect(tip).toHaveTextContent(en[key]);
      expect(tip).toHaveAttribute("aria-hidden", "true");
      expect(button).not.toHaveAttribute("title"); // no second, native tooltip
    }
    // Only the instruments keep a note behind an "i". The waves and the volume have none: they got in the way.
    expect(within(bar()).getByRole("button", { name: en["mix.tip.label"] })).toBeInTheDocument();
    expect(en["waves.tip.label"]).toBeUndefined();
    expect(dictFor("uk")["waves.tip"]).toBeUndefined();
    const volume = within(bar()).getByRole("slider", { name: en["vol.label"] }).parentElement!;
    expect(volume.closest("[class*=volume]")!.querySelector("button")).toBeNull();
    expect(en["vol.tip.label"]).toBeUndefined();
    expect(dictFor("uk")["vol.tip"]).toBeUndefined();
  });

  it("the toast region sits above the bar", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/shared/ui/Toast.module.css", "utf8")).toMatch(
      /inset-block-end:\s*calc\(var\(--player-h\)/,
    );
    expect(readFileSync("src/shared/styles/base.css", "utf8")).toMatch(
      /padding-block-end:\s*var\(--player-h\)/,
    );
  });
});

describe("sound waves", () => {
  const canvas = () => bar().querySelector("canvas")!;

  it("are hidden from assistive tech", () => {
    renderApp("/", seededClient());
    expect(canvas()).toHaveAttribute("aria-hidden", "true");
  });

  it("do not draw while paused, draw every frame while playing, and stop again on pause", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const analyser = fakeAnalyser();
    player.getAnalyser.mockReturnValue(analyser as unknown as AnalyserNode);
    player.set({ ready: true, duration: 60, tag: "live-rain" });
    renderApp("/", seededClient());
    act(() => void vi.advanceTimersByTime(500));
    expect(analyser.getByteFrequencyData).not.toHaveBeenCalled();
    expect(canvas()).toHaveAttribute("data-playing", "false");

    act(() => player.set({ playing: true }));
    act(() => void vi.advanceTimersByTime(500));
    const drawn = analyser.getByteFrequencyData.mock.calls.length;
    expect(drawn).toBeGreaterThan(10);

    act(() => player.set({ playing: false }));
    act(() => void vi.advanceTimersByTime(500));
    expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(drawn);
  });

  it("with reduce motion redraw at most 4 times a second, without requestAnimationFrame", () => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setInterval", "clearInterval"],
    });
    setPref("reduceMotion", true);
    const analyser = fakeAnalyser();
    player.getAnalyser.mockReturnValue(analyser as unknown as AnalyserNode);
    player.set({ ready: true, duration: 60, tag: "live-rain", playing: true });
    renderApp("/", seededClient());
    analyser.getByteFrequencyData.mockClear();
    act(() => void vi.advanceTimersByTime(1000));
    expect(analyser.getByteFrequencyData.mock.calls.length).toBeGreaterThan(0);
    expect(analyser.getByteFrequencyData.mock.calls.length).toBeLessThanOrEqual(REDUCED_FPS);
  });

  it("never ask for an analyser before a gesture made the audio graph (nothing playing)", () => {
    renderApp("/", seededClient());
    expect(player.getAnalyser).not.toHaveBeenCalled();
  });
});

describe("draw-waves", () => {
  function recorder() {
    const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
    const ctx = {
      fillStyle: "",
      clearRect: vi.fn(),
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ x, y, w, h, fill: this.fillStyle });
      },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
  }
  const colors = { ink: "#111111", accent: "#E8452C" };

  it("folds the bins into BARS levels between 0 and 1, more of them for the low end", () => {
    const bins = new Uint8Array(128);
    bins[0] = 255;
    const levels = barLevels(bins);
    expect(levels).toHaveLength(BARS);
    expect(levels[0]).toBe(1);
    expect(Math.max(...levels.slice(1))).toBe(0);
    expect(barLevels(new Uint8Array(128).fill(255)).every((v) => v === 1)).toBe(true);
    // Every bin lands in exactly one bar, in order: a ramp gives rising levels.
    const ramp = barLevels(Uint8Array.from({ length: 128 }, (_, k) => Math.min(255, k * 4)));
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]!);
  });

  it("idle is one flat line across the middle", () => {
    const { ctx, rects } = recorder();
    drawFlat(ctx, 100, 40, colors);
    expect(rects).toEqual([{ x: 0, y: 19, w: 100, h: 2, fill: "#111111" }]);
  });

  it("bars are mirrored around the middle; only the loudest get the accent cap", () => {
    const { ctx, rects } = recorder();
    drawBars(ctx, 100, 40, [0.5, 1], colors);
    const ink = rects.filter((r) => r.fill === "#111111" && r.w < 100);
    expect(ink).toHaveLength(2);
    for (const r of ink) expect(r.y + r.h / 2).toBe(20);
    expect(rects.filter((r) => r.fill === "#E8452C")).toHaveLength(2); // top and bottom cap of the loud bar
  });
});
