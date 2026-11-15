import { beforeEach, describe, expect, it, vi } from "vitest";

const player = vi.hoisted(() => ({
  ready: true,
  playing: false,
  duration: 64,
  position: 0,
  setRepeat: vi.fn(),
}));
vi.mock("../src/audio/player-instance", () => ({
  getPlayer: () => player,
  getNarrator: () => ({ speak: vi.fn() }),
}));

import { setPref, usePrefs } from "../src/features/access";
import { defaultPrefs } from "../src/features/access/prefs";
import { applyRepeatPref, useSession } from "../src/features/presets";
import { resetPresetEngine } from "../src/features/presets/engine";
import type { Soundscape, WeatherSoundscape } from "../src/shared/api";

const archive = { id: "a", layers: [], artifacts: { stems: {} } } as unknown as Soundscape;
const live = { id: "w", path: { t: [] }, artifacts: { stems: {} } } as unknown as WeatherSoundscape;

beforeEach(() => {
  vi.clearAllMocks();
  resetPresetEngine();
  player.ready = true;
  useSession.setState(useSession.getInitialState(), true);
  usePrefs.setState(defaultPrefs(), true);
});

describe("applyRepeatPref (real function)", () => {
  it.each([
    ["all", "one"],
    ["off", "off"],
    ["one", "one"],
  ] as const)("archive with prefs repeat %s sets the player to %s", (pref, expected) => {
    useSession.setState({ soundscape: archive });
    setPref("repeat", pref);
    applyRepeatPref();
    expect(player.setRepeat).toHaveBeenCalledTimes(1);
    expect(player.setRepeat).toHaveBeenCalledWith(expected);
  });

  it("leaves live presets alone", () => {
    useSession.setState({ soundscape: live });
    setPref("repeat", "off");
    applyRepeatPref();
    expect(player.setRepeat).not.toHaveBeenCalled();
  });

  it("does nothing when the player is not ready or nothing is shown", () => {
    useSession.setState({ soundscape: archive });
    player.ready = false;
    applyRepeatPref();
    expect(player.setRepeat).not.toHaveBeenCalled();
    player.ready = true;
    useSession.setState({ soundscape: undefined });
    applyRepeatPref();
    expect(player.setRepeat).not.toHaveBeenCalled();
  });
});
