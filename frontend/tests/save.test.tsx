import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const loadMap = vi.hoisted(() => vi.fn(async () => new Uint8Array(32)));

vi.mock("../src/audio/player-instance", async () => (await import("./fakes/player")).playerModule);
vi.mock("../src/audio/probe-voice", () => ({
  ProbeVoice: vi.fn(() => ({ play: vi.fn(), release: vi.fn() })),
}));
vi.mock("../src/features/stage/useStageImages", async (orig) => ({
  ...(await orig<typeof import("../src/features/stage/useStageImages")>()),
  loadClassMap: loadMap,
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { useSession } from "../src/features/presets";
import { SaveMenu } from "../src/features/save";
import { ToastProvider } from "../src/shared/ui";
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

beforeAll(installCanvas);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
  player.reset();
  loadMap.mockClear();
  useSession.setState(useSession.getInitialState(), true);
  usePrefs.setState(defaultPrefs(), true);
  setPref("lang", "en");
});

let clicks: HTMLAnchorElement[] = [];
let blobs: Blob[] = [];
const realClick = HTMLAnchorElement.prototype.click;

afterEach(() => {
  vi.unstubAllGlobals();
  HTMLAnchorElement.prototype.click = realClick;
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
  setLang("en");
});

/** jsdom has neither blob URLs nor downloads: record what would have been saved. */
function recordDownloads() {
  clicks = [];
  blobs = [];
  Object.assign(URL, {
    createObjectURL: (b: Blob) => (blobs.push(b), "blob:x"),
    revokeObjectURL: () => undefined,
  });
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicks.push(this);
  };
}

function renderMenu() {
  return render(
    <ToastProvider>
      <SaveMenu />
    </ToastProvider>,
  );
}

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: en["save.open"] }));
  return user;
}

const names = () => screen.getAllByRole("menuitem").map((el) => el.textContent);

describe("SaveMenu", () => {
  it("archive menu lists 6 formats, live menu lists 2", async () => {
    useSession.setState({ source: "nasa", soundscape: aerosolScape() });
    const { unmount } = renderMenu();
    await open();
    expect(names()).toEqual([
      en["dl.wav"],
      en["dl.midi"],
      en["dl.vtt"],
      en["dl.txt"],
      en["dl.csv"],
      en["dl.svg"],
    ]);
    unmount();

    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderMenu();
    await open();
    expect(names()).toEqual([en["w.dl.wav"], en["w.dl.score"]]);
  });

  it("WAV and MIDI links carry the current mix selection", async () => {
    useSession.setState({
      source: "nasa",
      soundscape: aerosolScape(),
      muted: { sea_salt: true, bed: true },
    });
    renderMenu();
    await open();
    const wav = screen.getByRole("menuitem", { name: en["dl.wav"] });
    expect(wav).toHaveAttribute("href", "/api/a1/mix.wav?layers=dust%2Csulfate&bed=false");
    expect(wav).toHaveAttribute("download", "earth-jukebox-harmony-64s.wav");
    expect(screen.getByRole("menuitem", { name: en["dl.midi"] })).toHaveAttribute(
      "href",
      "/api/a1/mix.mid?layers=dust%2Csulfate&bed=false",
    );
  });

  it("the links follow a mix change while the menu is mounted", async () => {
    useSession.setState({ source: "nasa", soundscape: aerosolScape() });
    renderMenu();
    act(() => useSession.setState({ muted: { dust: true } }));
    await open();
    expect(screen.getByRole("menuitem", { name: en["dl.wav"] })).toHaveAttribute(
      "href",
      "/api/a1/mix.wav?layers=sea_salt%2Csulfate&bed=true",
    );
  });

  it("live WAV is stereo and whole by default, mono and partial by the settings", async () => {
    useSession.setState({
      source: "live",
      soundscape: { ...weatherScape(), artifacts: { stems: {}, mix: "/api/w1/mix.wav" } },
    });
    renderMenu();
    await open();
    expect(screen.getByRole("menuitem", { name: en["w.dl.wav"] })).toHaveAttribute(
      "href",
      "/api/w1/mix.wav",
    );
    expect(screen.getByRole("menuitem", { name: en["w.dl.wav"] })).toHaveAttribute(
      "download",
      "earth-jukebox-weather-precipitation-2026-11-14T12.wav",
    );

    act(() => {
      setPref("stereo", false);
      useSession.setState({ muted: { bass: true } });
    });
    const mono = screen.getByRole("menuitem", { name: en["save.wavMono"] });
    expect(mono).toHaveAttribute("href", "/api/w1/mix.wav?parts=lead&mono=true");
  });

  it("is disabled with a reason until a piece of the shown source is on the stage", () => {
    renderMenu();
    const button = screen.getByRole("button", { name: en["save.open"] });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(en["save.none"]);

    // a live piece is sounding, but the archive is on show: nothing to save from it
    act(() => useSession.setState({ source: "nasa", soundscape: weatherScape() }));
    expect(button).toBeDisabled();
    act(() => useSession.setState({ soundscape: aerosolScape() }));
    expect(button).toBeEnabled();
  });

  it("downloads captions, transcript, CSV and the score as files named after the piece", async () => {
    recordDownloads();
    useSession.setState({ source: "nasa", soundscape: aerosolScape() });
    const { unmount } = renderMenu();
    for (const key of ["dl.vtt", "dl.txt", "dl.csv"] as const) {
      const user = await open();
      await user.click(screen.getByRole("menuitem", { name: en[key] }));
    }
    expect(clicks.map((a) => a.download)).toEqual([
      "earth-jukebox-harmony-64s.en.vtt",
      "earth-jukebox-harmony-64s.en.txt",
      "earth-jukebox-harmony-64s.csv",
    ]);
    expect(await blobs[0]!.text()).toMatch(/^WEBVTT/);
    expect(await blobs[2]!.text()).toMatch(/^step,time_s,longitude,chord/);
    unmount();

    useSession.setState({ source: "live", soundscape: weatherScape() });
    renderMenu();
    const user = await open();
    await user.click(screen.getByRole("menuitem", { name: en["w.dl.score"] }));
    expect(clicks.at(-1)!.download).toBe("earth-jukebox-score-precipitation.json");
    expect(JSON.parse(await blobs.at(-1)!.text())).toMatchObject({
      title: "Rain",
      wave: expect.any(Object),
    });
  });

  it("names the files in the page language", async () => {
    recordDownloads();
    setLang("uk");
    useSession.setState({ source: "nasa", soundscape: aerosolScape() });
    renderMenu();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: uk["save.open"] }));
    await user.click(screen.getByRole("menuitem", { name: uk["dl.vtt"] }));
    expect(clicks[0]!.download).toBe("earth-jukebox-harmony-64s.uk.vtt");
  });

  it("builds the tactile map from the class map of the soundscape", async () => {
    recordDownloads();
    const scape = aerosolScape();
    useSession.setState({ source: "nasa", soundscape: scape });
    renderMenu();
    const user = await open();
    await user.click(screen.getByRole("menuitem", { name: en["dl.svg"] }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(loadMap).toHaveBeenCalledWith(scape);
    expect(await blobs[0]!.text()).toMatch(/^<svg/);
  });

  it("says so when the tactile map cannot be prepared", async () => {
    loadMap.mockRejectedValueOnce(new Error("no image"));
    useSession.setState({ source: "nasa", soundscape: aerosolScape() });
    renderMenu();
    const user = await open();
    await user.click(screen.getByRole("menuitem", { name: en["dl.svg"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en["save.error"]);
  });
});

describe("class map for exports", () => {
  it("is decoded once per soundscape", async () => {
    let loads = 0;
    class FakeImage {
      onload: (() => void) | null = null;
      set src(_: string) {
        loads++;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const scape = aerosolScape();
    const { loadClassMap: realLoadClassMap } = await vi.importActual<
      typeof import("../src/features/stage/useStageImages")
    >("../src/features/stage/useStageImages");
    const first = await realLoadClassMap(scape);
    expect(await realLoadClassMap(scape)).toBe(first);
    expect(loads).toBe(1);
  });
});

describe("Accessibility drawer", () => {
  it("sends the person to the Save menu", async () => {
    const user = userEvent.setup();
    useSession.setState({
      presetId: "live-rain",
      source: "live",
      soundscape: weatherScape(),
      booted: true,
    });
    renderApp("/", seededClient());
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    const drawer = screen.getByRole("dialog", { name: en["access.title"] });
    await user.click(within(drawer).getByRole("button", { name: en["access.all"] }));
    await user.click(within(drawer).getByRole("button", { name: en["access.openSave"] }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: en["save.open"] })).toHaveFocus(),
    );
  });

  it("offers no shortcut while there is nothing to save", async () => {
    const user = userEvent.setup();
    renderApp("/", seededClient());
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    const drawer = screen.getByRole("dialog", { name: en["access.title"] });
    await user.click(within(drawer).getByRole("button", { name: en["access.all"] }));
    expect(
      within(drawer).queryByRole("button", { name: en["access.openSave"] }),
    ).not.toBeInTheDocument();
  });
});
