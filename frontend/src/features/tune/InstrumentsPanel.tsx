import { useMemo } from "react";
import { usePlayer, usePosition } from "../../audio/usePlayer";
import type { Soundscape, WeatherSoundscape } from "../../shared/api";
import { layerText, useT } from "../../shared/i18n";
import { Button, Icon, Switch } from "../../shared/ui";
import { summarize } from "../aerosols";
import { isWeather, pieceOnStage, useSession } from "../presets";
import { useMixParts, type MixPart } from "../transport";
import { chordAt, laneLevels } from "./lanes";
import { partIcon } from "./part-icons";
import { PartSwatch } from "./PartSwatch";
import styles from "./tune.module.css";

export function InstrumentsPanel() {
  const { t } = useT();
  const source = useSession((s) => s.source);
  const sounding = useSession((s) => s.soundscape);
  const parts = useMixParts();

  const onStage = pieceOnStage(sounding, source);
  if (!onStage || parts.length === 0) return <p className={styles.note}>{t("set.inst.empty")}</p>;

  return <PartList s={onStage} parts={parts} />;
}

function PartList({ s, parts }: { s: Soundscape | WeatherSoundscape; parts: MixPart[] }) {
  const { t, lang } = useT();
  const muted = useSession((st) => st.muted);
  const toggleMute = useSession((st) => st.toggleMute);
  const solo = useSession((st) => st.solo);

  const lanes = useMemo(() => laneLevels(s), [s]);
  const about = useMemo(
    () => (isWeather(s) ? {} : Object.fromEntries(summarize(s).map((i) => [i.key, i.text]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- summarize reads the language from the i18n module
    [s, lang],
  );

  const { playing } = usePlayer();
  const position = usePosition(4);
  const at =
    playing && s.durationSec > 0 ? Math.max(0, Math.min(1, position / s.durationSec)) : undefined;

  const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 });
  const on = parts.filter((p) => !muted[p.key]);
  const soloKey = parts.length > 1 && on.length === 1 ? on[0]!.key : null;

  // A live part names its instrument; an aerosol layer gives its map share (its paragraph says the rest).
  function instrumentOf(key: string): string | undefined {
    return isWeather(s) ? s.parts.find((p) => p.key === key)?.instrument : undefined;
  }

  function detail(key: string): string {
    if (isWeather(s)) {
      const inst = instrumentOf(key);
      return inst ? t(`w.inst.${inst}`) : "";
    }

    const layer = s.layers.find((l) => l.key === key);
    return layer ? t("set.inst.share", { pct: percent.format(layer.share) }) : layerText(key).voice;
  }

  return (
    <div className={styles.stack}>
      <p className={styles.note}>
        <Icon name="info" size={16} /> {t("set.inst.hint")}
      </p>
      <ChordNow s={s} />
      <ul className={styles.parts}>
        {parts.map((p, i) => {
          const off = muted[p.key] === true;
          const Kind = partIcon(p.key, instrumentOf(p.key));

          return (
            <li key={p.key} className={styles.part} data-off={off}>
              <div className={styles.partHead}>
                <PartSwatch color={p.color} texture={p.texture} off={off} />
                <div className={styles.partToggle}>
                  <Switch
                    label={p.label}
                    description={detail(p.key)}
                    checked={!off}
                    onChange={() => toggleMute(p.key)}
                  />
                </div>
                <Button
                  variant="outline"
                  aria-label={`${t("set.solo")} ${p.label}`}
                  aria-pressed={soloKey === p.key}
                  aria-keyshortcuts={`Shift+${i + 1}`}
                  onClick={() => solo(p.key)}
                >
                  {t("set.solo")}
                </Button>
              </div>
              <div className={styles.partLane}>
                <span className={styles.partKind} aria-hidden="true">
                  <Kind size={18} strokeWidth={2} focusable="false" />
                </span>
                <div className={styles.laneBox}>
                  <div className={styles.laneTrack}>
                    <Lane levels={lanes[p.key] ?? []} color={p.color} off={off} />
                    {at !== undefined && (
                      <span
                        className={styles.playhead}
                        style={{ insetInlineStart: `${at * 100}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>
                <kbd className={styles.key} aria-hidden="true">
                  {i + 1}
                </kbd>
              </div>
              {about[p.key] && <p className={styles.partAbout}>{about[p.key]}</p>}
            </li>
          );
        })}
      </ul>
      {!isWeather(s) && <p className={styles.note}>{t("set.inst.drone")}</p>}
    </div>
  );
}

function Lane({ levels, color, off }: { levels: number[]; color: string; off: boolean }) {
  const w = Math.max(1, levels.length) * 4;

  return (
    <svg
      className={styles.lane}
      viewBox={`0 0 ${w} 24`}
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
      data-off={off}
    >
      {levels.map((v, b) =>
        v > 0 ? (
          <rect
            key={b}
            x={b * 4}
            y={24 - v * 22}
            width="3"
            height={v * 22}
            fill={off ? "var(--stone)" : color}
          />
        ) : null,
      )}
    </svg>
  );
}

function ChordNow({ s }: { s: Soundscape | WeatherSoundscape }) {
  const { t } = useT();
  const { playing } = usePlayer();
  const position = usePosition(4);
  const chord = playing ? chordAt(s, position) : undefined;

  return <p className={styles.chord}>{chord ? t("set.inst.chord", { chord }) : ""}</p>;
}
