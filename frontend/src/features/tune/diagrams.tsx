import type { Mode } from "../../shared/api";
import { EarIcon } from "../../shared/ui";
import styles from "./tune.module.css";

function Box({ children, w = 64 }: { children: React.ReactNode; w?: number }) {
  return (
    <svg viewBox={`0 0 ${w} 40`} width={w} height="40" focusable="false" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ModeDiagram({ mode }: { mode: Mode }) {
  if (mode === "raw") {
    return (
      <Box>
        <polyline
          points="2,30 12,12 22,26 32,6 42,24 52,14 62,22"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinejoin="miter"
        />
      </Box>
    );
  }
  if (mode === "scale") {
    return (
      <Box>
        <g stroke="var(--stone)" strokeWidth="2">
          {[8, 16, 24, 32].map((y) => (
            <line key={y} x1="0" x2="64" y1={y} y2={y} />
          ))}
        </g>
        <polyline
          points="2,32 14,32 14,16 28,16 28,24 40,24 40,8 52,8 52,16 62,16"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinejoin="miter"
        />
      </Box>
    );
  }
  return (
    <Box>
      {[
        { x: 4, y: 20, h: 16, f: "var(--ink)" },
        { x: 20, y: 10, h: 26, f: "var(--cobalt)" },
        { x: 36, y: 16, h: 20, f: "var(--sun)" },
        { x: 52, y: 4, h: 32, f: "var(--tomato)" },
      ].map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={b.y}
          width="10"
          height={b.h}
          fill={b.f}
          stroke="var(--ink)"
          strokeWidth="1.5"
        />
      ))}
    </Box>
  );
}

interface StereoDiagramProps {
  stereo: boolean;
  left: string;
  right: string;
  mono: string;
}

export function StereoDiagram({ stereo, left, right, mono }: StereoDiagramProps) {
  const leftFill = stereo ? "var(--cobalt)" : "var(--stone)";
  const rightFill = stereo ? "var(--tomato)" : "var(--stone)";
  return (
    <div className={styles.earsBox} data-stereo={stereo}>
      <svg className={styles.ears} viewBox="0 0 200 60" focusable="false" aria-hidden="true">
        <path
          d="M44 22 Q36 36 44 50 M36 16 Q24 36 36 56"
          fill="none"
          stroke={stereo ? "var(--cobalt)" : "var(--ink)"}
          strokeWidth="2.5"
        />
        <path
          d="M156 22 Q164 36 156 50 M164 16 Q176 36 164 56"
          fill="none"
          stroke={stereo ? "var(--tomato)" : "var(--ink)"}
          strokeWidth="2.5"
        />
        <circle cx="100" cy="36" r="22" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
        <path d="M94 16 L100 8 L106 16" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <rect
          x="70"
          y="27"
          width="9"
          height="18"
          fill={leftFill}
          stroke="var(--ink)"
          strokeWidth="2"
        />
        <rect
          x="121"
          y="27"
          width="9"
          height="18"
          fill={rightFill}
          stroke="var(--ink)"
          strokeWidth="2"
        />
      </svg>
      {/* Headphone cups name the sides: the left cup is the north half, the right cup the south. */}
      <p className={styles.earRow} aria-hidden="true">
        {stereo ? (
          <>
            <span>
              <EarIcon side="left" /> {left}
            </span>
            <span>
              {right} <EarIcon side="right" />
            </span>
          </>
        ) : (
          <span>
            <EarIcon side="left" />
            <EarIcon side="right" /> {mono}
          </span>
        )}
      </p>
    </div>
  );
}

// Twelve columns of a made-up map, from faint to dense aerosol, as fractions of the plot height.
const SAMPLE = [0.15, 0.6, 0.3, 0.85, 0.2, 0.45, 0.7, 0.1, 0.55, 0.35, 0.9, 0.25];
// Lower threshold, more columns heard: "very low" hears only the densest, "very high" almost everything.
const THRESHOLD = [0.75, 0.55, 0.4, 0.25, 0.12];

export function SensitivityDiagram({ level }: { level: number }) {
  const cut = THRESHOLD[Math.max(0, Math.min(THRESHOLD.length - 1, Math.round(level)))]!;
  const h = 48;
  const y = h - cut * h;
  return (
    <svg
      className={styles.sens}
      viewBox={`0 0 ${SAMPLE.length * 16} ${h}`}
      focusable="false"
      aria-hidden="true"
      data-level={level}
    >
      {SAMPLE.map((v, i) => (
        <rect
          key={i}
          x={i * 16 + 2}
          y={h - v * h}
          width="12"
          height={v * h}
          fill={v >= cut ? "var(--ink)" : "var(--stone)"}
          stroke="var(--ink)"
          strokeWidth="1"
          data-heard={v >= cut}
        />
      ))}
      <line
        x1="0"
        x2={SAMPLE.length * 16}
        y1={y}
        y2={y}
        stroke="var(--cobalt)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
    </svg>
  );
}
