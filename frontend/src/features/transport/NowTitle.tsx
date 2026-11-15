import { usePlayer } from "../../audio/usePlayer";
import { useT } from "../../shared/i18n";
import {
  COVERS,
  findPreset,
  presetById,
  usePickProgress,
  useSession,
  type Preset,
  type SessionPresetId,
  type SleeveProgress,
} from "../presets";
import styles from "./bar.module.css";

function soundingId(tag: unknown): SessionPresetId | null {
  if (tag === "custom") return "custom";

  return typeof tag === "string" && presetById(tag) ? (tag as SessionPresetId) : null;
}

// A pick that is loading wins, then the piece on the player; with nothing loaded it is the selection.
function useNowPiece(): {
  id: SessionPresetId;
  preset: Preset | undefined;
  playing: boolean;
  loaded: boolean;
  busy: SleeveProgress | undefined;
} {
  const { playing, tag } = usePlayer();
  const presetId = useSession((s) => s.presetId);
  const custom = useSession((s) => s.custom);
  const busy = usePickProgress(presetId);

  const sounding = soundingId(tag);
  const id = busy ? presetId : (sounding ?? presetId);

  return {
    id,
    preset: findPreset(id, custom),
    playing,
    loaded: sounding !== null,
    busy,
  };
}

export function NowSleeve() {
  const { preset } = useNowPiece();
  const Cover = preset ? COVERS[preset.cover] : null;

  return (
    <span className={styles.sleeve} aria-hidden="true">
      {Cover && <Cover />}
    </span>
  );
}

function busyText(t: (key: string) => string, busy: SleeveProgress): string {
  const word = t(busy.phase === "compose" ? "preset.preparing" : "preset.downloading");
  return busy.pct === undefined ? word : `${word} ${Math.round(busy.pct)}%`;
}

function stateKey(playing: boolean, loaded: boolean): string {
  if (playing) return "player.now";
  if (loaded) return "player.paused";
  return "player.ready";
}

export function NowTitle() {
  const { t } = useT();
  const { id, preset, playing, loaded, busy } = useNowPiece();

  if (!preset) return <div className={styles.title} />;

  const live = preset.source === "live";

  return (
    <p className={styles.title}>
      <span className={styles.state} data-busy={busy ? "true" : undefined}>
        {busy ? busyText(t, busy) : t(stateKey(playing, loaded))}
      </span>
      <span className={styles.nameLine}>
        <span className={styles.name}>{t(`preset.${id}.title`)}</span>
        <span className={styles.badge}>
          {live && <span className={styles.dot} aria-hidden="true" />}
          {t(live ? "preset.badge.live" : "preset.badge.nasa")}
        </span>
      </span>
    </p>
  );
}
