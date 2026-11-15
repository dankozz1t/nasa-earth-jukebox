// axe-core audit of every tab of "Sound settings", both sources and both languages, with a piece on the stage
// (so Instruments and More show their full content). Contrast is covered by tests/tokens.test.ts.

import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/audio/player-instance", async () => (await import("./fakes/player")).playerModule);
vi.mock("../src/audio/probe-voice", () => ({
  ProbeVoice: vi.fn(() => ({ play: vi.fn(), release: vi.fn() })),
}));
vi.mock("../src/features/presets/usePreset", async (orig) => ({
  ...(await orig<typeof import("../src/features/presets/usePreset")>()),
  usePreset: () => ({
    pick: vi.fn(),
    prefetchCompose: vi.fn(),
    prefetchDefault: vi.fn(async () => undefined),
    progress: {},
  }),
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { useSession, type Source } from "../src/features/presets";
import { resetExplore } from "../src/features/stage/explore";
import { resetAnnounce } from "../src/features/transport";
import { useOverlay } from "../src/shared/lib/overlays";
import { dictFor, setLang, type Lang } from "../src/shared/i18n";
import type { WeatherSoundscape } from "../src/shared/api";
import {
  aerosolScape,
  installCanvas,
  player,
  renderApp,
  seededClient,
  weatherScape,
} from "./fakes/home";

vi.setConfig({ testTimeout: 15_000 });

async function audit(): Promise<string[]> {
  const result = await axe.run(document.documentElement, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
    },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map(
    (v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
}

beforeAll(() => {
  installCanvas();
  document.title = "Earth Jukebox";
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  player.reset();
  vi.clearAllMocks();
  resetExplore();
  resetAnnounce();
  useSession.setState(useSession.getInitialState(), true);
  useOverlay.setState({ open: null });
  usePrefs.setState(defaultPrefs(), true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLang("en");
});

const live = (): WeatherSoundscape =>
  ({
    ...weatherScape(),
    mode: "major",
    tempoBpm: 90,
    beatsPerBar: 4,
    composer: { requested: "algorithmic", used: "algorithmic", aiAvailable: false },
    warnings: ["Something the server said."],
    bars: [],
  }) as WeatherSoundscape;

describe.each<Lang>(["en", "uk"])("axe: Sound settings (%s)", (lang) => {
  const t = dictFor(lang);

  it.each<[Source, string]>([
    ["live", "set.tab.sound"],
    ["live", "set.tab.instruments"],
    ["live", "set.tab.more"],
    ["nasa", "set.tab.sound"],
    ["nasa", "set.tab.instruments"],
    ["nasa", "set.tab.frame"],
    ["nasa", "set.tab.more"],
  ])("no violations, source %s, tab %s", async (source, tab) => {
    setPref("lang", lang);
    const soundscape = source === "live" ? live() : { ...aerosolScape(), warnings: [] };
    useSession.setState({
      presetId: source === "live" ? "live-rain" : "nasa-four",
      source,
      booted: true,
      soundscape,
    });
    player.set({
      ready: true,
      playing: true,
      duration: soundscape.durationSec,
      position: 5,
      tag: "x",
    });
    const user = userEvent.setup();
    renderApp("/", seededClient(false));
    await user.click(screen.getByRole("button", { name: t["tune.open"] }));
    const dialog = await screen.findByRole("dialog", { name: t["tune.title"] });
    fireEvent.click(within(dialog).getByRole("tab", { name: t[tab] }));
    expect(within(dialog).getByRole("tab", { name: t[tab] })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await audit()).toEqual([]);
  });
});
