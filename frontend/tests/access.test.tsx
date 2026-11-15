import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../src/app/providers";
import { AccessButton, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { t } from "../src/shared/i18n";

type Store = typeof import("../src/features/access/prefs.store");

/** Fresh module graph so the store re-reads localStorage and matchMedia. */
async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import("../src/features/access/prefs.store");
}

function mockMedia(matching: string[]) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: matching.includes(q),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prefs store", () => {
  it("migrates v1 prefs and drops simple", async () => {
    localStorage.setItem(
      "earth-jukebox:prefs:v1",
      JSON.stringify({ simple: true, textScale: 1.25, bogus: 1, volume: "loud" }),
    );
    const { usePrefs } = await freshStore();
    const p = usePrefs.getState() as unknown as Record<string, unknown>;
    expect(p.textScale).toBe(1.25);
    expect(p.volume).toBe(0.7);
    expect("simple" in p).toBe(false);
    expect("bogus" in p).toBe(false);
  });

  it("defaults follow OS media queries on first visit", async () => {
    mockMedia(["(prefers-reduced-motion: reduce)", "(prefers-contrast: more)"]);
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState().reduceMotion).toBe(true);
    expect(usePrefs.getState().highContrast).toBe(true);
  });

  it("first visit is English even when the browser language is Ukrainian", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("uk-UA");
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState().lang).toBe("en");
  });

  it("a saved Ukrainian choice still wins", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    localStorage.setItem(
      "earth-jukebox:prefs:v2",
      JSON.stringify({ state: { lang: "uk" }, version: 0 }),
    );
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState().lang).toBe("uk");
  });

  it("saved choice beats the OS default", async () => {
    mockMedia(["(prefers-reduced-motion: reduce)"]);
    localStorage.setItem(
      "earth-jukebox:prefs:v2",
      JSON.stringify({ state: { reduceMotion: false }, version: 0 }),
    );
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState().reduceMotion).toBe(false);
  });

  it("captions on and speech off by default", async () => {
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState().captions).toBe(true);
    expect(usePrefs.getState().speech).toBe(false);
    expect(usePrefs.getState().volume).toBe(0.7);
    expect(usePrefs.getState().repeat).toBe("all");
  });

  it("works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { usePrefs, setPref } = await freshStore();
    expect(usePrefs.getState().captions).toBe(true);
    expect(() => setPref("colorSafe", true)).not.toThrow();
    expect(usePrefs.getState().colorSafe).toBe(true);
  });

  it("persists changes under the v2 key", async () => {
    const { setPref } = await freshStore();
    setPref("textScale", 1.5);
    expect(JSON.parse(localStorage.getItem("earth-jukebox:prefs:v2")!).state.textScale).toBe(1.5);
  });

  it("remembers a known last preset and drops an unknown or removed one", async () => {
    localStorage.setItem(
      "earth-jukebox:prefs:v2",
      JSON.stringify({ state: { lastPreset: "nasa-scale" }, version: 1 }),
    );
    let store = await freshStore();
    expect(store.usePrefs.getState().lastPreset).toBe("nasa-scale");

    for (const gone of ["live-bogus", "nasa-raw", "live-tour"]) {
      localStorage.setItem(
        "earth-jukebox:prefs:v2",
        JSON.stringify({ state: { lastPreset: gone }, version: 1 }),
      );
      store = await freshStore();
      expect(store.usePrefs.getState().lastPreset).toBe("nasa-four");
    }
  });

  it("a record saved before the archive came first gives way to the new default once", async () => {
    localStorage.setItem(
      "earth-jukebox:prefs:v2",
      JSON.stringify({ state: { lastPreset: "live-rain", textScale: 1.5 }, version: 0 }),
    );
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState()).toMatchObject({ lastPreset: "nasa-four", textScale: 1.5 });
    expect(JSON.parse(localStorage.getItem("earth-jukebox:prefs:v2")!).version).toBe(1);
  });

  it("resetToSystem keeps the last played preset", async () => {
    const { usePrefs, setPref, resetToSystem } = await freshStore();
    setPref("lastPreset", "nasa-four");
    resetToSystem();
    expect(usePrefs.getState().lastPreset).toBe("nasa-four");
  });

  it("resetToSystem restores defaults but keeps the language", async () => {
    const { usePrefs, setPref, resetToSystem } = await freshStore();
    setPref("lang", "uk");
    setPref("textScale", 1.5);
    resetToSystem();
    expect(usePrefs.getState().textScale).toBe(1);
    expect(usePrefs.getState().lang).toBe("uk");
  });
});

describe("AccessDrawer", () => {
  beforeEach(() => usePrefs.setState(defaultPrefs()));

  function setup() {
    return render(
      <Providers>
        <AccessButton />
      </Providers>,
    );
  }

  async function openAll(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    await user.click(screen.getByRole("button", { name: t("access.all") }));
  }

  it("opens from the header button, traps focus, Esc returns focus", async () => {
    const user = userEvent.setup();
    setup();
    const button = screen.getByRole("button", { name: t("access.title") });
    await user.click(button);
    const dialog = screen.getByRole("dialog", { name: t("access.title") });
    expect(dialog).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 20; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(button);
  });

  it("vibration row explains when navigator.vibrate is missing", async () => {
    const user = userEvent.setup();
    setup();
    await openAll(user);
    expect(screen.getByText(t("access.vibrateNo"))).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: t("access.vibrate") })).toBeNull();
  });

  it("shows a vibration switch when supported", async () => {
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { vibrate: () => true }));
    const user = userEvent.setup();
    setup();
    await openAll(user);
    expect(screen.getByRole("switch", { name: t("access.vibrate") })).toBeInTheDocument();
  });

  it("toggling high contrast sets the html class immediately", async () => {
    const user = userEvent.setup();
    setup();
    await openAll(user);
    const sw = screen.getByRole("switch", { name: t("access.contrast") });
    await user.click(sw);
    expect(document.documentElement).toHaveClass("high-contrast");
    await user.click(sw);
    expect(document.documentElement).not.toHaveClass("high-contrast");
  });

  it("text size sets the scale variable", async () => {
    const user = userEvent.setup();
    setup();
    await openAll(user);
    await user.click(screen.getByRole("radio", { name: t("access.size.m") }));
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.25");
  });

  it("every switch in the drawer has an svg icon", async () => {
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { vibrate: () => true }));
    const user = userEvent.setup();
    setup();
    await openAll(user);
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(9); // the dark theme joined the "See" group
    for (const sw of switches) expect(sw.querySelector("svg"), sw.textContent ?? "").not.toBeNull();
    const rate = screen.getByLabelText(t("access.rate"));
    expect(rate.closest("div[class*=sliderRow]")?.querySelector("svg")).not.toBeNull();
  });

  it("opens on four situation cards, with every single setting closed under All settings", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    const dialog = screen.getByRole("dialog", { name: t("access.title") });
    for (const id of ["blind", "lowVision", "hearing", "motion"]) {
      const card = within(dialog).getByRole("button", { name: t(`access.p.${id}`) });
      expect(card).toHaveAttribute("aria-pressed", "false");
      expect(card.querySelector("svg")).not.toBeNull();
    }
    expect(within(dialog).queryAllByRole("switch")).toHaveLength(0);
    const all = within(dialog).getByRole("button", { name: t("access.all") });
    expect(all).toHaveAttribute("aria-expanded", "false");
    await user.click(all);
    expect(all).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getAllByRole("switch").length).toBeGreaterThan(5);
  });

  it("each card says what it turns on", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    const card = screen.getByRole("button", { name: t("access.p.lowVision") });
    expect(card).toHaveAccessibleDescription(
      [t("access.item.large"), t("access.item.contrast"), t("access.item.font")].join(" · "),
    );
  });

  it("I see poorly turns on large text, high contrast and the clear font, and undoes them", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    const card = screen.getByRole("button", { name: t("access.p.lowVision") });
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(usePrefs.getState()).toMatchObject({
      textScale: 1.5,
      highContrast: true,
      readableFont: true,
    });
    expect(document.documentElement).toHaveClass("high-contrast");
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(usePrefs.getState()).toMatchObject({
      textScale: 1,
      highContrast: false,
      readableFont: false,
    });
  });

  it("undoing I see poorly puts back what was there, not fixed values", async () => {
    usePrefs.setState({ ...defaultPrefs(), highContrast: true, textScale: 1.25 });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    const card = screen.getByRole("button", { name: t("access.p.lowVision") });
    await user.click(card);
    expect(usePrefs.getState().textScale).toBe(1.5);
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(usePrefs.getState()).toMatchObject({
      textScale: 1.25,
      highContrast: true,
      readableFont: false,
    });
    expect(usePrefs.getState().profileBackup).toEqual({});
  });

  it("a card follows the single settings: one changed under All settings turns it off", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    const blind = screen.getByRole("button", { name: t("access.p.blind") });
    await user.click(blind);
    expect(usePrefs.getState().speech).toBe(true);
    expect(blind).toHaveAccessibleDescription(new RegExp(t("access.p.blind.note")));
    await user.click(screen.getByRole("button", { name: t("access.all") }));
    await user.click(screen.getByRole("switch", { name: new RegExp(t("access.speech")) }));
    expect(blind).toHaveAttribute("aria-pressed", "false");
    // Undoing it keeps the captions on: they are on by default and help everyone.
    await user.click(blind);
    await user.click(blind);
    expect(usePrefs.getState()).toMatchObject({ speech: false, captions: true });
  });

  it("I hear poorly turns on without vibration on a device that cannot vibrate", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    const card = screen.getByRole("button", { name: t("access.p.hearing") });
    expect(card).not.toHaveAccessibleDescription(new RegExp(t("access.item.vibrate")));
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(usePrefs.getState()).toMatchObject({ captions: true, stereo: false, vibrate: false });
  });

  it("Less motion is one press", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: t("access.title") }));
    await user.click(screen.getByRole("button", { name: t("access.p.motion") }));
    expect(document.documentElement).toHaveClass("reduce-motion");
  });
});
