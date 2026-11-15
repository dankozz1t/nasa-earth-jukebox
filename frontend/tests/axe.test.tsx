// axe-core audit of the app (WCAG 2.2 A/AA) in both sources and languages, with a soundscape in the bar
// and with the Accessibility panel open. jsdom has no layout, so contrast is checked in tests/tokens.test.ts.

import { act, screen, within } from "@testing-library/react";
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
import { resetAnnounce, say } from "../src/features/transport";
import { resetExplore } from "../src/features/stage/explore";
import { CONTENT } from "../src/pages/how/science/content";
import { dictFor, setLang, type Lang } from "../src/shared/i18n";
import {
  aerosolScape,
  installCanvas,
  player,
  renderApp,
  seededClient,
  weatherScape,
} from "./fakes/home";

// The first, cold axe run can pass 5 s when the whole suite runs in parallel.
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
  // index.html carries <title>; the jsdom document the app is rendered into does not.
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
  usePrefs.setState(defaultPrefs(), true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLang("en");
});

describe.each<Lang>(["en", "uk"])("axe on / (%s)", (lang) => {
  const t = dictFor(lang);

  describe.each<Source>(["live", "nasa"])("source %s", (source) => {
    beforeEach(() => {
      setPref("lang", lang);
      const soundscape = source === "live" ? weatherScape() : aerosolScape();
      useSession.setState({
        presetId: source === "live" ? "live-rain" : "nasa-four",
        source,
        soundscape,
      });
      player.set({
        ready: true,
        playing: true,
        duration: soundscape.durationSec,
        position: 5,
        tag: "x",
      });
    });

    it("axe: no WCAG 2.2 A/AA violations with the player sounding", async () => {
      renderApp("/", seededClient());
      act(() => say(t["announce.allOn"]));
      expect(document.documentElement.lang).toBe(lang);
      expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0); // chips and captions are on screen
      expect(await audit()).toEqual([]);
    });

    it("axe: no WCAG 2.2 A/AA violations with the Accessibility panel open", async () => {
      const user = userEvent.setup();
      renderApp("/", seededClient(false));
      await user.click(screen.getByRole("button", { name: t["access.title"] }));
      expect(screen.getByRole("dialog", { name: t["access.title"] })).toBeInTheDocument();
      expect(await audit()).toEqual([]);
      // And with both closed sections open: every setting and the "works with" list.
      await user.click(screen.getByRole("button", { name: t["access.all"] }));
      await user.click(screen.getByRole("button", { name: t["set.works.title"] }));
      expect(screen.getAllByRole("switch").length).toBeGreaterThan(5);
      expect(await audit()).toEqual([]);
    });
  });

  it.each<Source>(["live", "nasa"])(
    "axe: no violations with the Tune drawer open, source %s",
    async (source) => {
      setPref("lang", lang);
      useSession.setState({
        presetId: source === "live" ? "live-rain" : "nasa-four",
        source,
        booted: true,
      });
      const user = userEvent.setup();
      renderApp("/", seededClient(false));
      await user.click(screen.getByRole("button", { name: t["tune.open"] }));
      const dialog = await screen.findByRole("dialog", { name: t["tune.title"] });
      expect(dialog.querySelectorAll('[role="radio"]').length).toBeGreaterThan(5);
      expect(await audit()).toEqual([]);
    },
  );

  it("axe: no violations on a first visit, nothing playing", async () => {
    setPref("lang", lang);
    renderApp("/", seededClient());
    expect(await audit()).toEqual([]);
  });

  it("axe: no violations with the shortcuts dialog open", async () => {
    setPref("lang", lang);
    const user = userEvent.setup();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("button", { name: t["access.title"] }));
    await user.click(screen.getByRole("button", { name: t["help.title"] }));
    expect(screen.getByRole("dialog", { name: t["help.title"] })).toBeInTheDocument();
    expect(await audit()).toEqual([]);
  });

  it("axe: no violations on /how", async () => {
    setPref("lang", lang);
    renderApp("/how", seededClient());
    await screen.findByRole("heading", { level: 1, name: t["how2.title"] });
    expect(await audit()).toEqual([]);
  });

  // The engineering view: C4 and sequence diagrams, about 30 tables, English inside a page in `lang`.
  it("axe: no violations on /how?view=tech", async () => {
    setPref("lang", lang);
    renderApp("/how?view=tech", seededClient());
    await screen.findByRole("navigation", { name: "Contents" });
    expect(screen.getByRole("tab", { name: t["how3.tab.tech"] })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await audit()).toEqual([]);
  });

  it("axe: no violations on /how?view=science", async () => {
    setPref("lang", lang);
    renderApp("/how?view=science", seededClient());
    await screen.findByRole("heading", { level: 2, name: CONTENT[lang].sections[0]!.title });
    expect(screen.getByRole("tab", { name: t["how3.tab.science"] })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await audit()).toEqual([]);
  });

  it("axe: no violations on /team", async () => {
    setPref("lang", lang);
    renderApp("/team", seededClient());
    await screen.findByRole("heading", { level: 1, name: t["team.title"] });
    expect(await audit()).toEqual([]);
  });
});

// Contrast is the tokens test's job; this checks the structure with data-theme="dark", the bar and its popover open.
describe("axe in the dark theme", () => {
  const t = dictFor("en");
  beforeEach(() => {
    setPref("lang", "en");
    setPref("theme", "dark");
  });

  it("axe: / with the player sounding and the Instruments popover open", async () => {
    const user = userEvent.setup();
    useSession.setState({ presetId: "live-rain", source: "live", soundscape: weatherScape() });
    player.set({ ready: true, playing: true, duration: 60, position: 5, tag: "live-rain" });
    renderApp("/", seededClient());
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("button", { name: t["player.tools"] }));
    expect(await audit()).toEqual([]);
  });

  // The How page's engineering view (7 diagrams) and the Team page, in both languages, with the bar on screen.
  it.each<Lang>(["en", "uk"])(
    "axe: /how with its diagrams and the player bar (%s)",
    async (lang) => {
      const tl = dictFor(lang);
      setPref("lang", lang);
      renderApp("/how#tech", seededClient());
      await screen.findByRole("heading", { level: 1, name: tl["how2.title"] });
      await screen.findByRole("navigation", { name: "Contents" });
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(screen.getByRole("main").querySelectorAll('svg[role="img"]')).toHaveLength(7);
      expect(screen.getByRole("region", { name: tl["transport.label"] })).toBeInTheDocument();
      expect(await audit()).toEqual([]);
    },
  );

  it.each<Lang>(["en", "uk"])("axe: /how for scientists in the dark theme (%s)", async (lang) => {
    setPref("lang", lang);
    renderApp("/how#science-music", seededClient());
    await screen.findByRole("heading", { level: 2, name: CONTENT[lang].sections[2]!.title });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(await audit()).toEqual([]);
  });

  it.each<Lang>(["en", "uk"])("axe: /team with its cards and the player bar (%s)", async (lang) => {
    const tl = dictFor(lang);
    setPref("lang", lang);
    renderApp("/team", seededClient());
    await screen.findByRole("heading", { level: 1, name: tl["team.title"] });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("region", { name: tl["transport.label"] })).toBeInTheDocument();
    expect(await audit()).toEqual([]);
  });

  it.each<Source>(["live", "nasa"])(
    "axe: Sound settings open from the bar, source %s",
    async (source) => {
      useSession.setState({
        presetId: source === "live" ? "live-rain" : "nasa-four",
        source,
        booted: true,
      });
      const user = userEvent.setup();
      renderApp("/", seededClient(false));
      const bar = screen.getByRole("region", { name: t["transport.label"] });
      await user.click(within(bar).getByRole("button", { name: t["tune.open"] }));
      expect(await screen.findByRole("dialog", { name: t["tune.title"] })).toBeInTheDocument();
      expect(await audit()).toEqual([]);
    },
  );

  it("axe: the Accessibility panel with its theme switch", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("button", { name: t["access.title"] }));
    await user.click(screen.getByRole("button", { name: t["access.all"] }));
    expect(screen.getByRole("switch", { name: t["theme.dark"] })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await audit()).toEqual([]);
  });
});
