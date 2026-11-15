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
import { previewArrays } from "../src/features/stage";
import { wavePoints } from "../src/features/tune";
import { resetExplore } from "../src/features/stage/explore";
import { resetAnnounce } from "../src/features/transport";
import { aerosolApi, weatherApi, type WeatherSettings } from "../src/shared/api";
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

beforeEach(() => {
  installCanvas(); // restoreAllMocks below undoes it after every test
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
  usePrefs.setState(defaultPrefs(), true);
  setPref("lang", "en");
  setPref("lastPreset", "live-rain"); // the live settings, unless a test picks the archive
  vi.spyOn(weatherApi, "compose").mockImplementation(async (s: WeatherSettings) => ({
    ...weatherScape(),
    id: `w-${s.section}-${s.cycles}-${s.amplitude}-${s.durationSec}-${s.composer}`,
    cycles: s.cycles,
    amplitude: s.amplitude,
  }));
  vi.spyOn(aerosolApi, "compose").mockImplementation(async () => aerosolScape());
  vi.spyOn(aerosolApi, "upload").mockImplementation(async () => ({
    ...aerosolScape(),
    id: "upload-1",
    frame: null,
  }));
  vi.spyOn(aerosolApi, "bytes").mockImplementation(async () => new ArrayBuffer(8));
});

afterEach(() => {
  resetPresetEngine();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setLang("en");
});

/** Opens the drawer on the home screen (the chunk loads lazily, so this waits for it). */
async function openTune(aiAvailable = true) {
  const user = userEvent.setup();
  const view = renderApp("/", seededClient(aiAvailable));
  await user.click(screen.getByRole("button", { name: en["tune.open"] }));
  const dialog = await screen.findByRole("dialog", { name: en["tune.title"] });
  return { user, dialog, view };
}

/** The drawer's own progress line (the sliders show their value in aria-hidden text, so this is the only status region). */
const syncLine = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('p[role="status"]')!;

const wave = (dialog: HTMLElement) => within(dialog).getByRole("img", { name: /Wave preview/ });

/** Moves a slider and releases it, like a drag. */
function drag(slider: HTMLElement, value: number) {
  fireEvent.change(slider, { target: { value: String(value) } });
  fireEvent.pointerUp(slider);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("wave preview", () => {
  it("draws the same wave as the map preview", () => {
    const s = weatherScape();
    const expected = previewArrays(s, { cycles: 3, amplitude: 0.6 })!;
    const mine = wavePoints(3, 0.6, s.path.lat.length);
    mine.forEach((p, k) => expect(p.lat).toBeCloseTo(expected.lat[k]!, 9));
  });

  it("changing density redraws the wave preview without a request", async () => {
    const { dialog } = await openTune();
    vi.mocked(weatherApi.compose).mockClear(); // the idle prefetch and the readings strip are not what is tested here
    vi.mocked(fetch).mockClear();
    const before = wave(dialog).querySelector("path")!.getAttribute("d");
    expect(wave(dialog)).toHaveAttribute(
      "aria-label",
      en["tune.wave.label"].replace("{cycles}", "3").replace("{amp}", "80"),
    );

    fireEvent.change(within(dialog).getByRole("slider", { name: en["tune.density"] }), {
      target: { value: "7.5" },
    });

    expect(wave(dialog).querySelector("path")!.getAttribute("d")).not.toBe(before);
    expect(wave(dialog)).toHaveAttribute("data-cycles", "7.5");
    expect(useSession.getState().preview).toEqual({ cycles: 7.5, amplitude: 0.8 });
    expect(weatherApi.compose).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("slider ranges match the API", async () => {
    const { dialog } = await openTune();
    const density = within(dialog).getByRole("slider", { name: en["tune.density"] });
    expect([
      density.getAttribute("min"),
      density.getAttribute("max"),
      density.getAttribute("step"),
    ]).toEqual(["0.5", "12", "0.5"]);
    const width = within(dialog).getByRole("slider", { name: en["tune.width"] });
    expect([width.getAttribute("min"), width.getAttribute("max")]).toEqual(["10", "100"]);
    fireEvent.click(within(dialog).getByRole("radio", { name: en["tune.other"] }));
    const length = within(dialog).getByRole("slider", { name: en["w.length"] });
    expect([length.getAttribute("min"), length.getAttribute("max")]).toEqual(["20", "180"]);
  });
});

describe("recomposing", () => {
  it("releasing a slider recomposes once after 400 ms and keeps the old sound playing", async () => {
    useSession.getState().pick("live-rain");
    useSession.getState().show(weatherScape());
    player.set({ ready: true, playing: true, tag: "live-rain", duration: 60 });
    const { dialog } = await openTune();
    const density = within(dialog).getByRole("slider", { name: en["tune.density"] });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(weatherApi.compose).mockClear(); // the idle prefetch of the selected preset is not a recompose
    drag(density, 5);
    drag(density, 6);
    await advance(399);
    expect(weatherApi.compose).not.toHaveBeenCalled();
    expect(syncLine(dialog)).toHaveTextContent(en["tune.syncing"]);

    await advance(1);
    expect(weatherApi.compose).toHaveBeenCalledTimes(1);
    expect(weatherApi.compose).toHaveBeenCalledWith(
      {
        section: "precipitation",
        cycles: 6,
        amplitude: 0.8,
        durationSec: 60,
        composer: "algorithmic",
      },
      expect.any(AbortSignal),
    );
    // The old sound kept going while the new one was prepared, and is replaced in place, never stopped.
    expect(player.stop).not.toHaveBeenCalled();
    expect(player.playing).toBe(true);
    await advance(0);
    expect(player.load).toHaveBeenCalledTimes(1);
    expect(player.load.mock.calls[0]).toMatchObject([
      expect.anything(),
      60,
      "custom",
      { restart: true },
    ]);
    expect(player.stop).not.toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({
      presetId: "custom",
      custom: { settings: { cycles: 6 } },
    });
    expect(useSession.getState().preview).toBeNull(); // the sound now has the drawn shape
    expect(syncLine(dialog)).toBeEmptyDOMElement();
  });

  // A timer is not a gesture, so a change while nothing plays prepares the mix and stays silent.
  it("on a first visit a change prepares the custom mix without sound or an AudioContext", async () => {
    const { dialog } = await openTune();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(weatherApi.compose).mockClear();
    drag(within(dialog).getByRole("slider", { name: en["tune.density"] }), 6);
    await advance(400);
    await advance(0);
    expect(weatherApi.compose).toHaveBeenCalledTimes(1);
    expect(useSession.getState()).toMatchObject({
      presetId: "custom",
      custom: { settings: { cycles: 6 } },
    });
    expect(player.input).not.toHaveBeenCalled(); // the AudioContext is created by input()
    expect(player.load).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("a change while paused stages the custom mix, and Play then starts it instead of resuming the old piece", async () => {
    useSession.setState({ presetId: "live-rain", source: "live", booted: true });
    useSession.getState().show(weatherScape());
    player.set({ ready: true, playing: false, tag: "live-rain", duration: 60 });
    const { dialog } = await openTune();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    drag(within(dialog).getByRole("slider", { name: en["tune.density"] }), 6);
    await advance(400);
    await advance(0);
    expect(player.load).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(useSession.getState().presetId).toBe("custom");

    fireEvent.click(screen.getByRole("button", { name: en["play.listen"] }));
    await advance(0);
    await advance(0);
    expect(player.load).toHaveBeenCalledTimes(1);
    expect((vi.mocked(player.load).mock.calls[0] as unknown[])[2]).toBe("custom");
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("play, tune, pause, tune again: Play loads the newest custom mix, not the one that was paused", async () => {
    useSession.setState({ presetId: "live-rain", source: "live", booted: true });
    useSession.getState().show(weatherScape());
    player.set({ ready: true, playing: true, tag: "live-rain", duration: 60 });
    const { dialog } = await openTune();
    const density = within(dialog).getByRole("slider", { name: en["tune.density"] });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    drag(density, 6); // playing: loads and replaces in place
    await advance(400);
    await advance(0);
    expect(vi.mocked(player.load).mock.calls).toHaveLength(1);
    player.set({ ready: true, tag: "custom" }); // the real player now holds the custom piece
    fireEvent.click(screen.getByRole("button", { name: en["play.listen"] })); // pause
    expect(player.pause).toHaveBeenCalledTimes(1);

    drag(density, 8); // paused: staged, same tag "custom" as what the player holds
    await advance(400);
    await advance(0);
    expect(vi.mocked(player.load).mock.calls).toHaveLength(1);
    expect(useSession.getState().staged).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: en["play.listen"] }));
    await advance(0);
    await advance(0);
    expect(vi.mocked(player.load).mock.calls).toHaveLength(2);
    expect(player.play).toHaveBeenCalled();
    expect(useSession.getState().soundscape?.id).toContain("-8-");
    expect(useSession.getState().staged).toBe(false);
  });

  it("a change while a click is still loading its sound does not turn that click silent", async () => {
    useSession.setState({ presetId: "live-rain", source: "live", booted: true });
    let release: (v: ReturnType<typeof weatherScape>) => void = () => undefined;
    const first = new Promise<ReturnType<typeof weatherScape>>((resolve) => {
      release = resolve;
    });
    vi.mocked(weatherApi.compose).mockImplementationOnce(() => first as never);
    const { dialog } = await openTune();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    fireEvent.click(screen.getByRole("button", { name: en["play.listen"] })); // starts the pick; its compose hangs
    await advance(0);
    expect(player.playing).toBe(false);
    drag(within(dialog).getByRole("slider", { name: en["tune.density"] }), 6);
    await advance(400);
    await advance(0);
    await advance(0);
    release(weatherScape()); // the superseded pick answers late and is ignored
    await advance(0);

    expect(vi.mocked(player.load).mock.calls).toHaveLength(1);
    expect((vi.mocked(player.load).mock.calls[0] as unknown[])[2]).toBe("custom");
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("putting a value back before the quiet time ends changes nothing and drops the drawn wave", async () => {
    const { dialog } = await openTune();
    const density = within(dialog).getByRole("slider", { name: en["tune.density"] });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    drag(density, 6);
    expect(useSession.getState().preview).not.toBeNull();
    drag(density, 3);
    await advance(1000);
    expect(weatherApi.compose).not.toHaveBeenCalled();
    expect(useSession.getState().presetId).toBe("live-rain");
    expect(useSession.getState().preview).toBeNull();
  });

  it("a failed custom compose drops the drawn wave", async () => {
    player.set({ ready: true, playing: true, tag: "live-rain", duration: 60 });
    const { dialog } = await openTune();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(weatherApi.compose).mockRejectedValue(new TypeError("offline"));
    drag(within(dialog).getByRole("slider", { name: en["tune.density"] }), 6);
    expect(useSession.getState().preview).toEqual({ cycles: 6, amplitude: 0.8 });
    await advance(400);
    await advance(0);
    expect(weatherApi.compose).toHaveBeenCalled();
    expect(useSession.getState().preview).toBeNull();
    expect(player.load).not.toHaveBeenCalled();
  });

  it("a custom live mix with repeat Once is composed with that repeat and stops at its end", async () => {
    player.set({ ready: true, playing: true, tag: "live-rain", duration: 60 });
    const { dialog } = await openTune();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(within(dialog).getByRole("radio", { name: en["tune.repeat.off"] }));
    await advance(400);
    await advance(0);
    expect(useSession.getState().custom).toMatchObject({ source: "live", repeat: "off" });
    expect(player.setRepeat).toHaveBeenLastCalledWith("off");
  });

  it("sends the chosen layer, length and composer", async () => {
    const { dialog } = await openTune();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(within(dialog).getByRole("radio", { name: en["w.sec.wind"] }));
    fireEvent.click(within(dialog).getByRole("radio", { name: en["w.comp.aerosol"] }));
    fireEvent.click(within(dialog).getByRole("radio", { name: `90 ${en["unit.sec"]}` }));
    await advance(400);
    expect(weatherApi.compose).toHaveBeenCalledTimes(1);
    expect(vi.mocked(weatherApi.compose).mock.calls[0]![0]).toEqual({
      section: "wind",
      cycles: 3,
      amplitude: 0.8,
      durationSec: 90,
      composer: "aerosol",
    });
  });

  it("stereo writes the preference and does not recompose", async () => {
    const { dialog } = await openTune();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    expect(usePrefs.getState().stereo).toBe(true);
    fireEvent.click(within(dialog).getByRole("switch", { name: new RegExp(en["tune.stereo"]) }));
    expect(usePrefs.getState().stereo).toBe(false);
    await advance(1000);
    expect(weatherApi.compose).not.toHaveBeenCalled();
    expect(useSession.getState().presetId).toBe("live-rain");
  });
});

describe("Your mix sleeve", () => {
  it("any change turns 'Create your mix' into the selected 'Your mix', and a regular sleeve takes over", async () => {
    const { dialog, view } = await openTune();
    expect(
      screen.queryByRole("radio", { name: new RegExp(en["preset.custom.title"]) }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.create.title"]) }),
    ).not.toBeChecked();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    drag(within(dialog).getByRole("slider", { name: en["tune.density"] }), 8);
    await advance(400);
    await advance(0);

    const sleeve = screen.getByRole("radio", { name: new RegExp(en["preset.custom.title"]) });
    expect(sleeve).toBeChecked();
    expect(sleeve.closest("[data-custom]")).toHaveAttribute("data-custom", "true");
    const rail = sleeve.closest('[role="radiogroup"]')!;
    expect(within(rail as HTMLElement).getAllByRole("radio")[0]).toBe(sleeve);
    expect(
      screen.getByRole("heading", { level: 2, name: en["preset.sideB"] }).closest("section"),
    ).toContainElement(sleeve);
    expect(useSession.getState().presetId).toBe("custom");

    fireEvent.click(screen.getByRole("radio", { name: new RegExp(en["preset.live-heat.title"]) }));
    expect(useSession.getState().presetId).toBe("live-heat");
    // The mix stays first in its row, ready to go back to.
    expect(
      screen.getByRole("radio", { name: new RegExp(en["preset.custom.title"]) }),
    ).not.toBeChecked();
    view.unmount();
  });

  it("the custom sleeve has a dashed 2 px border in the stylesheet", async () => {
    const css = (await import("node:fs")).readFileSync(
      "src/features/presets/presets.module.css",
      "utf-8",
    );
    expect(css).toMatch(/\[data-custom="true"\] \.cover \{\s*border-style: dashed;\s*\}/);
  });
});

describe("composer", () => {
  it("AI composer tile shows the slow badge and is disabled without a key", async () => {
    const { dialog } = await openTune(false);
    const ai = within(dialog).getByRole("radio", { name: en["w.comp.ai"] });
    expect(ai).toHaveAttribute("aria-disabled", "true");
    expect(ai).toHaveAccessibleDescription(
      new RegExp(`${en["tune.slow"]}.*${en["preset.aiUnavailable"]}`),
    );
    fireEvent.click(ai);
    expect(ai).toHaveAttribute("aria-checked", "false");
    expect(useSession.getState().custom).toBeUndefined();
  });

  it("AI composer tile is available when the server has a key", async () => {
    const { dialog } = await openTune(true);
    const ai = within(dialog).getByRole("radio", { name: en["w.comp.ai"] });
    expect(ai).not.toHaveAttribute("aria-disabled");
    expect(ai).toHaveAccessibleDescription(new RegExp(en["tune.slow"]));
  });
});

describe("archive settings", () => {
  async function openNasa() {
    useSession.setState({ source: "nasa", presetId: "nasa-four", booted: true });
    return openTune();
  }

  /** The own frame lives in the Frame tab of the archive settings. */
  async function openFrame() {
    const opened = await openNasa();
    fireEvent.click(within(opened.dialog).getByRole("tab", { name: en["set.tab.frame"] }));
    return opened;
  }

  it("shows the archive controls and composes a custom archive mix", async () => {
    const { dialog } = await openNasa();
    expect(
      within(dialog).queryByRole("slider", { name: en["tune.density"] }),
    ).not.toBeInTheDocument();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(within(dialog).getByRole("radio", { name: en["mode.raw"] }));
    drag(within(dialog).getByRole("slider", { name: en["tune.sens"] }), 4);
    await advance(400);
    expect(aerosolApi.compose).toHaveBeenCalledTimes(1);
    expect(aerosolApi.compose).toHaveBeenCalledWith(
      "svs-5669",
      { mode: "raw", durationSec: 64, sensitivity: 4 },
      expect.any(AbortSignal),
    );
    expect(useSession.getState().presetId).toBe("custom");
  });

  it("the drone switch follows the mix at once, without a new composition", async () => {
    useSession.getState().pick("nasa-four");
    useSession.getState().show(aerosolScape(), { bed: false });
    const { dialog } = await openNasa();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const drone = within(dialog).getByRole("switch", { name: new RegExp(en["tune.drone"]) });
    expect(drone).toHaveAttribute("aria-checked", "true");
    fireEvent.click(drone);
    expect(drone).toHaveAttribute("aria-checked", "false");
    expect(player.setEnabled).toHaveBeenLastCalledWith("bed", false);
    await advance(1000);
    expect(aerosolApi.compose).not.toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ presetId: "custom", custom: { bed: false } });
  });

  it("own frame upload warns that the image goes to the server", async () => {
    const { dialog } = await openFrame();
    expect(within(dialog).getByText(/sent to our server/i)).toBeInTheDocument();
  });

  it("uploads a PNG through the API and shows it as the custom mix", async () => {
    const { dialog } = await openFrame();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe("image/png,image/jpeg,image/webp");
    const file = new File(["x"], "smoke.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await advance(400);
    await advance(0);
    expect(aerosolApi.upload).toHaveBeenCalledWith(
      file,
      { mode: "harmony", durationSec: 64, sensitivity: 2 },
      expect.any(AbortSignal),
    );
    expect(aerosolApi.compose).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(en["tune.upload.using"].replace("{name}", "smoke.png")),
    ).toBeInTheDocument();
    expect(useSession.getState()).toMatchObject({
      presetId: "custom",
      soundscape: { id: "upload-1" },
    });
  });

  it("rejects a file over 25 MB or of another type without a request", async () => {
    const { dialog } = await openFrame();
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(en["upload.tooBig"]);
    fireEvent.change(input, {
      target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] },
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(en["tune.upload.type"]);
    expect(aerosolApi.upload).not.toHaveBeenCalled();
    expect(useSession.getState().custom).toBeUndefined();
  });
});

describe("drawer", () => {
  it("opens from the Tune button and closes with Escape, returning focus to the button", async () => {
    const { user } = await openTune();
    const button = screen.getByRole("button", { name: en["tune.open"] });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: en["tune.title"] })).not.toBeInTheDocument(),
    );
    expect(button).toHaveFocus();
  });
});
