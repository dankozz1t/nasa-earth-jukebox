import { useEffect, useState } from "react";
import { getPlayer } from "../../audio/player-instance";
import { usePlayer } from "../../audio/usePlayer";
import {
  useFrames,
  useLiveGrid,
  useSections,
  weatherApi,
  type Frame,
  type Soundscape,
  type WeatherGrid,
  type WeatherSection,
} from "../../shared/api";
import { useT } from "../../shared/i18n";
import { Button, EarIcon, InfoTip } from "../../shared/ui";
import { formatDateTimeUtc } from "../../shared/lib/format";
import { usePrefs } from "../access";
import { formatWeatherValue, panFor } from "../live/model/describe-weather";
import { cssGradient } from "../live/model/palette";
import {
  cancelPendingPlay,
  findPreset,
  firstPreset,
  isPlayPending,
  isWeather,
  pieceOnStage,
  PRESETS,
  usePreset,
  useSession,
  type AnySoundscape,
  type Preset,
  type SessionPresetId,
  type Source,
} from "../presets";
import type { AerosolCursor } from "./draw-aerosols";
import { currentFrac, pathPoint, type Flash, type LatLon, type WavePreview } from "./draw-weather";
import { Explorer } from "./Explorer";
import { MapCanvas } from "./MapCanvas";
import { SourceSwitch } from "./SourceSwitch";
import { useClassMap, useImage, useImageStatus } from "./useStageImages";
import styles from "./stage.module.css";

const ARCHIVE_FRAME_ID = PRESETS.find((p) => p.source === "nasa")?.settings.frameId;

export function archiveFrame(frames: Frame[] | undefined, s?: Soundscape): Frame | undefined {
  return s?.frame ?? frames?.find((f) => f.id === ARCHIVE_FRAME_ID) ?? frames?.[0];
}

export function playTarget(
  presetId: SessionPresetId,
  source: Source,
  custom?: Preset,
): SessionPresetId {
  if (findPreset(presetId, custom)?.source === source) return presetId;
  return firstPreset(source).id;
}

// Shared by the Play disc and the Space key. The player may not be ready yet, or may hold the other source.
export function usePlayToggle(): () => void {
  const source = useSession((s) => s.source);
  const presetId = useSession((s) => s.presetId);
  const custom = useSession((s) => s.custom);
  const sounding = useSession((s) => s.soundscape);
  const { pick } = usePreset();

  return () => {
    const player = getPlayer();
    const target = playTarget(presetId, source, custom);

    if (player.ready && player.playing) {
      cancelPendingPlay();
      player.pause();
      return;
    }

    // Resume only the piece that is the selection. A mix staged in Tune is a different piece even when its
    // tag equals the old one ("custom" twice). A player without a preset tag counts as matching.
    const tag = player.getSnapshot().tag;
    const sameSelection =
      !useSession.getState().staged && (typeof tag !== "string" || tag === target);
    if (player.ready && pieceOnStage(sounding, source) && sameSelection) {
      void player.play();
      return;
    }

    // A click a moment ago already started this piece: a second Play must not start it over.
    if (isPlayPending(target)) return;

    void pick(target);
  };
}

// While the wave is reshaped in Tune, the pan follows the drawn preview, so the ear and the dot agree.
function usePanFollow(
  s: AnySoundscape | undefined,
  stereo: boolean,
  preview: WavePreview | null,
  grid: WeatherGrid | undefined,
): void {
  const { playing } = usePlayer();

  useEffect(() => {
    const player = getPlayer();
    if (!s) return;

    if (!isWeather(s)) {
      player.setPan(0);
      return;
    }
    if (!playing) return;

    let raf = 0;
    const tick = () => {
      const fi = currentFrac(s, player.position, player.playing, false);
      if (fi >= 0) {
        const { lat } = pathPoint(s, fi, preview, grid);
        player.setPan(panFor(lat, stereo, s.maxLat));
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s, playing, stereo, preview, grid]);
}

// The one sounding, else the selected live preset's, else the first live preset's. The live updates diff and
// chart the same layer.
export function useLiveSection(): WeatherSection | undefined {
  const presetId = useSession((s) => s.presetId);
  const custom = useSession((s) => s.custom);
  const sounding = useSession((s) => s.soundscape);
  const sections = useSections().data;

  if (sounding && isWeather(sounding)) return sounding.section;

  const selected = findPreset(presetId, custom);
  const live = selected?.source === "live" ? selected : firstPreset("live");

  return sections?.find((x) => x.key === live.settings.section) ?? sections?.[0];
}

function WeatherLegend({ section, colorSafe }: { section: WeatherSection; colorSafe: boolean }) {
  const { t, lang } = useT();
  const low = formatWeatherValue(section.key, section.low, lang);
  const high = formatWeatherValue(section.key, section.high, lang);
  const layer = t(`w.sec.${section.key}`).toLocaleLowerCase(lang);

  return (
    <div className={styles.legendRow}>
      <div className={styles.legend} role="img" aria-label={t("live.legend", { layer, low, high })}>
        <span aria-hidden="true">{low}</span>
        <span
          className={styles.legendBar}
          style={{ background: cssGradient(colorSafe ? "safe" : section.palette) }}
          aria-hidden="true"
        />
        <span aria-hidden="true">{high}</span>
      </div>
      <InfoTip label={t("legend.tip.label")}>{t("legend.tip")}</InfoTip>
    </div>
  );
}

// `live` makes it a polite status. A pick error is not live: its alert toast already says it.
function StageNotice({ text, onRetry, live }: { text: string; onRetry(): void; live?: boolean }) {
  const { t } = useT();

  return (
    <div className={styles.notice} role={live ? "status" : undefined}>
      <span>{text}</span>
      <Button variant="outline" icon="rotate-ccw" onClick={onRetry}>
        {t("preset.error.retry")}
      </Button>
    </div>
  );
}

function useObjectUrl(file: File | undefined): string | undefined {
  const [made, setMade] = useState<{ file: File; url: string }>();

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") return;

    const url = URL.createObjectURL(file);
    // The URL is created, handed over and revoked together here, so state in the effect is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMade({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return made && made.file === file ? made.url : undefined;
}

interface StageProps {
  flashes?: readonly Flash[];
}

export function Stage({ flashes }: StageProps) {
  const { t, lang } = useT();
  const prefs = usePrefs();
  const source = useSession((s) => s.source);
  const muted = useSession((s) => s.muted);
  const sounding = useSession((s) => s.soundscape);
  const preview = useSession((s) => s.preview);
  const custom = useSession((s) => s.custom);

  const onStage = pieceOnStage(sounding, source);
  const aerosol = onStage && !isWeather(onStage) ? onStage : undefined;
  const weather = onStage && isWeather(onStage) ? onStage : undefined;

  const framesQuery = useFrames();
  const frames = framesQuery.data;
  const gridQuery = useLiveGrid();
  const grid = gridQuery.data;
  const liveSection = useLiveSection();
  const { pick, error, errorId } = usePreset();

  const failed = findPreset(errorId, custom);
  const pickError =
    error && errorId && failed?.source === source ? (
      <StageNotice text={error} onRetry={() => void pick(errorId)} />
    ) : null;

  const frame = source === "nasa" ? archiveFrame(frames, aerosol) : undefined;
  // An own frame from Tune has no catalogue frame: the stage shows the image that was sent.
  const ownFrame = aerosol && !aerosol.frame && custom?.source === "nasa" ? custom.file : undefined;
  const ownFrameUrl = useObjectUrl(ownFrame);
  const { img: frameImage, status: frameStatus } = useImageStatus(
    ownFrame ? ownFrameUrl : frame?.imageUrl,
  );
  const classMap = useClassMap(aerosol);
  const basemap = useImage(source === "live" ? weatherApi.basemapUrl : undefined);

  const [cursor, setCursor] = useState<AerosolCursor>({ step: -1, y: 0.5 });
  const [probe, setProbe] = useState<LatLon | null>(null);

  const section = weather?.section ?? liveSection;

  usePanFollow(sounding, prefs.stereo, preview, grid);

  const common = { prefs, muted };
  const date = frame && !ownFrame ? formatDateTimeUtc(frame.timestampUtc, lang) : "";

  function archiveStatus() {
    if (pickError) return pickError;

    if (!frames && framesQuery.isError) {
      return (
        <StageNotice live text={t("stage.frameError")} onRetry={() => void framesQuery.refetch()} />
      );
    }

    if (frameStatus === "error") {
      return (
        <span className={styles.loading} role="status">
          {t("stage.frameError")}
        </span>
      );
    }

    if (!frameImage) return <span className={styles.loading}>{t("stage.loadingFrame")}</span>;
    return null;
  }

  function liveStatus() {
    if (pickError) return pickError;
    if (grid) return null;

    if (gridQuery.isError) {
      return (
        <StageNotice live text={t("stage.gridError")} onRetry={() => void gridQuery.refetch()} />
      );
    }

    return <span className={styles.loading}>{t("w.loading.data")}</span>;
  }

  return (
    <section className={styles.stage} aria-label={t("stage.label")} data-source={source}>
      {source === "nasa" ? (
        <MapCanvas
          {...common}
          kind="nasa"
          soundscape={aerosol}
          frameImage={frameImage}
          classMap={classMap}
          cursor={cursor}
        >
          <Explorer
            muted={muted}
            stereo={prefs.stereo}
            vibrate={prefs.vibrate}
            kind="nasa"
            soundscape={aerosol}
            classMap={classMap}
            cursor={cursor}
            onCursor={setCursor}
          />
          {date && <span className={styles.badge}>{t("stage.staticFrame", { date })}</span>}
          {archiveStatus()}
        </MapCanvas>
      ) : (
        <MapCanvas
          {...common}
          kind="live"
          soundscape={weather}
          grid={grid}
          section={section}
          basemap={basemap}
          probe={probe}
          flashes={flashes}
          preview={preview}
        >
          <Explorer
            muted={muted}
            stereo={prefs.stereo}
            vibrate={prefs.vibrate}
            kind="live"
            soundscape={weather}
            grid={grid}
            section={section}
            probe={probe}
            onProbe={setProbe}
          />
          {prefs.stereo && (
            <>
              <span className={styles.earLeft} aria-hidden="true">
                <EarIcon side="left" size={18} />
                {t("stage.ear.left")}
              </span>
              <span className={styles.earRight} aria-hidden="true">
                <EarIcon side="right" size={18} />
                {t("stage.ear.right")}
              </span>
            </>
          )}
          {liveStatus()}
        </MapCanvas>
      )}
      {source === "live" && section && (
        <WeatherLegend section={section} colorSafe={prefs.colorSafe} />
      )}
    </section>
  );
}

export function StageSourceSwitch() {
  const source = useSession((s) => s.source);
  const setSource = useSession((s) => s.setSource);
  const sounding = useSession((s) => s.soundscape);
  const frames = useFrames().data;
  const frame = archiveFrame(frames, sounding && !isWeather(sounding) ? sounding : undefined);

  return <SourceSwitch value={source} onChange={setSource} nasaTimestamp={frame?.timestampUtc} />;
}
