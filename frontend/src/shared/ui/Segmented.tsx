import { useRef, type KeyboardEvent } from "react";
import { rovingIndex } from "../lib/roving";
import { Icon, type IconName } from "./Icon";
import styles from "./Segmented.module.css";

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: NoInfer<T>; label: string; icon?: IconName }[];
  onChange(v: NoInfer<T>): void;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKeyDown(e: KeyboardEvent) {
    const next = rovingIndex(e.key, current, options.length);
    if (next === null) return;

    e.preventDefault();
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={styles.group}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === current ? 0 : -1}
          className={styles.option}
          onClick={() => onChange(o.value)}
          onKeyDown={onKeyDown}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
