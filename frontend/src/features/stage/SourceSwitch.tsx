import { useId, useRef, type KeyboardEvent } from "react";
import { useT } from "../../shared/i18n";
import { formatDateUtc } from "../../shared/lib/format";
import { rovingIndex } from "../../shared/lib/roving";
import { Icon, type IconName } from "../../shared/ui";
import type { Source } from "../presets";
import styles from "./stage.module.css";

interface SourceSwitchProps {
  value: Source;
  onChange(source: Source): void;
  nasaTimestamp?: string;
}

const ORDER: Source[] = ["nasa", "live"];
const ICON: Record<Source, IconName> = { nasa: "image", live: "radio" };

export function SourceSwitch({ value, onChange, nasaTimestamp }: SourceSwitchProps) {
  const { t, lang } = useT();
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = ORDER.indexOf(value);

  const date = nasaTimestamp ? formatDateUtc(nasaTimestamp, lang) : "";
  const sub: Record<Source, string> = {
    nasa: date ? t("source.nasa.sub", { date }) : t("source.nasa.frame"),
    live: t("source.live.every"),
  };

  function onKeyDown(e: KeyboardEvent) {
    const next = rovingIndex(e.key, current, ORDER.length);
    if (next === null) return;

    e.preventDefault();
    onChange(ORDER[next]);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={t("source.label")} className={styles.sources}>
      {ORDER.map((source, i) => (
        <button
          key={source}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={source === value}
          aria-labelledby={`${base}-${source}-name`}
          aria-describedby={`${base}-${source}-sub`}
          tabIndex={source === value ? 0 : -1}
          className={styles.source}
          data-source={source}
          onClick={() => onChange(source)}
          onKeyDown={onKeyDown}
        >
          <Icon name={ICON[source]} />
          <span className={styles.sourceText}>
            <span id={`${base}-${source}-name`} className={styles.sourceName}>
              {t(`source.${source}`)}
            </span>
            <span id={`${base}-${source}-sub`} className={styles.sourceSub}>
              {sub[source]}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
