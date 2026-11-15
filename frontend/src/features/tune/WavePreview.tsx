import { useT } from "../../shared/i18n";
import styles from "./tune.module.css";

const W = 240;
const H = 80;
const MID = H / 2;
const SAMPLES = 120;

interface WavePreviewProps {
  cycles: number;
  amplitude: number; // fraction of the maximum latitude, 0.1..1
}

// lat = A·80°·cos(2π·k·t): the formula of the map preview and the sound service.
export function wavePoints(
  cycles: number,
  amplitude: number,
  n = SAMPLES,
): { lat: number; t: number }[] {
  return Array.from({ length: n }, (_, k) => {
    const t = (k + 0.5) / n;
    return { t, lat: amplitude * 80 * Math.cos(2 * Math.PI * cycles * t) };
  });
}

export function WavePreview({ cycles, amplitude }: WavePreviewProps) {
  const { t } = useT();

  const d = wavePoints(cycles, amplitude)
    .map((p, i) => {
      const x = (p.t * W).toFixed(1);
      const y = (MID - (p.lat / 80) * (MID - 4)).toFixed(1);
      return `${i ? "L" : "M"}${x} ${y}`;
    })
    .join("");
  const label = t("tune.wave.label", { cycles, amp: Math.round(amplitude * 100) });

  return (
    <svg
      className={styles.wave}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      focusable="false"
      data-cycles={cycles}
      data-amplitude={amplitude}
    >
      {/* Printed colours: a dark plate with a light line in both themes, like the wave on the map. */}
      <rect width={W} height={H} fill="var(--print-ink)" />
      <line
        x1="0"
        x2={W}
        y1={MID}
        y2={MID}
        stroke="var(--print-paper)"
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--print-paper)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
