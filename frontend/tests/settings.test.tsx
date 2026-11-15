// Every setting lives under "Sound settings" (tabs) or in Accessibility.
// Each restored control: it exists, it is labelled, and it changes the right state or API argument.

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/audio/player-instance", async () => (await import("./fakes/player")).playerModule);
vi.mock("../src/audio/probe-voice", () => ({
  ProbeVoice: vi.fn(() => ({ play: vi.fn(), release: vi.fn() })),
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { useSession } from "../src/features/presets";
import { resetPresetEngine } from "../src/features/presets/engine";
import { resetExplore } from "../src/features/stage/explore";
import { resetAnnounce } from "../src/features/transport";
import { chordAt, laneLevels, LIVE_BINS } from "../src/features/tune/lanes";
import { pulseAt, VIBRATE_POLL_MS } from "../src/features/access/vibrate-with-sound";
import { useOverlay } from "../src/shared/lib/overlays";
import {
  aerosolApi,
  weatherApi,
  type Soundscape,
  type WeatherSettings,
  type WeatherSoundscape,
} from "../src/shared/api";
import { dictFor, setLang } from "../src/shared/i18n";
import {
  aerosolScape,
  installCanvas,
  player,
  renderApp,
  seededClient,
  weatherScape,
} from "./fakes/home";

const en = dictFor("en");
const uk = dictFor("uk");

beforeEach(() => {
  installCanvas();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  player.reset();
  vi.clearAllMocks();
  resetPresetEngine();
  resetExplore();
  resetAnnounce();
  useSession.setState(useSession.getInitialState(), true);
  useOverlay.setState({ open: null });
  usePrefs.setState(defaultPrefs(), true);
  setPref("lang", "en");
  setPref("lastPreset", "live-rain"); // the live settings, unless a test picks the archive
  vi.spyOn(weatherApi, "compose").mockImplementation(async (s: WeatherSettings) => ({
    ...weatherScape(),
    id: `w-${s.section}-${s.cycles}-${s.composer}`,
    cycles: s.cycles,
    amplitude: s.amplitude,
  }));
  vi.spyOn(aerosolApi, "compose").mockImplementation(async () => aerosolScape());
  vi.spyOn(aerosolApi, "bytes").mockImplementation(async () => new ArrayBuffer(8));
});

afterEach(() => {
  resetPresetEngine();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setLang("en");
});

/** A live piece with the fields the drawer reads that the shared fixture leaves out. */
function liveScape(over: Partial<WeatherSoundscape> = {}): WeatherSoundscape {
  return {
    ...weatherScape(),
    mode: "minor",
    tempoBpm: 76,
    beatsPerBar: 4,
    composer: { requested: "auto", used: "ai:claude-test", aiAvailable: true },
    warnings: ["AI score was repaired (2 fixes)."],
    bars: [
      { bar: 0, chord: "Am", level: 0.5, valueMean: 1, hemisphere: "north", accent: false },
      { bar: 1, chord: "F", level: 0.5, valueMean: 1, hemisphere: "north", accent: false },
    ],
    ...over,
  } as WeatherSoundscape;
}

function archiveScape(): Soundscape {
  return { ...aerosolScape(), warnings: [] };
}

async function openSettings({
  source = "live",
  ai = true,
}: { source?: "live" | "nasa"; ai?: boolean } = {}) {
  const user = userEvent.setup();
  if (source === "nasa")
    useSession.setState({ source: "nasa", presetId: "nasa-four", booted: true });
  const view = renderApp("/", seededClient(ai));
  await user.click(screen.getByRole("button", { name: en["tune.open"] }));
  const dialog = await screen.findByRole("dialog", { name: en["tune.title"] });
  return { user, dialog, view };
}

const tabNames = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("tab")
    .map((tab) => tab.textContent);
const openTab = (dialog: HTMLElement, key: string) =>
  fireEvent.click(within(dialog).getByRole("tab", { name: en[key] }));

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("one Settings entry", () => {
  it("the trigger is called Sound settings, in English and in Ukrainian", async () => {
    setPref("lang", "uk");
    const user = userEvent.setup();
    renderApp("/", seededClient());
    const button = screen.getByRole("button", { name: uk["tune.open"] });
    expect(uk["tune.open"]).toBe("Налаштування звуку");
    expect(en["tune.open"]).toBe("Sound settings");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(button);
    expect(await screen.findByRole("dialog", { name: uk["tune.title"] })).toBeInTheDocument();
  });

  it("live settings have Sound, Instruments and More; the archive adds Frame", async () => {
    const live = await openSettings();
    expect(tabNames(live.dialog)).toEqual([
      en["set.tab.sound"],
      en["set.tab.instruments"],
      en["set.tab.more"],
    ]);
    live.view.unmount();
    useOverlay.setState({ open: null });
    const nasa = await openSettings({ source: "nasa" });
    expect(tabNames(nasa.dialog)).toEqual([
      en["set.tab.sound"],
      en["set.tab.instruments"],
      en["set.tab.frame"],
      en["set.tab.more"],
    ]);
  });

  it("tabs move with the arrow keys, show one panel, and the chosen tab stays on the next opening", async () => {
    const { user, dialog } = await openSettings();
    const sound = within(dialog).getByRole("tab", { name: en["set.tab.sound"] });
    expect(sound).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getAllByRole("tabpanel")).toHaveLength(1);
    sound.focus();
    await user.keyboard("{ArrowRight}");
    const instruments = within(dialog).getByRole("tab", { name: en["set.tab.instruments"] });
    expect(instruments).toHaveAttribute("aria-selected", "true");
    expect(instruments).toHaveFocus();
    expect(within(dialog).getByRole("tabpanel")).toHaveAttribute("aria-labelledby", instruments.id);
    await user.keyboard("{End}");
    expect(within(dialog).getByRole("tab", { name: en["set.tab.more"] })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: en["tune.title"] })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: en["tune.open"] }));
    const again = await screen.findByRole("dialog", { name: en["tune.title"] });
    expect(within(again).getByRole("tab", { name: en["set.tab.more"] })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("the Accessibility panel links to Sound settings and opens them", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    const access = screen.getByRole("dialog", { name: en["access.title"] });
    await user.click(within(access).getByRole("button", { name: en["access.all"] }));
    const link = within(access).getByRole("button", { name: en["set.access.link"] });
    expect(link).toHaveAccessibleDescription(en["set.access.linkHint"]);
    await user.click(link);
    expect(await screen.findByRole("dialog", { name: en["tune.title"] })).toBeInTheDocument();
    expect(useOverlay.getState().open).toBe("tune");
    expect(screen.queryByRole("dialog", { name: en["access.title"] })).not.toBeInTheDocument();
  });

  it("the player bar is on every page, so /how links to Sound settings too, and the bar's button carries the id", async () => {
    const user = userEvent.setup();
    renderApp("/how", seededClient());
    const player = screen.getByRole("region", { name: en["transport.label"] });
    expect(within(player).getByRole("button", { name: en["tune.open"] })).toHaveAttribute(
      "id",
      "sound-settings",
    );
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    const access = screen.getByRole("dialog", { name: en["access.title"] });
    await user.click(within(access).getByRole("button", { name: en["access.all"] }));
    await user.click(within(access).getByRole("button", { name: en["set.access.link"] }));
    expect(await screen.findByRole("dialog", { name: en["tune.title"] })).toBeInTheDocument();
    expect(useOverlay.getState().open).toBe("tune");
  });
});

describe("Sound tab, live", () => {
  it("offers the Auto composer, sends it to the API and explains it", async () => {
    const { dialog } = await openSettings();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(weatherApi.compose).mockClear();
    const auto = within(dialog).getByRole("radio", { name: en["set.comp.auto"] });
    expect(auto).toHaveAccessibleDescription(new RegExp(en["set.comp.auto.desc"]));
    expect(within(dialog).getByText(en["set.comp.hint.algorithmic"])).toBeInTheDocument();
    fireEvent.click(auto);
    expect(auto).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByText(en["set.comp.hint.auto"])).toBeInTheDocument();
    await advance(400);
    expect(vi.mocked(weatherApi.compose).mock.calls[0]![0]).toMatchObject({ composer: "auto" });
  });

  it("each composer tile shows its own longer hint", async () => {
    const { dialog } = await openSettings();
    fireEvent.click(within(dialog).getByRole("radio", { name: en["w.comp.ai"] }));
    expect(within(dialog).getByText(en["set.comp.hint.ai"])).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: en["w.comp.aerosol"] }));
    expect(within(dialog).getByText(en["set.comp.hint.aerosol"])).toBeInTheDocument();
  });

  it.each([
    [true, "set.ai.on"],
    [false, "set.ai.off"],
  ] as const)("says whether the server has the AI composer (%s)", async (ai, key) => {
    const { dialog } = await openSettings({ ai });
    expect(within(dialog).getByText(en[key])).toBeInTheDocument();
  });

  it("the head diagram names each headphone cup, and shows both ears when stereo is off", async () => {
    const { dialog } = await openSettings();
    const ears = dialog.querySelector("[data-stereo]")!;
    expect(ears).toHaveAttribute("data-stereo", "true");
    expect(ears.textContent).toContain(en["w.left"]);
    expect(ears.textContent).toContain(en["w.right"]);
    expect(ears.querySelectorAll("p svg")).toHaveLength(2); // a left and a right headphone cup
    fireEvent.click(within(dialog).getByRole("switch", { name: new RegExp(en["tune.stereo"]) }));
    expect(usePrefs.getState().stereo).toBe(false);
    expect(dialog.querySelector("[data-stereo]")).toHaveAttribute("data-stereo", "false");
    expect(dialog.querySelector("[data-stereo]")!.textContent).toContain(en["set.ears.both"]);
    expect(within(dialog).getByText(en["set.ears.mono"])).toBeInTheDocument();
  });

  it("non-obvious settings carry a short explanation behind an info button", async () => {
    const { dialog } = await openSettings();
    for (const key of ["w.wave", "w.composer", "set.ears.title"]) {
      const name = en["set.tip.about"].replace("{name}", en[key]!);
      const tip = within(dialog).getByRole("button", { name });
      fireEvent.click(tip);
      expect(tip).toHaveAttribute("aria-expanded", "true");
      expect(tip).toHaveAccessibleDescription(
        en[
          key === "w.wave"
            ? "set.tip.wave"
            : key === "w.composer"
              ? "set.tip.composer"
              : "set.tip.stereo"
        ],
      );
      fireEvent.click(tip);
    }
  });
});

describe("Sound tab, archive", () => {
  it("sensitivity reads as words and its picture follows the slider", async () => {
    const { dialog } = await openSettings({ source: "nasa" });
    const sens = within(dialog).getByRole("slider", { name: en["tune.sens"] });
    expect(sens).toHaveAttribute("aria-valuetext", en["set.sens.2"]);
    const picture = () => dialog.querySelector("svg[data-level]")!;
    const heard = () => picture().querySelectorAll('rect[data-heard="true"]').length;
    const before = heard();
    fireEvent.change(sens, { target: { value: "4" } });
    expect(sens).toHaveAttribute("aria-valuetext", en["set.sens.4"]);
    expect(picture()).toHaveAttribute("data-level", "4");
    expect(heard()).toBeGreaterThan(before);
  });

  it("explains the chosen data to music mode", async () => {
    const { dialog } = await openSettings({ source: "nasa" });
    expect(within(dialog).getByText(en["mode.hint.harmony"])).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: en["mode.raw"] }));
    expect(within(dialog).getByText(en["mode.hint.raw"])).toBeInTheDocument();
  });

  it("Loop and Once set the repeat preference and the player, without starting sound", async () => {
    useSession.setState({ soundscape: archiveScape() });
    player.set({ ready: true, playing: false, duration: 64, tag: "nasa-four" });
    const { dialog } = await openSettings({ source: "nasa" });
    const loop = within(dialog).getByRole("radiogroup", { name: en["w.repeat"] });
    expect(within(loop).getByRole("radio", { name: en["set.loop"] })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(loop).getByRole("radio", { name: en["tune.repeat.off"] }));
    expect(usePrefs.getState().repeat).toBe("off");
    await waitFor(() => expect(player.setRepeat).toHaveBeenLastCalledWith("off"));
    fireEvent.click(within(loop).getByRole("radio", { name: en["set.loop"] }));
    expect(usePrefs.getState().repeat).toBe("all");
    await waitFor(() => expect(player.setRepeat).toHaveBeenLastCalledWith("one"));
    expect(player.play).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();
  });

  it("the Frame tab names the NASA frame in use", async () => {
    const { dialog } = await openSettings({ source: "nasa" });
    openTab(dialog, "set.tab.frame");
    expect(
      within(dialog).getByText(
        new RegExp(en["set.frame.nasa"].replace("{title}", "GEOS Aerosols")),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: en["tune.upload.choose"] }),
    ).toBeInTheDocument();
  });
});

describe("Instruments tab", () => {
  it("says what to do while there is no piece", async () => {
    const { dialog } = await openSettings();
    openTab(dialog, "set.tab.instruments");
    expect(within(dialog).getByText(en["set.inst.empty"])).toBeInTheDocument();
  });

  it("live: one switch per part with its instrument, a lane each, and the switch mutes", async () => {
    useSession.getState().show(liveScape());
    const { dialog } = await openSettings();
    openTab(dialog, "set.tab.instruments");
    const melody = within(dialog).getByRole("switch", { name: new RegExp(en["w.part.lead"]) });
    expect(melody).toHaveAttribute("aria-checked", "true");
    expect(melody).toHaveAccessibleDescription(en["w.inst.harp"]);
    expect(
      within(dialog).getByRole("switch", { name: new RegExp(en["w.part.bass"]) }),
    ).toBeInTheDocument();
    expect(dialog.querySelectorAll("svg[data-off]")).toHaveLength(2);
    fireEvent.click(melody);
    expect(useSession.getState().muted.lead).toBe(true);
    expect(player.setEnabled).toHaveBeenLastCalledWith("lead", false);
    expect(melody).toHaveAttribute("aria-checked", "false");
    expect(dialog.querySelector('svg[data-off="true"]')).not.toBeNull();
  });

  it("Solo plays only that voice and says so with aria-pressed; pressing it again brings all back", async () => {
    useSession.getState().show(liveScape());
    const { dialog } = await openSettings();
    openTab(dialog, "set.tab.instruments");
    const solo = within(dialog).getByRole("button", {
      name: `${en["set.solo"]} ${en["w.part.bass"]}`,
    });
    expect(solo).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(solo);
    expect(useSession.getState().muted).toMatchObject({ lead: true, bass: false });
    expect(solo).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(solo);
    expect(useSession.getState().muted).toMatchObject({ lead: false, bass: false });
  });

  it("archive: each layer shows its voice, its share of the map and where it is strongest", async () => {
    useSession.setState({ source: "nasa", presetId: "nasa-four", booted: true });
    useSession.getState().show(archiveScape());
    const { dialog } = await openSettings({ source: "nasa" });
    openTab(dialog, "set.tab.instruments");
    const dust = within(dialog).getByRole("switch", { name: /Dust/ });
    expect(dust).toHaveAccessibleDescription(/30%/);
    expect(within(dialog).getAllByRole("switch")).toHaveLength(3);
    expect(within(dialog).getByText(en["set.inst.drone"])).toBeInTheDocument();
    expect(dialog.querySelectorAll("svg[data-off] rect").length).toBe(12); // 3 layers x 4 steps
  });

  it("shows the chord under the playhead while playing", async () => {
    useSession.getState().show(liveScape());
    player.set({ ready: true, playing: true, position: 4, duration: 60, tag: "live-rain" });
    const { dialog } = await openSettings();
    openTab(dialog, "set.tab.instruments");
    expect(
      within(dialog).getByText(en["set.inst.chord"].replace("{chord}", "F")),
    ).toBeInTheDocument();
  });
});

describe("More tab", () => {
  it("live: who wrote the score, the piece, why, and the server's notes in the reader's language", async () => {
    useSession.getState().show(liveScape());
    const { dialog } = await openSettings();
    openTab(dialog, "set.tab.more");
    expect(
      within(dialog).getByText(
        en["set.more.by"].replace("{who}", en["set.more.who.ai"].replace("{model}", "claude-test")),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Rain\. Minor, 76/)).toBeInTheDocument();
    expect(within(dialog).getByText("Rain is heavy near the equator.")).toBeInTheDocument();
    expect(within(dialog).getByText(en["warn.aiRepaired"])).toBeInTheDocument();
    expect(within(dialog).getByText(en["set.ai.on"])).toBeInTheDocument();
  });

  it("archive: the mode and length, and 'no notes' when the server sent none", async () => {
    useSession.setState({ source: "nasa", presetId: "nasa-four", booted: true });
    useSession.getState().show(archiveScape());
    const { dialog } = await openSettings({ source: "nasa" });
    openTab(dialog, "set.tab.more");
    expect(
      within(dialog).getByText(
        en["set.more.archiveLine"].replace("{mode}", en["mode.harmony"]).replace("{sec}", "64"),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(en["set.more.noNotes"])).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: en["set.more.compose"] }),
    ).not.toBeInTheDocument();
  });

  it("Compose again asks the server anew each time and replaces the playing piece", async () => {
    useSession.setState({ presetId: "live-rain", source: "live", booted: true });
    useSession.getState().show(liveScape());
    player.set({ ready: true, playing: true, duration: 60, tag: "live-rain" });
    const { dialog } = await openSettings();
    openTab(dialog, "set.tab.more");
    const again = within(dialog).getByRole("button", { name: en["set.more.compose"] });
    expect(again).toHaveAccessibleDescription(en["set.more.composeHint"]);
    vi.mocked(weatherApi.compose).mockClear();
    fireEvent.click(again);
    await waitFor(() => expect(player.load).toHaveBeenCalledTimes(1));
    fireEvent.click(again);
    await waitFor(() => expect(player.load).toHaveBeenCalledTimes(2));
    expect(weatherApi.compose).toHaveBeenCalledTimes(2); // the cached answer was dropped both times
    expect(vi.mocked(weatherApi.compose).mock.calls[0]![0]).toMatchObject({
      section: "precipitation",
      cycles: 3,
      composer: "algorithmic",
    });
    expect((player.load.mock.calls[0] as unknown[])[2]).toBe("live-rain");
  });

  it("Compose again while paused only prepares the piece", async () => {
    useSession.setState({ presetId: "live-rain", source: "live", booted: true });
    useSession.getState().show(liveScape());
    player.set({ ready: true, playing: false, duration: 60, tag: "live-rain" });
    const { dialog } = await openSettings();
    openTab(dialog, "set.tab.more");
    vi.mocked(weatherApi.compose).mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: en["set.more.compose"] }));
    await waitFor(() => expect(weatherApi.compose).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(player.load).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(player.input).not.toHaveBeenCalled();
    expect(useSession.getState().staged).toBe(true);
  });
});

describe("Accessibility panel", () => {
  it("lists what the site works with, with the free CSV tools as links that open a new tab", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    const access = screen.getByRole("dialog", { name: en["access.title"] });
    const works = within(access).getByRole("heading", { name: en["set.works.title"] });
    const toggle = within(works).getByRole("button", { name: en["set.works.title"] });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(access).queryByText(en["set.works.sr"])).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const key of ["set.works.sr", "set.works.tactile", "set.works.captions"])
      expect(within(access).getByText(en[key])).toBeInTheDocument();
    const twotone = within(access).getByRole("link", {
      name: `${en["set.works.twotone"]} ${en["set.works.external"]}`,
    });
    expect(twotone).toHaveAttribute("href", "https://twotone.io");
    expect(twotone).toHaveAttribute("target", "_blank");
    expect(
      within(access).getByRole("link", { name: new RegExp(en["set.works.highcharts"]) }),
    ).toHaveAttribute("href", "https://sonification.highcharts.com");
  });
});

describe("lanes and chords (model)", () => {
  it("archive lanes are the layer strengths per step", () => {
    const s = archiveScape();
    expect(laneLevels(s)).toEqual({
      dust: [0.9, 0.9, 0.9, 0.9],
      sea_salt: [0.5, 0.5, 0.5, 0.5],
      sulfate: [0.2, 0.2, 0.2, 0.2],
    });
  });

  it("live lanes sum each part's notes per slice, and a part without notes follows the data level", () => {
    const s = liveScape({
      notes: [
        { part: "lead", time: 0, duration: 1, pitch: 70, velocity: 100 },
        { part: "lead", time: 30, duration: 1, pitch: 70, velocity: 50 },
      ],
    });
    const lanes = laneLevels(s);
    expect(lanes.lead).toHaveLength(LIVE_BINS);
    expect(lanes.lead![0]).toBe(1);
    expect(lanes.lead![LIVE_BINS / 2]).toBeCloseTo(0.5);
    expect(lanes.lead![10]).toBe(0);
    expect(lanes.bass!.every((v) => v === 0.5)).toBe(true); // path.level is 0.5 all along
  });

  it("the chord is the scan step's (archive) or the bar's (live), and none outside the piece", () => {
    expect(chordAt(archiveScape(), 20)).toBe("Dm9");
    expect(chordAt(archiveScape(), 64)).toBeUndefined();
    const s = liveScape(); // 76 bpm, 4 beats: a bar is about 3.16 s
    expect(chordAt(s, 1)).toBe("Am");
    expect(chordAt(s, 4)).toBe("F");
    expect(chordAt(s, -1)).toBeUndefined();
  });
});

describe("vibrate with the sound while playing", () => {
  it("pulses once per scan step, sized by the layers that sound, and only while the preference is on", async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    useSession.getState().show(archiveScape());
    player.set({ ready: true, playing: true, position: 1, duration: 64, tag: "nasa-four" });
    renderApp("/how", seededClient());
    await advance(VIBRATE_POLL_MS * 3);
    expect(vibrate).not.toHaveBeenCalled(); // off by default

    act(() => setPref("vibrate", true));
    await advance(VIBRATE_POLL_MS * 3);
    expect(vibrate).toHaveBeenCalledTimes(1); // same step: one pulse
    player.position = 20; // next step
    await advance(VIBRATE_POLL_MS);
    expect(vibrate).toHaveBeenCalledTimes(2);
    player.set({ playing: false });
    player.position = 40;
    await advance(VIBRATE_POLL_MS * 3);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("muted layers do not vibrate; live pieces pulse per bar with the data level", () => {
    expect(pulseAt(archiveScape(), 1, { dust: true })).toEqual({
      slot: 0,
      strengths: [0, 0.5, 0.2],
    });
    expect(pulseAt(archiveScape(), 70, {})).toBeNull();
    const s = liveScape(); // a bar is about 3.16 s
    expect(pulseAt(s, 1, {})).toEqual({ slot: 0, strengths: [0.5] });
    expect(pulseAt(s, 4, {})?.slot).toBe(1);
  });
});
