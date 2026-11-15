import { useId, useState } from "react";
import { getPlayer } from "../../audio/player-instance";
import { usePlayer } from "../../audio/usePlayer";
import { useT } from "../../shared/i18n";
import { Icon } from "../../shared/ui";
import { cancelPendingPlay } from "../presets";
import { usePlayToggle } from "../stage";
import { BarTip } from "./BarTip";
import styles from "./bar.module.css";

interface PlayDiscProps {
  playing: boolean;
  onToggle(): void;
}

function Grooves({ caption }: { caption?: string }) {
  const path = useId();

  return (
    <svg className={styles.grooves} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {(caption ? [47] : [46, 40, 34]).map((r) => (
        <circle
          key={r}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.4"
        />
      ))}
      {caption ? (
        <>
          <path id={path} d="M50 50 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0" fill="none" />
          <text className={styles.discCaption} dominantBaseline="central">
            <textPath
              href={`#${path}`}
              textLength="246"
              lengthAdjust="spacing"
            >{`${caption} · ${caption} · `}</textPath>
          </text>
        </>
      ) : (
        <path d="M50 10 A40 40 0 0 1 84 30" fill="none" stroke="currentColor" strokeWidth="3" />
      )}
    </svg>
  );
}

// The name stays "Listen"; aria-pressed carries the play/pause state.
export function PlayDisc({ playing, onToggle }: PlayDiscProps) {
  const { t } = useT();
  const [started, setStarted] = useState(playing);
  if (playing && !started) setStarted(true);

  return (
    <button
      type="button"
      className={styles.disc}
      aria-pressed={playing}
      aria-label={t("play.listen")}
      onClick={() => {
        setStarted(true);
        onToggle();
      }}
    >
      <Grooves caption={started ? undefined : t("play.listen")} />
      <span className={styles.label}>
        <Icon name={playing ? "pause" : "play"} size={24} />
      </span>
    </button>
  );
}

export function PlayControl() {
  const { playing } = usePlayer();
  const onToggle = usePlayToggle();

  return <PlayDisc playing={playing} onToggle={onToggle} />;
}

export function StopControl() {
  const { t } = useT();
  const { ready } = usePlayer();

  return (
    <BarTip label={t("transport.stop")} className={styles.stopTip}>
      <button
        type="button"
        className={styles.stop}
        aria-label={t("transport.stop")}
        disabled={!ready}
        onClick={() => {
          const player = getPlayer();
          cancelPendingPlay();
          player.stop();
          player.setPan(0);
        }}
      >
        <Icon name="square" />
      </button>
    </BarTip>
  );
}
