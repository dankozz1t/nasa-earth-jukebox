import type { Texture } from "../access";
import styles from "./tune.module.css";

interface PartSwatchProps {
  color: string;
  texture: Texture;
  off?: boolean;
  size?: number;
}

// The same colour-and-texture square as the player bar's mix chips, so a part looks alike in both places.
export function PartSwatch({ color, texture, off = false, size = 28 }: PartSwatchProps) {
  const marks: string[] = [];
  if (texture === "diagonal" || texture === "cross") {
    marks.push("M-2 12L12 -2M4 18L18 4M10 24L24 10");
  }
  if (texture === "cross") marks.push("M-2 4L12 18M4 -2L18 12M10 -2L24 12");
  if (texture === "horizontal") marks.push("M0 4H20M0 10H20M0 16H20");

  return (
    <svg
      className={styles.swatch}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      data-muted={off || undefined}
    >
      <rect width="20" height="20" fill={off ? "var(--stone)" : color} />
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
