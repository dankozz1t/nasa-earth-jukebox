import { useT } from "../../shared/i18n";
import type { Texture } from "../access";
import type { MixPart } from "./mix-parts";
import styles from "./transport.module.css";

interface MixChipsProps {
  parts: readonly MixPart[];
  muted: Readonly<Record<string, boolean>>;
  onToggle(key: string): void;
  onSolo(key: string): void;
}

function Swatch({ color, texture }: { color: string; texture: Texture }) {
  const marks: string[] = [];
  if (texture === "diagonal" || texture === "cross") {
    marks.push("M-2 12L12 -2M4 18L18 4M10 24L24 10");
  }
  if (texture === "cross") marks.push("M-2 4L12 18M4 -2L18 12M10 -2L24 12");
  if (texture === "horizontal") marks.push("M0 4H20M0 10H20M0 16H20");

  return (
    <svg
      className={styles.swatch}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="20" height="20" fill={color} />
      {marks.map((d) => (
        <g key={d} fill="none" strokeLinecap="square">
          <path d={d} stroke="var(--paper)" strokeWidth="3" />
          <path d={d} stroke="var(--ink)" strokeWidth="1" />
        </g>
      ))}
      {texture === "dots" &&
        [5, 15].flatMap((x) =>
          [5, 15].map((y) => (
            <circle
              key={`${x}${y}`}
              cx={x}
              cy={y}
              r="2"
              fill="var(--ink)"
              stroke="var(--paper)"
              strokeWidth="1"
            />
          )),
        )}
    </svg>
  );
}

// Click mutes, Shift+click solos. A muted chip is dashed and struck through, so it differs without colour.
export function MixChips({ parts, muted, onToggle, onSolo }: MixChipsProps) {
  const { t } = useT();

  return (
    <ul className={styles.chips} aria-label={t("mix.label")}>
      {parts.map((p, i) => {
        const off = muted[p.key] === true;

        return (
          <li key={p.key}>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={!off}
              aria-keyshortcuts={`${i + 1} Shift+${i + 1}`}
              data-off={off}
              style={off ? { borderStyle: "dashed", textDecoration: "line-through" } : undefined}
              onClick={(e) => {
                if (e.shiftKey) onSolo(p.key);
                else onToggle(p.key);
              }}
            >
              <Swatch color={p.color} texture={p.texture} />
              <span>{p.label}</span>
              <kbd className={styles.key} aria-hidden="true">
                {i + 1}
              </kbd>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
