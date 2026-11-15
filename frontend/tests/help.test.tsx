import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pick = vi.hoisted(() => vi.fn(async () => undefined));

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

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { HOTKEYS, listedCombos, LAYER_KEYS } from "../src/features/help";
import { adjacentPreset, presetById, useSession } from "../src/features/presets";
import { resetAnnounce } from "../src/features/transport";
import { resetExplore } from "../src/features/stage/explore";
import { queryKeys, type WeatherGrid } from "../src/shared/api";
import { dictFor, setLang } from "../src/shared/i18n";
import { formatDateTimeUtc, formatTimeLocal } from "../src/shared/lib/format";
import { registeredHotkeys } from "../src/shared/lib/useHotkeys";
import {
  aerosolScape,
  frame,
  grid,
  installCanvas,
  narrator,
  player,
  renderApp,
  seededClient,
  weatherScape,
} from "./fakes/home";

const en = dictFor("en");
const uk = dictFor("uk");

/** A physical key press on the page body, as a keyboard with any layout sends it. */
function press(code: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { code, key: code.replace(/^Key|^Digit/, ""), ...init });
}

const polite = () => document.querySelector("[aria-live=polite]")!.textContent;
const sleeve = (title: string) => screen.getByRole("radio", { name: new RegExp(title) });

beforeAll(installCanvas);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  player.reset();
  vi.clearAllMocks();
  narrator.speak.mockClear();
  resetExplore();
  resetAnnounce();
  useSession.setState(useSession.getInitialState(), true);
  useSession.setState({ booted: true });
  usePrefs.setState(defaultPrefs(), true);
  setPref("lang", "en");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setLang("en");
});

describe("shortcuts dialog", () => {
  it("? opens it, focus goes inside, Esc closes it and returns focus to where it was", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    const rain = sleeve(en["preset.nasa-four.title"]);
    rain.focus();
    expect(screen.queryByRole("dialog", { name: en["help.title"] })).not.toBeInTheDocument();
    press("Slash", { shiftKey: true, key: "?" });
    const dialog = screen.getByRole("dialog", { name: en["help.title"] });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: en["help.title"] })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(rain);
  });

  it("opens on a Ukrainian layout too (the physical key next to the right Shift)", () => {
    renderApp("/", seededClient());
    press("Slash", { shiftKey: true, key: "," });
    expect(screen.getByRole("dialog", { name: en["help.title"] })).toBeInTheDocument();
  });

  it("opens from the Accessibility panel, which closes, and Esc returns to the Accessibility button", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    const accessButton = screen.getByRole("button", { name: en["access.title"] });
    await user.click(accessButton);
    const access = screen.getByRole("dialog", { name: en["access.title"] });
    await user.click(within(access).getByRole("button", { name: en["help.title"] }));
    expect(screen.queryByRole("dialog", { name: en["access.title"] })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: en["help.title"] })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: en["help.title"] })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(accessButton);
  });

  it("shows nothing in the page while closed, and its text in Ukrainian", () => {
    setPref("lang", "uk");
    renderApp("/", seededClient());
    expect(screen.queryByText(uk["key.space"])).not.toBeInTheDocument();
    press("Slash", { shiftKey: true, key: "," });
    const dialog = screen.getByRole("dialog", { name: uk["help.title"] });
    expect(within(dialog).getByText(uk["key.live"])).toBeInTheDocument();
    expect(within(dialog).getByText(uk["key.cap.space"])).toBeInTheDocument();
  });

  it("works on the /how page too, and says that Space plays only on the home page", async () => {
    renderApp("/how", seededClient());
    await screen.findByRole("heading", { level: 1 });
    press("Slash", { shiftKey: true, key: "?" });
    const dialog = screen.getByRole("dialog", { name: en["help.title"] });
    const space = within(dialog).getByText(en["key.space"]);
    expect(space).toHaveTextContent("Play / pause (home page only)");
    expect(uk["key.space"]).toBe("Грати / пауза (лише на головній)");
  });

  it("dialog lists every registered hotkey", () => {
    useSession.setState({ source: "live", soundscape: weatherScape() }); // two layers: keys 1 and 2
    renderApp("/", seededClient());
    press("Slash", { shiftKey: true, key: "?" });
    const dialog = screen.getByRole("dialog", { name: en["help.title"] });

    // What the dialog shows is exactly the shared definition: a row per entry, its caps and its words.
    const rows = [...dialog.querySelectorAll<HTMLElement>("[data-hotkey]")];
    expect(rows.map((r) => r.dataset.hotkey)).toEqual(HOTKEYS.map((h) => h.id));
    for (const [i, def] of HOTKEYS.entries()) {
      const caps = [...rows[i]!.querySelectorAll("kbd")].map((k) => k.textContent);
      expect(caps).toEqual(def.caps.map((c) => (c.startsWith("@") ? en[c.slice(1)] : c)));
      expect(within(rows[i]!).getByText(en[def.label])).toBeInTheDocument();
    }

    // What the page registers is exactly what the definition lists. The mix keys follow the layers on the stage.
    const registered = registeredHotkeys();
    expect(new Set(registered).size).toBe(registered.length); // no key claimed twice
    const listed = listedCombos();
    const layerKeys = new Set<string>(
      [...LAYER_KEYS, ...LAYER_KEYS.map((k) => `Shift+${k}`)].map((c) => c.toLowerCase()),
    );
    expect(registered.filter((c) => !layerKeys.has(c)).sort()).toEqual(
      listed.filter((c) => !layerKeys.has(c)).sort(),
    );
    const mixKeys = registered.filter((c) => layerKeys.has(c)).sort();
    expect(mixKeys).toEqual(["1", "2", "shift+1", "shift+2"]);
    for (const c of mixKeys) expect(listed).toContain(c);
  });

  it("a Ukrainian dictionary has every new key, without semicolons or dashes", () => {
    const keys = [
      "key.live",
      "key.shelf",
      "key.preset",
      "key.access",
      "key.cap.space",
      "key.cap.shift",
      "help.note",
      "live.where",
      "live.whereUpdating",
      "live.whereNoNext",
      "live.whereSnapshot",
      "live.whereNone",
      "live.whereOwn",
      "announce.preset",
      ...HOTKEYS.map((h) => h.label),
    ];
    for (const k of keys) {
      expect(en[k], k).toBeTruthy();
      expect(uk[k], k).toBeTruthy();
      expect(uk[k], k).not.toMatch(/[;—–]/);
    }
  });
});

describe("P: focus the selected record", () => {
  it("lands on the selected record of the shown side", () => {
    useSession.setState({ source: "live", presetId: "live-wind" });
    renderApp("/", seededClient());
    press("KeyP");
    expect(document.activeElement).toBe(sleeve(en["preset.live-wind.title"]));
  });

  it("lands on the first record of the shown side when nothing there is selected", () => {
    useSession.setState({ source: "nasa", presetId: "live-wind" }); // the selection is on the other side
    renderApp("/", seededClient());
    press("KeyP");
    expect(document.activeElement).toBe(sleeve(en["preset.create.title"]));
  });

  it("works with the Ukrainian layout (the key is the physical P)", () => {
    renderApp("/", seededClient());
    fireEvent.keyDown(document.body, { code: "KeyP", key: "з" });
    expect(document.activeElement).toBe(sleeve(en["preset.nasa-four.title"]));
  });
});

describe("[ and ]: along the shelf", () => {
  it("with nothing playing they only select", () => {
    renderApp("/", seededClient());
    press("BracketRight");
    expect(pick).toHaveBeenLastCalledWith("nasa-scale", { play: false });
    expect(polite()).toBe(en["announce.preset"].replace("{title}", en["preset.nasa-scale.title"]));
  });

  it("while playing the new record plays", () => {
    player.set({ ready: true, playing: true });
    useSession.setState({ source: "live", presetId: "live-wind" });
    renderApp("/", seededClient());
    press("BracketRight");
    expect(pick).toHaveBeenLastCalledWith("live-clouds", { play: true });
    press("BracketLeft"); // pick is a stub here, the selection stays on live-wind
    expect(pick).toHaveBeenLastCalledWith("live-heat", { play: true });
  });

  it("walks back from the first record to the last of the same side, and forward round again", () => {
    renderApp("/", seededClient());
    press("BracketLeft"); // Create your mix opens a drawer, so the keys pass over it
    expect(pick).toHaveBeenLastCalledWith("nasa-quick", { play: false });
    useSession.setState({ presetId: "nasa-quick" });
    press("BracketRight");
    expect(pick).toHaveBeenLastCalledWith("nasa-four", { play: false });
  });

  it("stays inside the archive row and starts from its ends when the selection is on the other side", () => {
    useSession.setState({ source: "nasa", presetId: "live-wind" });
    renderApp("/", seededClient());
    press("BracketRight");
    expect(pick).toHaveBeenLastCalledWith("nasa-four", { play: false });
    useSession.setState({ presetId: "nasa-quick" }); // the last of the row wraps to its first
    press("BracketRight");
    expect(pick).toHaveBeenLastCalledWith("nasa-four", { play: false });
  });

  it("passes over a record that cannot be picked (AI unavailable)", () => {
    useSession.setState({ source: "live", presetId: "live-clouds" });
    renderApp("/", seededClient(false));
    press("BracketRight");
    expect(pick).toHaveBeenLastCalledWith("live-rain", { play: false });
  });

  it("includes the person's own mix at the start of its row", () => {
    const draft = presetById("live-rain")!;
    useSession.setState({
      source: "live",
      presetId: "custom",
      custom: draft,
      mixes: { live: draft },
    });
    renderApp("/", seededClient());
    press("BracketRight"); // from "Your mix" the next one is the first preset
    expect(pick).toHaveBeenLastCalledWith("live-rain", { play: false });
    press("BracketLeft"); // and back from it wraps to the last
    expect(pick).toHaveBeenLastCalledWith("live-ai", { play: false });
  });

  it("adjacentPreset: one record in the row gives nothing to move to", () => {
    expect(adjacentPreset(["nasa-four"], "nasa-four", 1)).toBeNull();
    expect(
      adjacentPreset(["live-rain", "live-ai"], "live-rain", 1, (id) => id === "live-ai"),
    ).toBeNull();
  });
});

describe("A: Accessibility", () => {
  it("opens the drawer, and it is ignored while a panel is open", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    press("KeyA");
    expect(screen.getByRole("dialog", { name: en["access.title"] })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: en["access.title"] })).not.toBeInTheDocument();
    press("Slash", { shiftKey: true, key: "?" });
    press("KeyA");
    expect(screen.queryByRole("dialog", { name: en["access.title"] })).not.toBeInTheDocument();
  });

  it("stays out of a text field", () => {
    renderApp("/", seededClient());
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    fireEvent.keyDown(field, { code: "KeyA", key: "a" });
    field.remove();
    expect(screen.queryByRole("dialog", { name: en["access.title"] })).not.toBeInTheDocument();
  });
});

describe("L: where is live now", () => {
  beforeEach(() => {
    useSession.setState({ source: "live", presetId: "live-rain" });
  });

  const withNext = (nextUpdateAt: string | undefined, over: Partial<WeatherGrid> = {}) => {
    const client = seededClient();
    client.setQueryData(queryKeys.weather.grid, { ...grid, nextUpdateAt, ...over });
    return client;
  };

  it("speaks and shows the reading time and the minutes left", () => {
    vi.setSystemTime(new Date("2026-11-14T12:08:00Z"));
    renderApp("/", withNext("2026-11-14T12:15:00Z"));
    press("KeyL");
    const time = formatTimeLocal(grid.observedAt, "en");
    const line = en["live.where"].replace("{time}", time).replace("{minutes}", "7");
    expect(polite()).toBe(line);
    expect(narrator.speak).toHaveBeenLastCalledWith(line);
  });

  it("speaks it in Ukrainian", () => {
    vi.setSystemTime(new Date("2026-11-14T12:08:00Z"));
    setPref("lang", "uk");
    renderApp("/", withNext("2026-11-14T12:15:00Z"));
    press("KeyL");
    const time = formatTimeLocal(grid.observedAt, "uk");
    expect(polite()).toBe(uk["live.where"].replace("{time}", time).replace("{minutes}", "7"));
  });

  it("says updating when the next reading is due, and says less when there is no time", () => {
    vi.setSystemTime(new Date("2026-11-14T12:20:00Z"));
    const time = formatTimeLocal(grid.observedAt, "en");
    const { unmount } = renderApp("/", withNext("2026-11-14T12:15:00Z"));
    press("KeyL");
    expect(polite()).toBe(en["live.whereUpdating"].replace("{time}", time));
    unmount();
    renderApp("/", withNext(undefined));
    press("KeyL");
    expect(polite()).toBe(en["live.whereNoNext"].replace("{time}", time));
  });

  it("a snapshot is not called live", () => {
    renderApp("/", withNext("2026-11-14T12:15:00Z", { isSnapshot: true }));
    press("KeyL");
    expect(polite()).toBe(
      en["live.whereSnapshot"].replace("{time}", formatTimeLocal(grid.observedAt, "en")),
    );
  });

  it("on the archive it speaks the static frame line", () => {
    useSession.setState({ source: "nasa", presetId: "nasa-four", soundscape: aerosolScape() });
    renderApp("/", seededClient());
    press("KeyL");
    expect(polite()).toBe(
      en["stage.staticFrame"].replace("{date}", formatDateTimeUtc(frame.timestampUtc, "en")),
    );
    expect(narrator.speak).toHaveBeenLastCalledWith(polite());
  });

  it("is quiet about nothing: no key press leaves an empty line", () => {
    const client = seededClient();
    client.removeQueries({ queryKey: queryKeys.weather.grid });
    renderApp("/", client);
    act(() => press("KeyL"));
    expect(polite()).toBe(en["live.whereNone"]);
  });
});
