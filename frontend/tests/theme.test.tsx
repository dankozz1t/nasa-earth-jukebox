// Light by default (even when the OS prefers dark), a header toggle and the same
// choice in the Accessibility panel, saved with the other prefs and mirrored onto <html data-theme>.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const saved = () => JSON.parse(localStorage.getItem("earth-jukebox:prefs:v2") ?? "{}").state ?? {};

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("theme pref", () => {
  it("is light on a first visit, even when the OS prefers dark", async () => {
    mockMedia(["(prefers-color-scheme: dark)"]);
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState().theme).toBe("light");
  });

  it("a saved dark theme comes back; a wrong value is dropped", async () => {
    localStorage.setItem(
      "earth-jukebox:prefs:v2",
      JSON.stringify({ state: { theme: "dark" }, version: 0 }),
    );
    expect((await freshStore()).usePrefs.getState().theme).toBe("dark");
    localStorage.setItem(
      "earth-jukebox:prefs:v2",
      JSON.stringify({ state: { theme: "neon" }, version: 0 }),
    );
    expect((await freshStore()).usePrefs.getState().theme).toBe("light");
  });

  it("v1 prefs (no theme) migrate to light", async () => {
    localStorage.setItem("earth-jukebox:prefs:v1", JSON.stringify({ textScale: 1.25 }));
    const { usePrefs } = await freshStore();
    expect(usePrefs.getState()).toMatchObject({ theme: "light", textScale: 1.25 });
  });

  it("reset to system keeps the chosen theme, like the language", async () => {
    const { usePrefs, setPref, resetToSystem } = await freshStore();
    setPref("theme", "dark");
    setPref("highContrast", true);
    resetToSystem();
    expect(usePrefs.getState().theme).toBe("dark");
  });

  it("applyPrefs mirrors it onto <html data-theme>", async () => {
    const { applyPrefs } = await import("../src/features/access/applyPrefs");
    const { defaultPrefs } = await import("../src/features/access/prefs");
    applyPrefs({ ...defaultPrefs(), theme: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyPrefs({ ...defaultPrefs(), theme: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("theme controls", () => {
  async function setup() {
    const store = await freshStore();
    const { Providers } = await import("../src/app/providers");
    const { AccessButton, ThemeButton } = await import("../src/features/access");
    const { dictFor } = await import("../src/shared/i18n");
    store.setPref("lang", "en");
    render(
      <Providers>
        <ThemeButton />
        <AccessButton />
      </Providers>,
    );
    return { store, en: dictFor("en") };
  }

  it("the header toggle is a pressed/unpressed button that sets <html data-theme> and is saved", async () => {
    const { store, en } = await setup();
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: en["theme.dark"] });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(toggle.querySelector("svg")).not.toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(store.usePrefs.getState().theme).toBe("dark");
    expect(saved().theme).toBe("dark");

    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(saved().theme).toBe("light");
  });

  it("the Accessibility panel has the same choice in its See group, in step with the header", async () => {
    const { en } = await setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: en["access.title"] }));
    await user.click(screen.getByRole("button", { name: en["access.all"] }));
    const see = screen.getByRole("region", { name: en["access.group.see"] });
    const sw = within(see).getByRole("switch", { name: en["theme.dark"] });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(sw);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: en["theme.dark"], hidden: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
