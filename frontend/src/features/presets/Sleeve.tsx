import { useEffect, useRef, type KeyboardEvent } from "react";
import { useT } from "../../shared/i18n";
import { COVERS } from "./covers";
import type { Preset } from "./presets";
import styles from "./presets.module.css";

export interface SleeveProgress {
  phase: "compose" | "download";
  pct?: number;
}

interface SleeveProps {
  preset: Preset;
  custom?: boolean; // the person's own mix, made in Tune
  fresh?: boolean; // no such mix yet: "Create your mix"
  selected: boolean;
  playing: boolean;
  progress?: SleeveProgress;
  disabled?: string; // the reason: the sleeve shows but cannot be picked
  error?: string;
  note?: string;
  tabIndex?: number;
  onPick(): void;
  onPeek?(): void;
  onKeyDown?(e: KeyboardEvent<HTMLButtonElement>): void;
  buttonRef?(el: HTMLButtonElement | null): void;
}

const RING = 2 * Math.PI * 20;

// Sweeping across the shelf composes nothing: every compose counts against the server's rate limit.
export const PEEK_DWELL_MS = 300;

function useDwell(onPeek: (() => void) | undefined): { start(): void; cancel(): void } {
  const timer = useRef(0);
  const latest = useRef(onPeek);

  useEffect(() => {
    latest.current = onPeek;
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    start() {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => latest.current?.(), PEEK_DWELL_MS);
    },
    cancel() {
      window.clearTimeout(timer.current);
    },
  };
}

export function Sleeve({
  preset,
  custom,
  fresh,
  selected,
  playing,
  progress,
  disabled,
  error,
  note,
  tabIndex,
  onPick,
  onPeek,
  onKeyDown,
  buttonRef,
}: SleeveProps) {
  const { t } = useT();
  const Cover = COVERS[custom ? "custom" : preset.cover];
  const isLive = preset.source === "live";
  const id = custom ? "custom" : preset.id;
  let textKey = `preset.${preset.id}`;
  if (custom) textKey = fresh ? "preset.create" : "preset.custom";
  const reasonId = `${id}-reason`;
  const errorId = `${id}-error`;
  const noteId = `${id}-note`;
  const describedBy =
    [disabled ? reasonId : "", error ? errorId : "", note ? noteId : ""]
      .filter(Boolean)
      .join(" ") || undefined;

  let busyLabel = "";
  if (progress) {
    busyLabel = t(progress.phase === "compose" ? "preset.preparing" : "preset.downloading");
  }

  const pct = progress?.pct;
  const dwell = useDwell(disabled ? undefined : onPeek);

  return (
    <div
      className={styles.slot}
      data-selected={selected}
      data-playing={playing}
      data-custom={custom ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      data-error={error ? "true" : undefined}
      data-busy={progress ? "true" : undefined}
    >
      <button
        ref={buttonRef}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-disabled={disabled ? true : undefined}
        aria-describedby={describedBy}
        aria-busy={progress ? true : undefined}
        tabIndex={tabIndex}
        className={styles.sleeve}
        onKeyDown={onKeyDown}
        onPointerEnter={dwell.start}
        onPointerLeave={dwell.cancel}
        onFocus={dwell.start}
        onBlur={dwell.cancel}
        onClick={(e) => {
          if (disabled) return;
          // A sleeve half off the rail comes fully into view, so its progress ring can be seen.
          e.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          onPick();
        }}
      >
        <span className={styles.cover}>
          <Cover />
          <span className={isLive ? styles.badgeLive : styles.badge}>
            {isLive && <span className={styles.dot} aria-hidden="true" />}
            {t(isLive ? "preset.badge.live" : "preset.badge.nasa")}
          </span>
          {isLive && preset.settings.composer === "ai" && (
            <span className={styles.badgeAi}>AI</span>
          )}
          {playing && (
            <span className={styles.eq} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
        <span className={styles.title}>{t(`${textKey}.title`)}</span>
        <span className={styles.sub}>
          <span>{t(`${textKey}.sub`)}</span>
        </span>
        {playing && <span className="visually-hidden">{t("preset.playing")}</span>}
      </button>
      {disabled && (
        <span id={reasonId} className={styles.reason}>
          <span>{disabled}</span>
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.reason}>
          <span>{error}</span>
        </span>
      )}
      {note && (
        <span id={noteId} className={styles.note}>
          {note}
        </span>
      )}
      {progress && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={busyLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct === undefined ? undefined : Math.round(pct)}
        >
          <span className={styles.progressInner}>
            <svg viewBox="0 0 48 48" className={styles.ring} aria-hidden="true" focusable="false">
              <circle cx="24" cy="24" r="20" fill="none" stroke="var(--stone)" strokeWidth="5" />
              {/* The group turns the start to 12 o'clock; the arc itself may spin inside it. */}
              <g transform="rotate(-90 24 24)">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth="5"
                  className={pct === undefined ? styles.spin : styles.arc}
                  strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - (pct === undefined ? 0.25 : pct / 100))}
                />
              </g>
            </svg>
            <span className={styles.progressText} aria-hidden="true">
              <span className={styles.progressWord}>{busyLabel}</span>
              {pct === undefined ? "" : ` ${Math.round(pct)}%`}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
