import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PRESET,
  PRESETS,
  presetById,
  PresetShelf,
  type PresetId,
} from "../src/features/presets";
import { COVERS, mixStart, shelfItems, useSession } from "../src/features/presets";
import { mixFor } from "../src/features/presets/session.store";
import { setLang } from "../src/shared/i18n";

afterEach(() => {
  setLang("en");
  useSession.setState(useSession.getInitialState(), true);
});

const LIVE = PRESETS.filter((p) => p.source === "live");
const NASA = PRESETS.filter((p) => p.source === "nasa");

function shelf(over: Partial<Parameters<typeof PresetShelf>[0]> = {}) {
  const onPick = vi.fn();
  const onMix = vi.fn();
  render(
    <PresetShelf
      source="live"
      selectedId="live-rain"
      playingId={null}
      progressFor={() => undefined}
      disabledFor={() => undefined}
      onPick={onPick}
      onMix={onMix}
      {...over}
    />,
  );
  return { onPick, onMix };
}

describe("PRESETS", () => {
  it("every preset has valid API ranges", () => {
    for (const p of PRESETS) {
      if (p.source === "live") {
        expect(p.settings.cycles).toBeGreaterThanOrEqual(0.5);
        expect(p.settings.cycles).toBeLessThanOrEqual(12);
        expect(p.settings.amplitude).toBeGreaterThanOrEqual(0.1);
        expect(p.settings.amplitude).toBeLessThanOrEqual(1);
        expect(p.settings.durationSec).toBeGreaterThanOrEqual(20);
        expect(p.settings.durationSec).toBeLessThanOrEqual(180);
      } else {
        expect(["raw", "scale", "harmony"]).toContain(p.settings.mode);
        expect(Number.isInteger(p.settings.sensitivity)).toBe(true);
        expect(p.settings.sensitivity).toBeGreaterThanOrEqual(0);
        expect(p.settings.sensitivity).toBeLessThanOrEqual(4);
        expect(p.settings.durationSec).toBeGreaterThanOrEqual(10);
        expect(p.settings.durationSec).toBeLessThanOrEqual(180);
        expect(p.settings.frameId).toBe("svs-5669");
      }
    }
  });

  it("keeps three archive records and five live ones, NASA first, nasa-four the default", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(PRESETS.map((p) => p.id)).toEqual([
      "nasa-four",
      "nasa-scale",
      "nasa-quick",
      "live-rain",
      "live-heat",
      "live-wind",
      "live-clouds",
      "live-ai",
    ] satisfies PresetId[]);
    expect(DEFAULT_PRESET).toBe("nasa-four");
    expect(presetById(DEFAULT_PRESET)?.source).toBe("nasa");
    expect(useSession.getInitialState()).toMatchObject({ presetId: "nasa-four", source: "nasa" });
    for (const gone of ["nasa-dust", "nasa-raw", "live-tour", "live-ear", "live-poles"]) {
      expect(presetById(gone)).toBeUndefined();
    }
    expect(presetById(null)).toBeUndefined();
  });

  it("matches the spec table", () => {
    const ai = presetById("live-ai");
    expect(ai?.source === "live" && ai.settings.composer).toBe("ai");
    const wind = presetById("live-wind");
    expect(wind?.source === "live" && wind.settings).toMatchObject({
      section: "wind",
      cycles: 4,
      amplitude: 0.7,
      durationSec: 45,
      composer: "algorithmic",
    });
    for (const p of LIVE) expect(p.source === "live" && p.repeat).toBe("one");
    expect(presetById("nasa-four")?.settings).toMatchObject({ mode: "harmony", durationSec: 64 });
    expect(presetById("nasa-scale")?.settings).toMatchObject({
      mode: "scale",
      sensitivity: 1,
      durationSec: 96,
    });
    expect(presetById("nasa-quick")?.settings).toMatchObject({ durationSec: 20, sensitivity: 3 });
    for (const p of NASA) {
      expect(p.source === "nasa" && p.bed).toBe(true);
    }
  });

  it("the quick tour starts with sea salt muted, the other records with every voice on", () => {
    const keys = ["black_carbon", "dust", "sea_salt", "sulfate", "bed"];
    const off = (id: PresetId) =>
      Object.entries(mixFor(presetById(id)!, keys))
        .filter(([, muted]) => muted)
        .map(([k]) => k);

    expect(off("nasa-quick")).toEqual(["sea_salt"]);
    expect(off("nasa-four")).toEqual([]);
    expect(off("nasa-scale")).toEqual([]);
  });

  it("every preset has its own cover, and the person's own mix has another one", () => {
    const covers = PRESETS.map((p) => p.cover);
    expect(new Set(covers).size).toBe(PRESETS.length);
    for (const c of covers) expect(COVERS[c]).toBeTypeOf("function");
    expect(covers).not.toContain("custom");
    expect(COVERS.custom).toBeTypeOf("function");
    expect(Object.keys(COVERS).sort()).toEqual([...covers, "custom"].sort());
  });

  it("has Ukrainian and English titles and subtitles for every preset", async () => {
    const { dictFor } = await import("../src/shared/i18n");
    for (const lang of ["en", "uk"] as const) {
      const d = dictFor(lang);
      for (const p of PRESETS) {
        expect(d[`preset.${p.id}.title`], `${lang} ${p.id} title`).toBeTruthy();
        expect(d[`preset.${p.id}.sub`], `${lang} ${p.id} sub`).toBeTruthy();
      }
    }
  });
});

describe("PresetShelf", () => {
  it("opens on the archive row by default: Create your mix first, then the NASA records", () => {
    useSession.setState(useSession.getInitialState(), true);
    shelf({ source: undefined, selectedId: DEFAULT_PRESET });
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    const group = screen.getByRole("radiogroup", { name: "Side A · NASA archive" });
    const names = within(group)
      .getAllByRole("radio")
      .map((r) => r.querySelector("[class*=title]")?.textContent);
    expect(names).toEqual(["Create your mix", "Four aerosols", "Gentle scale", "Quick tour"]);
    expect(screen.getByRole("radio", { name: /Four aerosols/ })).toBeChecked();
  });

  it("the live row: Create your mix, then the five live records, and nothing plays on load", () => {
    const { onPick, onMix } = shelf();
    const group = screen.getByRole("radiogroup", { name: "Side B · Live" });
    expect(screen.getByRole("heading", { level: 2, name: "Side B · Live" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Side A · NASA archive" })).toBeNull();
    const names = within(group)
      .getAllByRole("radio")
      .map((r) => r.querySelector("[class*=title]")?.textContent);
    expect(names).toEqual([
      "Create your mix",
      "Rain right now",
      "Heat and cold",
      "Wind map",
      "Clouds",
      "AI composes",
    ]);
    expect(screen.queryByText("Playing")).not.toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
    expect(onMix).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /Rain right now/ })).toBeChecked();
  });

  it("shows only archive records for the archive source, and keeps the live pick in the session", () => {
    shelf({ source: "nasa" });
    const group = screen.getByRole("radiogroup", { name: "Side A · NASA archive" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(NASA.length + 1);
    expect(screen.queryByRole("radio", { name: /Rain right now/ })).toBeNull();
    expect(radios.some((r) => (r as HTMLInputElement).checked)).toBe(false);
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radios[0]]);
    expect(screen.getAllByText("NASA")).toHaveLength(radios.length);
  });

  it("follows the session source when the prop is absent", () => {
    useSession.setState({ source: "live" });
    shelf({ source: undefined, selectedId: "live-heat" });
    expect(screen.getByRole("radio", { name: /Heat and cold/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Four aerosols/ })).toBeNull();
  });

  it("renders Ukrainian row headings and the mix record", () => {
    setLang("uk");
    shelf({ source: "nasa" });
    expect(screen.getByRole("heading", { name: "Сторона A · Архів NASA" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Створи свій мікс/ })).toBeInTheDocument();
    cleanup();
    shelf();
    expect(screen.getByRole("heading", { name: "Сторона B · Наживо" })).toBeInTheDocument();
  });

  it("Create your mix is first in both rows, with the faders cover and a dashed edge", () => {
    expect(shelfItems("live")[0]).toMatchObject({ id: "custom", custom: true, fresh: true });
    expect(shelfItems("nasa")[0]).toMatchObject({ id: "custom", custom: true, fresh: true });
    expect(shelfItems("nasa")[0]!.preset.id).toBe("nasa-four");

    shelf();
    const sleeve = screen.getByRole("radio", { name: /Create your mix/ });
    expect(sleeve).not.toBeChecked();
    expect(sleeve.closest("[data-custom]")).toHaveAttribute("data-custom", "true");
    // The faders cover has three knobs, the rain cover seven strokes.
    expect(sleeve.querySelectorAll("rect").length).toBeGreaterThan(3);
    expect(sleeve.querySelectorAll("line")).toHaveLength(0);
  });

  it("becomes 'Your mix' once that source has a mix, and is checked only in its own row", () => {
    const custom = { ...presetById("live-rain")!, repeat: "all" as const };
    expect(shelfItems("live", custom)[0]).toMatchObject({ preset: custom, fresh: false });
    expect(shelfItems("nasa", custom)[0]).toMatchObject({ fresh: true });

    shelf({ selectedId: "custom", custom, mixes: { live: custom } });
    expect(screen.getByRole("radio", { name: /Your mix/ })).toBeChecked();
    cleanup();

    // The live mix is selected, the archive row is on screen: its own record is not.
    shelf({ source: "nasa", selectedId: "custom", custom, mixes: { live: custom } });
    const create = screen.getByRole("radio", { name: /Create your mix/ });
    expect(create).not.toBeChecked();
    expect(create).toHaveAttribute("tabindex", "0");
  });

  it("a click or Enter on the mix record asks for that row's mix, not a preset", async () => {
    const user = userEvent.setup();
    const { onPick, onMix } = shelf({ source: "nasa" });
    await user.click(screen.getByRole("radio", { name: /Create your mix/ }));
    expect(onMix).toHaveBeenCalledWith("nasa");
    screen.getByRole("radio", { name: /Create your mix/ }).focus();
    await user.keyboard("{Enter}");
    expect(onMix).toHaveBeenCalledTimes(2);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("Enter on a focused sleeve calls onPick", async () => {
    const user = userEvent.setup();
    const { onPick } = shelf();
    screen.getByRole("radio", { name: /Wind map/ }).focus();
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("live-wind" satisfies PresetId);
  });

  it("ArrowRight and ArrowLeft wrap round the one row, the mix record included", async () => {
    const user = userEvent.setup();
    shelf();
    const a = within(screen.getByRole("radiogroup")).getAllByRole("radio");
    expect(a.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    a[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(a[1]).toHaveFocus();
    a[a.length - 1]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(a[0]).toHaveFocus();
    expect(a[0]).toHaveAccessibleName(/Create your mix/);
    await user.keyboard("{ArrowLeft}");
    expect(a[a.length - 1]).toHaveFocus();
  });

  it("disabled AI sleeve shows the reason and is not pickable", async () => {
    const user = userEvent.setup();
    const { onPick } = shelf({
      disabledFor: (id) => (id === "live-ai" ? "AI is unavailable right now" : undefined),
    });
    const ai = screen.getByRole("radio", { name: /AI composes/ });
    expect(screen.getByText("AI is unavailable right now")).toBeInTheDocument();
    expect(ai).toHaveAttribute("aria-disabled", "true");
    expect(ai).toHaveAccessibleDescription("AI is unavailable right now");
    await user.click(ai);
    expect(onPick).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: /Heat and cold/ }));
    expect(onPick).toHaveBeenCalledWith("live-heat");
  });

  it("only the AI sleeve carries the AI badge", () => {
    shelf();
    expect(screen.getAllByText("AI")).toHaveLength(1);
  });

  it("progress ring is announced as Preparing sound / Downloading", () => {
    shelf({ progressFor: (id) => (id === "live-rain" ? { phase: "compose" } : undefined) });
    expect(screen.getByRole("progressbar", { name: "Preparing sound" })).toBeInTheDocument();
    cleanup();
    shelf({
      source: "nasa",
      progressFor: (id) => (id === "nasa-scale" ? { phase: "download", pct: 40 } : undefined),
    });
    const dl = screen.getByRole("progressbar", { name: "Downloading" });
    expect(dl).toHaveAttribute("aria-valuenow", "40");
  });

  it("announces the playing sleeve and renders badges", () => {
    shelf({ source: "nasa", playingId: "nasa-quick" });
    expect(
      within(screen.getByRole("radio", { name: /Quick tour/ })).getByText("Playing"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    cleanup();
    shelf();
    expect(screen.getAllByText("Live")).toHaveLength(LIVE.length + 1);
  });
});

describe("mixStart", () => {
  it("goes on from the source's mix, else the selected record of that row, else the row's first", () => {
    useSession.setState({ presetId: "live-wind", source: "live", mixes: {} });
    expect(mixStart("live").id).toBe("live-wind");
    expect(mixStart("nasa").id).toBe("nasa-four");

    const mine = { ...presetById("nasa-scale")! };
    useSession.getState().setCustom(mine);
    expect(useSession.getState().mixes).toEqual({ nasa: mine });
    useSession.getState().pick("live-heat");
    expect(mixStart("nasa")).toBe(mine);
    expect(mixStart("live").id).toBe("live-heat");
  });
});
