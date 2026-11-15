import { useEffect } from "react";
import { getPlayer } from "../../audio/player-instance";
import { usePlayer } from "../../audio/usePlayer";
import { useLiveGrid } from "../../shared/api";
import { useT } from "../../shared/i18n";
import { usePrefs } from "../access";
import { isWeather, useSession } from "../presets";
import { aerosolNowText, weatherNowText } from "../stage";
import { sayThrottled, useNowText } from "./announce";
import styles from "./transport.module.css";

const TICK_MS = 500;

export function NowPlaying() {
  const { t, lang } = useT();
  const text = useNowText((s) => s.text);
  const { playing } = usePlayer();
  const soundscape = useSession((s) => s.soundscape);
  const muted = useSession((s) => s.muted);
  const stereo = usePrefs((p) => p.stereo);
  const grid = useLiveGrid().data;

  useEffect(() => {
    if (!playing || !soundscape) return;

    const player = getPlayer();
    let last = "";

    const lineAt = (now: number) => {
      if (isWeather(soundscape)) {
        return weatherNowText(soundscape, grid, now, true, null, lang, stereo);
      }
      if (now < soundscape.durationSec) return aerosolNowText(soundscape, now, true, muted, "");
      return "";
    };

    const tick = () => {
      const line = lineAt(player.position);
      if (line && line !== last && sayThrottled(line)) last = line;
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, soundscape, muted, grid, lang, stereo]);

  return (
    <section className={styles.now} aria-label={t("now.label")}>
      <p className={styles.nowText} aria-live="polite" aria-atomic="true">
        {text}
      </p>
    </section>
  );
}
