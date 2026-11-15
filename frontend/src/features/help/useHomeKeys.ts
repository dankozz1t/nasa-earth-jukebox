import { getPlayer } from "../../audio/player-instance";
import {
  useComposerStatus,
  useFrames,
  useLiveGrid,
  type Frame,
  type WeatherGrid,
} from "../../shared/api";
import { useT } from "../../shared/i18n";
import { formatDateTimeUtc, formatTimeLocal } from "../../shared/lib/format";
import { useHotkeys } from "../../shared/lib/useHotkeys";
import { countdown } from "../live";
import {
  adjacentPreset,
  focusSleeve,
  isPlayPending,
  isWeather,
  shelfItems,
  usePreset,
  useSession,
  type SessionPresetId,
} from "../presets";
import { archiveFrame } from "../stage";
import { say } from "../transport";

type Text = (key: string, vars?: Record<string, string | number>) => string;

function liveLine(grid: WeatherGrid | undefined, t: Text, lang: "en" | "uk"): string {
  if (!grid) return t("live.whereNone");

  const time = formatTimeLocal(grid.observedAt, lang);
  if (grid.isSnapshot) return t("live.whereSnapshot", { time });

  const wait = countdown(grid.nextUpdateAt, Date.now());
  if (wait.state === "unknown") return t("live.whereNoNext", { time });
  if (wait.state === "updating") return t("live.whereUpdating", { time });

  return t("live.where", { time, minutes: wait.minutes });
}

// The archive frame is static, so the answer is its date, as on the stage badge.
function archiveLine(frames: Frame[] | undefined, t: Text, lang: "en" | "uk"): string {
  const { soundscape: s, custom } = useSession.getState();
  const aerosol = s && !isWeather(s) ? s : undefined;
  const ownFrame = aerosol && !aerosol.frame && custom?.source === "nasa" && custom.file;
  const frame = ownFrame ? undefined : archiveFrame(frames, aerosol);

  return frame
    ? t("stage.staticFrame", { date: formatDateTimeUtc(frame.timestampUtc, lang) })
    : t("live.whereOwn");
}

// A step along the shelf plays only when sound was already on (playing, or a click still preparing),
// so no key ever starts sound by surprise.
export function useHomeKeys(): void {
  const { t, lang } = useT();
  const { pick } = usePreset();
  const aiAvailable = useComposerStatus().data?.aiAvailable;
  const grid = useLiveGrid().data;
  const frames = useFrames().data;

  function step(dir: 1 | -1) {
    const { source, presetId, custom, mixes } = useSession.getState();
    const ids = shelfItems(source, mixes[source]).map((i) => i.id);
    // The row's own mix is a stop only while "custom" means it; "Create your mix" opens a drawer, not a step.
    const disabled = (id: SessionPresetId) =>
      (id === "custom" && custom?.source !== source) || (id === "live-ai" && aiAvailable === false);
    const next = adjacentPreset(ids, presetId, dir, disabled);
    if (!next) return;

    const play = getPlayer().playing || isPlayPending();
    say(t("announce.preset", { title: t(`preset.${next}.title`) }));
    void pick(next, { play });
  }

  useHotkeys({
    p: () => focusSleeve(useSession.getState().source),
    "[": () => step(-1),
    "]": () => step(1),
    l() {
      const live = useSession.getState().source === "live";
      say(live ? liveLine(grid, t, lang) : archiveLine(frames, t, lang));
    },
  });
}
