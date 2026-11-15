import { useEffect, useRef } from "react";
import { usePlayer } from "../../audio/usePlayer";
import { useHomeKeys } from "../../features/help";
import { LivePanel, useLiveFlashes } from "../../features/live";
import {
  firstPreset,
  isPlayPending,
  mixStart,
  PresetShelf,
  presetById,
  usePreset,
  usePresetUrlSync,
  useSession,
  type SessionPresetId,
  type Source,
} from "../../features/presets";
import { Stage, StageSourceSwitch } from "../../features/stage";
import { Captions, NowPlaying } from "../../features/transport";
import { useComposerStatus } from "../../shared/api";
import { useT } from "../../shared/i18n";
import { useOverlay } from "../../shared/lib/overlays";
import { RouteHeading } from "../RouteHeading";
import styles from "./Home.module.css";

const IDLE_TIMEOUT_MS = 2000;

// Keep `fn` stable. Safari has no requestIdleCallback, so it gets a short timeout instead.
function useOnceWhenIdle(fn: () => unknown): void {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    const run = () => {
      done.current = true;
      void fn();
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(id);
    }

    const id = window.setTimeout(run, IDLE_TIMEOUT_MS / 2);
    return () => window.clearTimeout(id);
  }, [fn]);
}

export default function Home() {
  const { t } = useT();
  const { pick, prefetchCompose, prefetchDefault, progress, error, errorId, tour } = usePreset();
  usePresetUrlSync();
  useHomeKeys();

  const presetId = useSession((s) => s.presetId);
  const source = useSession((s) => s.source);
  const custom = useSession((s) => s.custom);
  const mixes = useSession((s) => s.mixes);
  const { playing, tag } = usePlayer();
  const aiAvailable = useComposerStatus().data?.aiAvailable;
  const flashes = useLiveFlashes();

  // Warms the compose and stems caches only: the player may not load before a gesture.
  useOnceWhenIdle(prefetchDefault);

  const playingId =
    playing && typeof tag === "string" && (tag === "custom" || presetById(tag))
      ? (tag as SessionPresetId)
      : null;

  // "AI composes" remembered from an earlier visit, but the AI is not available now.
  useEffect(() => {
    if (
      aiAvailable === false &&
      presetId === "live-ai" &&
      tag !== "live-ai" &&
      !isPlayPending("live-ai")
    ) {
      useSession.getState().pick(firstPreset("live").id);
    }
  }, [aiAvailable, presetId, tag]);

  // A click on the sleeve that already plays does not restart it, unless a new mix was staged in Tune
  // under the same "custom" sleeve.
  const onPick = (id: SessionPresetId) => {
    const alreadyPlaying = id === playingId && !useSession.getState().staged;
    if (alreadyPlaying || isPlayPending(id)) return;

    void pick(id);
  };

  // "Create your mix" plays the row's own mix and opens Sound settings on it. A new mix sounds the same as
  // the record it grows from, so while that record plays it goes on without a restart.
  const onMix = (source: Source) => {
    const session = useSession.getState();
    const mix = mixStart(source);
    const fresh = session.mixes[source] === undefined;
    const same = session.presetId === "custom" && session.custom === mix;

    session.setCustom(mix);
    if (same) onPick("custom");
    else if (!(fresh && playingId === mix.id)) void pick("custom");
    useOverlay.getState().show("tune");
  };

  const disabledFor = (id: SessionPresetId) =>
    id === "live-ai" && aiAvailable === false ? t("preset.aiUnavailable") : undefined;

  const noteFor = (id: SessionPresetId) => {
    if (!tour || id !== tour.id || tour.ready >= tour.total) return undefined;
    return t("preset.tourReady", { ready: tour.ready, total: tour.total });
  };

  return (
    <div className={styles.home}>
      <RouteHeading className="visually-hidden">{t("app.title")}</RouteHeading>

      <div className={styles.picker}>
        <div className={styles.switch}>
          <StageSourceSwitch />
        </div>
        <div id="shelf" tabIndex={-1} className={styles.shelf} data-source={source}>
          <PresetShelf
            selectedId={presetId}
            custom={custom}
            mixes={mixes}
            playingId={playingId}
            progressFor={(id) => progress[id]}
            disabledFor={disabledFor}
            errorFor={(id) => (id === errorId ? error : undefined)}
            noteFor={noteFor}
            onPick={onPick}
            onMix={onMix}
            onPeek={prefetchCompose}
          />
        </div>
      </div>

      {source === "live" && (
        <div className={styles.live}>
          <LivePanel />
        </div>
      )}

      <div className={styles.stage}>
        <Stage flashes={flashes} />
      </div>

      <div className={styles.now}>
        <NowPlaying />
      </div>

      <div className={styles.captions}>
        <Captions />
      </div>
    </div>
  );
}
