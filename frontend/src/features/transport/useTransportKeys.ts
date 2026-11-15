import { useLocation } from "react-router";
import { getNarrator, getPlayer } from "../../audio/player-instance";
import { useLiveGrid } from "../../shared/api";
import { rationaleText, useT } from "../../shared/i18n";
import { useHotkeys, type HotkeyMap } from "../../shared/lib/useHotkeys";
import { setPref, usePrefs } from "../access";
import { mapSentence, summarize } from "../aerosols";
import { isWeather, useSession } from "../presets";
import { aerosolNowText, usePlayToggle, weatherNowText } from "../stage";
import { say } from "./announce";
import type { MixPart } from "./mix-parts";

const VOLUME_STEP = 0.05;
const MAX_PARTS = 7;

export function wholeMapText(lang: "en" | "uk"): string {
  const s = useSession.getState().soundscape;
  if (!s) return "";

  if (isWeather(s)) {
    return `${s.title}. ${rationaleText(s, lang)}`;
  }

  const layerLines = summarize(s).map((i) => `${i.label}. ${i.text}`);
  return [mapSentence(s), ...layerLines].join(" ");
}

// The bar is on every page, but Space plays only on Home: elsewhere it keeps scrolling the page.
export function useTransportKeys(parts: readonly MixPart[]): void {
  const { t, lang } = useT();
  const toggle = usePlayToggle();
  const toggleMute = useSession((s) => s.toggleMute);
  const solo = useSession((s) => s.solo);
  const grid = useLiveGrid().data;
  const onHome = useLocation().pathname === "/";

  const map: HotkeyMap = {
    "-": () => nudgeVolume(-VOLUME_STEP),
    "=": () => nudgeVolume(VOLUME_STEP),
    s() {
      const next = !usePrefs.getState().speech;
      setPref("speech", next);
      getNarrator().enabled = next; // speaks "speech on" at once, not after the next render
      say(t(next ? "announce.speechOn" : "announce.speechOff"));
    },
    d() {
      const text = wholeMapText(lang);
      if (text) say(text);
    },
    w(e) {
      // W is also the map explorer's own key: with focus on it the explorer speaks instead.
      if (e.target instanceof Element && e.target.closest("[data-explorer]")) return;

      const { soundscape: s, muted } = useSession.getState();
      if (!s) return;

      const { position, playing } = getPlayer();
      const stereo = usePrefs.getState().stereo;
      say(
        isWeather(s)
          ? weatherNowText(s, grid, position, playing, null, lang, stereo)
          : aerosolNowText(s, position, playing, muted, ""),
      );
    },
  };

  if (onHome) map.space = toggle;

  function nudgeVolume(delta: number) {
    const rounded = Math.round((usePrefs.getState().volume + delta) * 100) / 100;
    const v = Math.min(1, Math.max(0, rounded));

    setPref("volume", v);
    getPlayer().setVolume(v);
    say(`${t("vol.label")}: ${Math.round(v * 100)}%`);
  }

  for (let i = 0; i < Math.min(parts.length, MAX_PARTS); i++) {
    const part = parts[i];

    map[String(i + 1)] = () => {
      toggleMute(part.key);
      const on = !useSession.getState().muted[part.key];
      say(t(on ? "announce.layerOn" : "announce.layerOff", { layer: part.label }));
    };

    map[`Shift+${i + 1}`] = () => {
      solo(part.key);
      const muted = useSession.getState().muted;
      const only = !muted[part.key] && parts.every((p) => p.key === part.key || muted[p.key]);
      say(only ? t("announce.solo", { layer: part.label }) : t("announce.allOn"));
    };
  }

  useHotkeys(map);
}
