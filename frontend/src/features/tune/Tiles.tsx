import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../../shared/ui";
import styles from "./tune.module.css";

interface Tile<T extends string> {
  value: T;
  label: string;
  desc?: string;
  icon?: IconName;
  diagram?: ReactNode; // replaces the icon
  badge?: string;
  disabled?: string; // the reason: the tile shows but cannot be chosen
}

interface TilesProps<T extends string> {
  value: T;
  options: Tile<NoInfer<T>>[];
  onChange(v: NoInfer<T>): void;
  label: string;
}

function direction(key: string): 1 | -1 | 0 {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "Home":
      return 1;
    case "ArrowLeft":
    case "ArrowUp":
    case "End":
      return -1;
    default:
      return 0;
  }
}

export function Tiles<T extends string>({ value, options, onChange, label }: TilesProps<T>) {
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKeyDown(e: KeyboardEvent) {
    const dir = direction(e.key);
    if (!dir) return;

    e.preventDefault();
    const n = options.length;
    const from = refs.current.findIndex((el) => el === document.activeElement);

    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else next = (from + dir + n) % n;

    // Selection follows focus, so a disabled tile is skipped.
    for (let tries = 0; options[next]!.disabled && tries < n; tries++) {
      next = (next + dir + n) % n;
    }

    const target = options[next]!;
    if (target.disabled) return;

    onChange(target.value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={styles.tiles}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-disabled={o.disabled ? true : undefined}
          aria-labelledby={`${uid}-l${i}`}
          aria-describedby={`${uid}-d${i}`}
          tabIndex={i === current ? 0 : -1}
          className={styles.tile}
          data-disabled={o.disabled ? "true" : undefined}
          onClick={() => {
            if (!o.disabled) onChange(o.value);
          }}
          onKeyDown={onKeyDown}
        >
          <span
            className={o.diagram ? `${styles.tileMark} ${styles.plate}` : styles.tileMark}
            aria-hidden="true"
          >
            {o.diagram ?? (o.icon && <Icon name={o.icon} size={28} />)}
          </span>
          <span id={`${uid}-l${i}`} className={styles.tileLabel}>
            {o.label}
          </span>
          <span id={`${uid}-d${i}`} className={styles.tileDesc}>
            {o.badge && <b className={styles.tileBadge}>{o.badge}</b>}
            {o.disabled ?? o.desc}
          </span>
        </button>
      ))}
    </div>
  );
}
