import { useEffect, useRef } from "react";
import { getPlayer } from "../../audio/player-instance";
import { usePlayer } from "../../audio/usePlayer";
import { getLang, t } from "../../shared/i18n";
import { usePrefs } from "../access";
import { applyRepeatPref, END_GRACE_SEC, subscribePlayStart } from "../presets";
import { say } from "./announce";

const SAMPLE_MS = 250;
const END_SLACK_SEC = 0.5;

function lengthText(seconds: number): string {
  return new Intl.NumberFormat(getLang(), {
    style: "unit",
    unit: "second",
    unitDisplay: "long",
    maximumFractionDigits: 0,
  }).format(seconds);
}

export function useTransportSync(): void {
  const repeat = usePrefs((p) => p.repeat);
  const { playing, duration } = usePlayer();

  useEffect(
    () =>
      subscribePlayStart((id, sec) =>
        say(t("announce.playing", { title: t(`preset.${id}.title`), length: lengthText(sec) })),
      ),
    [],
  );

  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    applyRepeatPref();
  }, [repeat]);

  const lastPosition = useRef(0);
  const wasPlaying = useRef(false);
  const lastDuration = useRef(0);

  useEffect(() => {
    const player = getPlayer();

    if (playing) {
      lastDuration.current = duration;
      lastPosition.current = player.position;
      const id = window.setInterval(() => {
        lastPosition.current = player.position;
      }, SAMPLE_MS);
      wasPlaying.current = true;
      return () => window.clearInterval(id);
    }

    if (!wasPlaying.current) return;
    wasPlaying.current = false;

    // A pause is not an end: the position sampled just before the stop tells them apart.
    const endsAt = lastDuration.current + END_GRACE_SEC - SAMPLE_MS / 1000 - END_SLACK_SEC;
    if (lastDuration.current > 0 && lastPosition.current >= endsAt) {
      say(t("announce.end"));
    }
  }, [playing, duration]);
}
