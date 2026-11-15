import { describe, expect, it } from "vitest";
import { defaultPrefs, migratePrefs, type Prefs } from "../src/features/access/prefs";
import {
  isProfileOn,
  profilePatch,
  PROFILES,
  type ProfileId,
} from "../src/features/access/profiles";

const card = (id: ProfileId) => PROFILES.find((p) => p.id === id)!;

/** Presses a card the way the drawer does: derive the state, then apply the patch. */
function press(prefs: Prefs, id: ProfileId, canVibrate = true): Prefs {
  const p = card(id);
  return { ...prefs, ...profilePatch(p, !isProfileOn(p, prefs, canVibrate), canVibrate, prefs) };
}

const base = (over: Partial<Prefs> = {}): Prefs => ({ ...defaultPrefs(), ...over });

describe("situation cards restore what was there", () => {
  it("keeps a high contrast the OS asked for", () => {
    const start = base({ highContrast: true });
    const on = press(start, "lowVision");
    expect(on).toMatchObject({ textScale: 1.5, highContrast: true, readableFont: true });
    const off = press(on, "lowVision");
    expect(off).toMatchObject({ textScale: 1, highContrast: true, readableFont: false });
    expect(off.profileBackup).toEqual({});
  });

  it("keeps the user's own text scale", () => {
    const off = press(press(base({ textScale: 1.25 }), "lowVision"), "lowVision");
    expect(off.textScale).toBe(1.25);
  });

  it("keeps a mono choice made before the hearing card", () => {
    const start = base({ stereo: false });
    const on = press(start, "hearing");
    expect(isProfileOn(card("hearing"), on, true)).toBe(true);
    const off = press(on, "hearing");
    expect(off).toMatchObject({ stereo: false, vibrate: false });
  });

  it("falls back to the system defaults when there is no note", () => {
    const on = { ...base(), ...card("lowVision").on };
    const off = press(on, "lowVision");
    expect(off).toMatchObject({ textScale: 1, highContrast: false, readableFont: false });
  });

  it("falls back to the OS default high contrast when there is no note", () => {
    const os = { ...defaultPrefs(), highContrast: true };
    const on = { ...os, ...card("lowVision").on };
    expect(profilePatch(card("lowVision"), false, true, on).highContrast).toBe(
      defaultPrefs().highContrast,
    );
  });

  it("leaves captions alone when blind is undone", () => {
    const off = press(press(base({ captions: false }), "blind"), "blind");
    expect(off).toMatchObject({ speech: false, captions: true });
  });

  it("does not touch prefs another active card sets", () => {
    const hearing = press(base({ stereo: true }), "hearing");
    const both = press(hearing, "blind");
    expect(both.captions).toBe(true);
    const patch = profilePatch(card("blind"), false, true, both);
    expect(patch).not.toHaveProperty("captions");
    // The hearing card is still on after the blind card is undone.
    expect(isProfileOn(card("hearing"), { ...both, ...patch }, true)).toBe(true);
  });

  it("does not restore a pref another card still on holds", () => {
    // The shipped bundles share only captions (never restored); force an overlap on speech to check the guard.
    const motion = card("motion");
    const original = motion.on;
    try {
      motion.on = { reduceMotion: true, speech: true };
      const prefs = base({
        speech: true,
        reduceMotion: true,
        profileBackup: { blind: { speech: false } },
      });
      expect(isProfileOn(motion, prefs, true)).toBe(true);
      const patch = profilePatch(card("blind"), false, true, prefs);
      expect(patch).not.toHaveProperty("speech");
    } finally {
      motion.on = original;
    }
  });

  it("keeps separate notes per card", () => {
    const a = press(base({ textScale: 1.25 }), "lowVision");
    const b = press(a, "motion");
    expect(Object.keys(b.profileBackup).sort()).toEqual(["lowVision", "motion"]);
    expect(press(b, "motion").profileBackup).toHaveProperty("lowVision");
  });

  it("skips vibration where the device cannot vibrate", () => {
    const start = base({ vibrate: false });
    const on = press(start, "hearing", false);
    expect(on.profileBackup.hearing).not.toHaveProperty("vibrate");
    expect(press(on, "hearing", false).vibrate).toBe(false);
  });
});

describe("profileBackup is validated when loaded", () => {
  it("keeps known cards and valid values only", () => {
    const out = migratePrefs({
      profileBackup: {
        lowVision: { textScale: 1.25, highContrast: "yes", bogus: 1, profileBackup: {} },
        unknown: { speech: true },
        motion: 5,
      },
    });
    expect(out.profileBackup).toEqual({ lowVision: { textScale: 1.25 } });
  });

  it("drops a backup that is not an object", () => {
    expect(migratePrefs({ profileBackup: [1] }).profileBackup).toEqual({});
    expect(migratePrefs({ profileBackup: "x" }).profileBackup).toEqual({});
  });

  it("does not add a backup when the saved prefs have none", () => {
    expect(migratePrefs({ textScale: 1.25 })).not.toHaveProperty("profileBackup");
  });
});
