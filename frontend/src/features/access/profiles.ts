import type { IconName } from "../../shared/ui";
import { defaultPrefs, type Prefs, type ProfileId } from "./prefs";

// Four plain situations, each a bundle of prefs. Every pref in a bundle also stays under "Fine-tune".
export type { ProfileId };

type Bundle = Partial<Prefs>;
type Restorable = keyof Omit<Prefs, "profileBackup">;

export interface Profile {
  id: ProfileId;
  icon: IconName;
  on: Bundle;
  /** Put back when the card is pressed off. A pref left out (captions) keeps its value. */
  restores: readonly Restorable[];
  items: Partial<Record<keyof Prefs, string>>;
}

export const PROFILES: readonly Profile[] = [
  {
    id: "blind",
    icon: "eye-off",
    on: { speech: true, captions: true },
    restores: ["speech"],
    items: { speech: "access.item.speech", captions: "access.item.captions" },
  },
  {
    id: "lowVision",
    icon: "glasses",
    on: { textScale: 1.5, highContrast: true, readableFont: true },
    restores: ["textScale", "highContrast", "readableFont"],
    items: {
      textScale: "access.item.large",
      highContrast: "access.item.contrast",
      readableFont: "access.item.font",
    },
  },
  {
    id: "hearing",
    icon: "ear-off",
    on: { captions: true, stereo: false, vibrate: true },
    restores: ["stereo", "vibrate"],
    items: {
      captions: "access.item.captions",
      stereo: "access.item.mono",
      vibrate: "access.item.vibrate",
    },
  },
  {
    id: "motion",
    icon: "circle-pause",
    on: { reduceMotion: true },
    restores: ["reduceMotion"],
    items: { reduceMotion: "access.item.still" },
  },
];

// Vibration is dropped from a bundle where the device cannot vibrate, so the card still turns on.
function usable(bundle: Bundle, canVibrate: boolean): Bundle {
  if (canVibrate || !("vibrate" in bundle)) return bundle;

  const rest = { ...bundle };
  delete rest.vibrate;
  return rest;
}

export function profileKeys(p: Profile, canVibrate: boolean): (keyof Prefs)[] {
  return Object.keys(usable(p.on, canVibrate)) as (keyof Prefs)[];
}

export function isProfileOn(p: Profile, prefs: Prefs, canVibrate: boolean): boolean {
  const on = usable(p.on, canVibrate);
  return (Object.keys(on) as (keyof Prefs)[]).every((k) => prefs[k] === on[k]);
}

function restorable(p: Profile, canVibrate: boolean): Restorable[] {
  return p.restores.filter((k) => canVibrate || k !== "vibrate");
}

// Off puts the saved values back (the system default if there is no note), except prefs another card still on sets.
export function profilePatch(
  p: Profile,
  turnOn: boolean,
  canVibrate: boolean,
  prefs: Prefs,
): Partial<Prefs> {
  const { [p.id]: mine, ...others } = prefs.profileBackup;

  if (turnOn) {
    const before: Record<string, unknown> = {};
    for (const k of restorable(p, canVibrate)) before[k] = prefs[k];

    return {
      ...usable(p.on, canVibrate),
      profileBackup: { ...others, [p.id]: before },
    };
  }

  const held = new Set<keyof Prefs>();
  for (const o of PROFILES) {
    if (o.id === p.id || !isProfileOn(o, prefs, canVibrate)) continue;
    for (const k of profileKeys(o, canVibrate)) held.add(k);
  }

  const fallback = defaultPrefs();
  const patch: Record<string, unknown> = {};
  for (const k of restorable(p, canVibrate)) {
    if (!held.has(k)) patch[k] = mine?.[k] ?? fallback[k];
  }

  return { ...patch, profileBackup: others };
}
