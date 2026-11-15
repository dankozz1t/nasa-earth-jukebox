import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pick = vi.hoisted(() => vi.fn(async () => undefined));
const prefetchDefault = vi.hoisted(() => vi.fn(async () => undefined));
/** Extra fields of usePreset() for a test: error, errorId, tour. */
const status = vi.hoisted(() => ({ extra: {} as Record<string, unknown> }));

vi.mock("../src/audio/player-instance", async () => (await import("./fakes/player")).playerModule);
vi.mock("../src/audio/probe-voice", () => ({
  ProbeVoice: vi.fn(() => ({ play: vi.fn(), release: vi.fn() })),
}));
vi.mock("../src/features/presets/usePreset", async (orig) => ({
  ...(await orig<typeof import("../src/features/presets/usePreset")>()),
  usePreset: () => ({
    pick,
    prefetchCompose: vi.fn(),
    prefetchDefault,
    progress: {},
    ...status.extra,
  }),
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { presetById, useSession } from "../src/features/presets";
import { resetAnnounce } from "../src/features/transport";
import { resetExplore } from "../src/features/stage/explore";
import { dictFor, setLang } from "../src/shared/i18n";
import { installCanvas, player, renderApp, seededClient, weatherScape } from "./fakes/home";

const en = dictFor("en");
const uk = dictFor("uk");

/** Every element a person can operate, wherever it is. */
const INTERACTIVE =
  'a[href], button, input, select, textarea, [role="slider"], [role="radio"], [role="switch"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';

beforeAll(installCanvas);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  player.reset();
  vi.clearAllMocks();
  status.extra = {};
  resetExplore();
  resetAnnounce();
  useSession.setState(useSession.getInitialState(), true);
  usePrefs.setState(defaultPrefs(), true);
  setPref("lang", "en");
});

/** A visitor who last played a live record: the shelf opens on the live row. */
function lastOnLive() {
  setPref("lastPreset", "live-rain");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setLang("en");
});

describe("home screen", () => {
  it("mounts the source switch, the shelf row of the chosen source, the stage, the player and the now line", () => {
    renderApp("/", seededClient());
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: en["source.label"] })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: en["preset.sideA"] })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: en["preset.sideB"] })).toBeNull();
    expect(screen.getByRole("region", { name: en["stage.label"] })).toBeInTheDocument();
    expect(document.getElementById("map-explorer")).toHaveAttribute("role", "slider");
    expect(screen.getByRole("region", { name: en["transport.label"] })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: en["captions.label"] })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: en["now.label"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en["play.listen"] })).toBeInTheDocument();
  });

  // The skip links come first, then the Accessibility button, then the logo.
  it("first two Tab stops are the skip link and the Accessibility button", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    const skips = within(screen.getByRole("navigation", { name: en["skip.label"] })).getAllByRole(
      "link",
    );
    expect(skips.map((a) => a.textContent)).toEqual([
      en["skip.toShelf"],
      en["skip.toPlayer"],
      en["skip.toMap"],
    ]);

    await user.tab();
    expect(document.activeElement).toBe(skips[0]);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(skips[2]);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: en["access.title"] }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: en["app.title"] }));
  });

  it("skip links move focus to the records, the player and the map explorer", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("link", { name: en["skip.toShelf"] }));
    expect(document.activeElement).toBe(document.getElementById("shelf"));
    await user.click(screen.getByRole("link", { name: en["skip.toPlayer"] }));
    expect(document.activeElement).toBe(document.getElementById("player"));
    await user.click(screen.getByRole("link", { name: en["skip.toMap"] }));
    expect(document.activeElement).toBe(document.getElementById("map-explorer"));
  });

  // Every radio of a radiogroup counts on its own; skip links count separately (hidden until focused).
  // Sleeves, mix chips, the map explorer and the readings strip count as one stop each, so they are left out.
  // The 16 includes the theme toggle, the Team link and the player bar's "Instruments" toggle (below 1024 px).
  it("home has at most 16 interactive controls outside sleeves, chips and explorer", () => {
    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderApp("/", seededClient());
    const skipNav = screen.getByRole("navigation", { name: en["skip.label"] });
    const all = [...new Set(document.body.querySelectorAll<HTMLElement>(INTERACTIVE))];
    const counted = all.filter(
      (el) =>
        !el.closest("#shelf") &&
        !el.closest(`[aria-label="${en["mix.label"]}"]`) &&
        !el.closest("[data-explorer]") &&
        !el.closest(`[aria-label="${en["live.readings"]}"]`) && // one roving data stop, like the shelf
        !el.closest("dialog:not([open])") &&
        !el.parentElement?.querySelector(':scope > [role="tooltip"]') && // "i" notes are help, not controls
        !skipNav.contains(el),
    );
    expect(screen.getAllByRole("button", { name: /Melody|Bass/ }).length).toBeGreaterThan(0); // the chips are there
    expect(within(skipNav).getAllByRole("link")).toHaveLength(3);
    // The Tune button is one of the counted controls, and its closed drawer adds none.
    expect(counted).toContain(screen.getByRole("button", { name: en["tune.open"] }));
    expect(screen.queryByRole("dialog", { name: en["tune.title"] })).not.toBeInTheDocument();
    // Save is one more counted control: a single menu button, its items are not in the DOM while closed.
    expect(counted).toContain(screen.getByRole("button", { name: en["save.open"] }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(counted).toContain(screen.getByRole("button", { name: en["theme.dark"] }));
    expect(counted).toContain(screen.getByRole("link", { name: en["nav.team"] }));
    expect(counted).toContain(screen.getByRole("button", { name: en["transport.stop"] })); // the bar's Stop
    expect(counted.length).toBeLessThanOrEqual(16);
  });

  it("header switches the language with a UA/EN radio pair", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    const group = screen.getByRole("radiogroup", { name: en["lang.label"] });
    expect(within(group).getByRole("radio", { name: "EN" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(group).getByRole("radio", { name: "UA" }));
    expect(usePrefs.getState().lang).toBe("uk");
    expect(document.documentElement.lang).toBe("uk");
    expect(screen.getByRole("link", { name: uk["nav.how"] })).toHaveAttribute("href", "/how");
  });

  it("switching UA/EN during playback does not reload the player", async () => {
    const user = userEvent.setup();
    useSession.setState({ presetId: "live-rain", source: "live", soundscape: weatherScape() });
    player.set({ ready: true, playing: true, duration: 60, position: 5, tag: "live-rain" });
    renderApp("/", seededClient());
    const captions = screen.getByRole("region", { name: en["captions.label"] });
    expect(within(captions).getByText(new RegExp(en["w.part.lead"]))).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "UA" }));

    const ukCaptions = screen.getByRole("region", { name: uk["captions.label"] });
    expect(within(ukCaptions).getByText(new RegExp(uk["w.part.lead"]))).toBeInTheDocument();
    expect(player.load).not.toHaveBeenCalled();
    expect(player.stop).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.playing).toBe(true);
    expect(pick).not.toHaveBeenCalled();
  });

  it("selects the last played preset on a visit without ?p=, and does not play it", () => {
    setPref("lastPreset", "nasa-four");
    renderApp("/", seededClient());
    expect(useSession.getState()).toMatchObject({ presetId: "nasa-four", source: "nasa" });
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.nasa-four.title"]) }),
    ).toHaveAttribute("aria-checked", "true");
    expect(pick).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("a shared ?p= selection survives / -> /how -> /", async () => {
    const user = userEvent.setup();
    renderApp("/?p=live-wind", seededClient());
    expect(useSession.getState().presetId).toBe("live-wind");
    await user.click(screen.getByRole("link", { name: en["nav.how"] }));
    await screen.findByRole("heading", { level: 1, name: en["how2.title"] });
    await user.click(screen.getByRole("link", { name: en["app.title"] }));
    expect(useSession.getState()).toMatchObject({ presetId: "live-wind", source: "live" });
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.live-wind.title"]) }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("a later selection survives / -> /how -> /, the last played preset is not re-applied", async () => {
    const user = userEvent.setup();
    setPref("lastPreset", "nasa-four");
    renderApp("/", seededClient());
    expect(useSession.getState().presetId).toBe("nasa-four");
    act(() => useSession.getState().pick("live-heat"));
    await user.click(screen.getByRole("link", { name: en["nav.how"] }));
    await screen.findByRole("heading", { level: 1, name: en["how2.title"] });
    await user.click(screen.getByRole("link", { name: en["app.title"] }));
    expect(useSession.getState()).toMatchObject({ presetId: "live-heat", source: "live" });
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.live-heat.title"]) }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("opens on the NASA archive with Four aerosols selected on a first visit", () => {
    renderApp("/", seededClient());
    expect(useSession.getState()).toMatchObject({ presetId: "nasa-four", source: "nasa" });
    expect(screen.getByRole("radio", { name: en["source.nasa"] })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("heading", { level: 2, name: en["preset.sideA"] })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.nasa-four.title"]) }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("a shared link to a record that no longer exists opens on the default", () => {
    renderApp("/?p=live-tour", seededClient());
    expect(useSession.getState()).toMatchObject({ presetId: "nasa-four", source: "nasa" });
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.nasa-four.title"]) }),
    ).toHaveAttribute("aria-checked", "true");
    expect(pick).not.toHaveBeenCalled();
  });

  it("prefetches the selected preset once when idle and never plays", async () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderApp("/", seededClient());
    expect(prefetchDefault).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(prefetchDefault).toHaveBeenCalledTimes(1);
    rerender(<></>);
    unmount();
    expect(player.load).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("a click on a sleeve picks it", async () => {
    const user = userEvent.setup();
    lastOnLive();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("radio", { name: new RegExp(en["preset.live-heat.title"]) }));
    expect(pick).toHaveBeenCalledWith("live-heat");
  });

  it("shows AI composes disabled with its reason when the AI is unavailable", () => {
    lastOnLive();
    renderApp("/", seededClient(false));
    const ai = screen.getByRole("radio", { name: new RegExp(en["preset.live-ai.title"]) });
    expect(ai).toHaveAttribute("aria-disabled", "true");
    expect(ai).toHaveAccessibleDescription(en["preset.aiUnavailable"]);
  });

  it("a failed pick shows why under its sleeve and Try again on the stage", async () => {
    status.extra = { error: en["preset.error.offline"], errorId: "live-rain" };
    lastOnLive();
    renderApp("/", seededClient());
    const rain = screen.getByRole("radio", { name: new RegExp(en["preset.live-rain.title"]) });
    expect(rain).toHaveAccessibleDescription(en["preset.error.offline"]);
    const stage = screen.getByRole("region", { name: en["stage.label"] });
    expect(within(stage).getByText(en["preset.error.offline"])).toBeInTheDocument();
    await userEvent.click(within(stage).getByRole("button", { name: en["preset.error.retry"] }));
    expect(pick).toHaveBeenCalledWith("live-rain");
  });

  it("live weather that fails to load shows an error with Try again, not 'Loading' forever", async () => {
    const client = seededClient();
    client.removeQueries({ queryKey: ["weather", "grid"] });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    lastOnLive();
    renderApp("/", client);
    const stage = screen.getByRole("region", { name: en["stage.label"] });
    expect(await within(stage).findByText(en["stage.gridError"])).toBeInTheDocument();
    expect(within(stage).queryByText(en["w.loading.data"])).toBeNull();
    const calls = fetchMock.mock.calls.length;
    await userEvent.click(within(stage).getByRole("button", { name: en["preset.error.retry"] }));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it("a click on the sleeve that already plays does not start it over", async () => {
    useSession.setState({ presetId: "live-rain", source: "live", soundscape: weatherScape() });
    player.set({ ready: true, playing: true, duration: 60, tag: "live-rain" });
    lastOnLive();
    renderApp("/", seededClient());
    await userEvent.click(
      screen.getByRole("radio", { name: new RegExp(en["preset.live-rain.title"]) }),
    );
    expect(pick).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("radio", { name: new RegExp(en["preset.live-heat.title"]) }),
    );
    expect(pick).toHaveBeenCalledWith("live-heat");
  });

  it("a live mix that tours every layer shows how many of the four are ready", () => {
    const mix = { ...presetById("live-rain")!, repeat: "all" as const };
    status.extra = { tour: { ready: 2, total: 4, id: "custom" } };
    useSession.setState({ booted: true });
    useSession.getState().setCustom(mix);
    renderApp("/", seededClient());
    const tour = screen.getByRole("radio", { name: new RegExp(en["preset.custom.title"]) });
    expect(screen.getByText("2 of 4 layers ready")).toBeVisible();
    expect(tour).toHaveAccessibleDescription("2 of 4 layers ready");
  });

  it("a remembered 'AI composes' while the AI is unavailable selects the default preset instead", () => {
    setPref("lastPreset", "live-ai");
    renderApp("/", seededClient(false));
    expect(useSession.getState().presetId).toBe("live-rain");
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.live-rain.title"]) }),
    ).toHaveAttribute("aria-checked", "true");
    expect(pick).not.toHaveBeenCalled();
  });

  it("Create your mix selects the row's own mix, plays it and opens Sound settings", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    const create = screen.getByRole("radio", { name: new RegExp(en["preset.create.title"]) });
    await user.click(create);
    expect(useSession.getState()).toMatchObject({ presetId: "custom", source: "nasa" });
    expect(useSession.getState().custom?.settings).toEqual(presetById("nasa-four")!.settings);
    expect(pick).toHaveBeenCalledWith("custom");
    expect(await screen.findByRole("dialog", { name: en["tune.title"] })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    const mine = screen.getByRole("radio", { name: new RegExp(en["preset.custom.title"]) });
    expect(mine).toHaveAttribute("aria-checked", "true");
    expect(mine).toHaveFocus();
  });

  it("Create your mix keeps the record it grows from playing, without a restart", async () => {
    const user = userEvent.setup();
    player.set({ ready: true, playing: true, duration: 64, tag: "nasa-four" });
    renderApp("/", seededClient());
    await user.click(screen.getByRole("radio", { name: new RegExp(en["preset.create.title"]) }));
    expect(useSession.getState().presetId).toBe("custom");
    expect(pick).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: en["tune.title"] })).toBeInTheDocument();
  });

  it("each row keeps its own mix: the live mix stays when the archive gets one", async () => {
    const user = userEvent.setup();
    const liveMix = {
      ...presetById("live-wind")!,
      settings: { ...presetById("live-wind")!.settings },
    };
    useSession.setState({ booted: true });
    useSession.getState().setCustom(liveMix as never);
    useSession.getState().setSource("nasa");
    renderApp("/", seededClient());
    await user.click(screen.getByRole("radio", { name: new RegExp(en["preset.create.title"]) }));
    expect(useSession.getState().custom?.source).toBe("nasa");
    expect(useSession.getState().mixes.live).toBe(liveMix);
    expect(pick).toHaveBeenCalledWith("custom");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("radio", { name: en["source.live"] }));
    const back = screen.getByRole("radio", { name: new RegExp(en["preset.custom.title"]) });
    await user.click(back);
    expect(useSession.getState().custom).toBe(liveMix);
  });

  it("the Accessibility panel describes the whole map once a soundscape exists", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    let dialog = screen.getByRole("dialog", { name: en["access.title"] });
    expect(within(dialog).queryByRole("button", { name: en["access.describeMap"] })).toBeNull();
    await user.keyboard("{Escape}");

    act(() => useSession.setState({ source: "live", soundscape: weatherScape() }));
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    dialog = screen.getByRole("dialog", { name: en["access.title"] });
    await user.click(within(dialog).getByRole("button", { name: en["access.describeMap"] }));
    expect(within(dialog).getByText("Rain. Rain is heavy near the equator.")).toHaveAttribute(
      "role",
      "status",
    );
  });
});
