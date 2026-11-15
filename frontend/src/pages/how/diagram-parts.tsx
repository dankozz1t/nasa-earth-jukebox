import type { ReactNode } from "react";
import styles from "./how.module.css";

// The simple view's pictures repeat what the two lines next to them say, so they are hidden from
// assistive tech: a screen reader hears the heading and the lines once, not a second description.

export const INK = { stroke: "var(--ink)", strokeWidth: 2 } as const;

export function Art({
  viewBox = "0 0 240 140",
  children,
}: {
  viewBox?: string;
  children: ReactNode;
}) {
  return (
    <svg className={styles.art} viewBox={viewBox} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function Arrow({ x, y, dir }: { x: number; y: number; dir: "right" | "up" | "down" }) {
  const points = {
    right: `${x},${y - 6} ${x + 10},${y} ${x},${y + 6}`,
    up: `${x - 6},${y} ${x},${y - 10} ${x + 6},${y}`,
    down: `${x - 6},${y} ${x},${y + 10} ${x + 6},${y}`,
  }[dir];
  return <polygon points={points} fill="var(--ink)" />;
}

export function wavePath(
  x: number,
  y: number,
  w: number,
  h: number,
  swings: number,
  reach: number,
): string {
  const steps = 72;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const px = x + (w * i) / steps;
    const py = y + h / 2 - (reach * h * Math.cos(2 * Math.PI * swings * (i / steps))) / 2;
    return `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(" ");
}

// A patch of the weather grid: `cols` by `rows` dots, `step` apart.
export function Dots({
  x,
  y,
  cols,
  rows,
  step,
  r = 2,
}: {
  x: number;
  y: number;
  cols: number;
  rows: number;
  step: number;
  r?: number;
}) {
  return (
    <>
      {Array.from({ length: cols * rows }, (_, i) => (
        <rect
          key={i}
          x={x + (i % cols) * step - r}
          y={y + Math.floor(i / cols) * step - r}
          width={r * 2}
          height={r * 2}
          fill="var(--ink-2)"
        />
      ))}
    </>
  );
}
