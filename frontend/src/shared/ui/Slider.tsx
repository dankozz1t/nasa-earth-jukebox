import { useId, useRef } from "react";
import styles from "./Slider.module.css";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
  onCommit?(v: number): void;
  label: string;
  valueText(v: number): string;
  inline?: boolean; // one compact row: the label is read but not shown
  suffix?: string;
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  label,
  valueText,
  inline,
  suffix,
}: SliderProps) {
  const id = useId();
  // Commit once per change burst. Blur covers assistive-tech adjustments (swipe-to-adjust, voice control)
  // that emit neither pointer nor arrow keys.
  const dirty = useRef(false);
  const commit = (el: HTMLInputElement) => {
    if (!dirty.current) return;
    dirty.current = false;
    onCommit?.(Number(el.value));
  };
  // Not an <output>: that is a live region and would announce every tick. The input carries aria-valuetext.
  const output = (
    <span className={styles.value} aria-hidden="true">
      {valueText(value)}
    </span>
  );
  const input = (
    <input
      id={id}
      type="range"
      className={styles.range}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-valuetext={valueText(value)}
      onChange={(e) => {
        dirty.current = true;
        onChange(Number(e.currentTarget.value));
      }}
      onPointerUp={(e) => commit(e.currentTarget)}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyUp={(e) => {
        if (
          e.key.startsWith("Arrow") ||
          e.key === "Home" ||
          e.key === "End" ||
          e.key.startsWith("Page")
        )
          commit(e.currentTarget);
      }}
    />
  );

  if (inline) {
    return (
      <div className={styles.inline}>
        <label htmlFor={id} className="visually-hidden">
          {label}
        </label>
        {output}
        {input}
        {suffix !== undefined && (
          <span className={styles.value} aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={styles.wrap}>
      <div className={styles.label}>
        <label htmlFor={id}>{label}</label>
        {output}
      </div>
      {input}
    </div>
  );
}
