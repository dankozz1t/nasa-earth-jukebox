import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { getPlayer } from "../../audio/player-instance";
import { usePlayer, usePosition } from "../../audio/usePlayer";
import { useT } from "../../shared/i18n";
import { formatClock } from "../../shared/lib/format";
import { Icon, InfoTip, Slider, type IconName } from "../../shared/ui";
import { setPref, usePrefs } from "../access";
import { useSession } from "../presets";
import { SaveMenu } from "../save";
import { TuneButton } from "../tune";
import { BarTip } from "./BarTip";
import { MixChips } from "./MixChips";
import { NowSleeve, NowTitle } from "./NowTitle";
import { PlayControl, StopControl } from "./PlayDisc";
import { SoundWaves } from "./SoundWaves";
import { useMixParts } from "./mix-parts";
import { useTransportKeys } from "./useTransportKeys";
import { useTransportSync } from "./useTransportSync";
import styles from "./bar.module.css";

const formatPercent = (v: number) => `${Math.round(v * 100)}%`;
function volumeIcon(v: number): IconName {
  if (v === 0) return "volume-x";
  if (v < 0.5) return "volume-1";
  return "volume-2";
}

// Keeps `--player-h` on <html> equal to the bar's height, so the page's bottom padding clears it.
function usePublishHeight(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      root.style.setProperty("--player-h", `${height}px`);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      root.style.removeProperty("--player-h");
    };
  }, [ref]);
}

function useDismiss(
  open: boolean,
  close: () => void,
  toggle: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;

    const onPointerAway = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !toggle.current?.contains(target)) close();
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      toggle.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerAway);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, close, toggle, panel]);
}

// Its own component, so only it re-renders with the position.
function SeekSlider() {
  const { t } = useT();
  const { ready, duration } = usePlayer();
  const position = usePosition(10);
  const [scrub, setScrub] = useState<number | null>(null);
  const max = ready && duration > 0 ? duration : 1;
  const seekValue = scrub ?? Math.min(position, max);

  return (
    <Slider
      inline
      label={t("transport.seek")}
      value={ready ? seekValue : 0}
      min={0}
      max={max}
      step={0.5}
      valueText={formatClock}
      suffix={formatClock(ready ? duration : 0)}
      onChange={setScrub}
      onCommit={(v) => {
        setScrub(null);
        if (getPlayer().ready) getPlayer().seek(v);
      }}
    />
  );
}

export function TransportBar() {
  const { t } = useT();
  const volume = usePrefs((p) => p.volume);
  const muted = useSession((s) => s.muted);
  const toggleMute = useSession((s) => s.toggleMute);
  const solo = useSession((s) => s.solo);
  const parts = useMixParts();

  const toolsId = useId();
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsToggle = useRef<HTMLButtonElement>(null);
  const toolsPanel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const closeTools = useCallback(() => setToolsOpen(false), []);

  const [dragVolume, setDragVolume] = useState<number | null>(null);

  useTransportKeys(parts);
  useTransportSync();
  usePublishHeight(bar);
  useDismiss(toolsOpen, closeTools, toolsToggle, toolsPanel);

  const shownVolume = dragVolume ?? volume;

  return (
    <section
      ref={bar}
      id="player"
      tabIndex={-1}
      className={styles.bar}
      aria-label={t("transport.label")}
    >
      <div className={styles.inner}>
        <div className={styles.deck}>
          <NowSleeve />
          <PlayControl />
          <StopControl />
        </div>

        <NowTitle />

        <div className={styles.seek}>
          <SeekSlider />
        </div>

        <div className={styles.wavesSlot}>
          <SoundWaves />
        </div>

        {/* The toggle comes right before what it opens, so Tab reaches the volume and the chips next. */}
        <BarTip label={t("player.tools")} className={styles.toolsTip}>
          <button
            ref={toolsToggle}
            type="button"
            className={styles.toolsToggle}
            aria-expanded={toolsOpen}
            aria-controls={toolsId}
            onClick={() => setToolsOpen((o) => !o)}
          >
            <Icon name="layers" />
            <span className={styles.toolsText}>{t("player.tools")}</span>
          </button>
        </BarTip>

        <div
          ref={toolsPanel}
          id={toolsId}
          className={styles.tools}
          data-open={toolsOpen || undefined}
        >
          <div className={styles.volume}>
            <Icon name={volumeIcon(shownVolume)} />
            <Slider
              inline
              label={t("vol.label")}
              value={shownVolume}
              min={0}
              max={1}
              step={0.05}
              valueText={formatPercent}
              onChange={(v) => {
                setDragVolume(v);
                getPlayer().setVolume(v);
              }}
              onCommit={(v) => {
                setDragVolume(null);
                setPref("volume", v);
              }}
            />
          </div>
          {parts.length > 0 && (
            <div className={styles.mix}>
              <p className={styles.mixHead}>
                <span>{t("mix.hint")}</span>
                <InfoTip label={t("mix.tip.label")}>{t("mix.tip")}</InfoTip>
              </p>
              <MixChips parts={parts} muted={muted} onToggle={toggleMute} onSolo={solo} />
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <BarTip label={t("tune.open")} align="end">
            <TuneButton />
          </BarTip>
          <BarTip label={t("save.open")} align="end">
            <SaveMenu />
          </BarTip>
        </div>
      </div>
    </section>
  );
}
