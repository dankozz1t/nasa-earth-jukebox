import { COVERS } from "../../features/presets/covers";
import { useT } from "../../shared/i18n";
import { Arrow, Art, Dots, INK, wavePath } from "./diagram-parts";
import styles from "./how.module.css";

// One decorative picture per step (see Art): no words, except L and R on the headphones.
// Each drawing is centred in its 240 wide frame.

// Two sleeves, each with its record peeking out on the right, the pair centred (x 10 to 230).
export function RecordsArt() {
  const sleeves = [
    { x: 10, Cover: COVERS.four },
    { x: 118, Cover: COVERS.rain },
  ];
  return (
    <Art>
      {sleeves.map(({ x, Cover }) => (
        <g key={x}>
          <circle cx={x + 70} cy={70} r={42} fill="var(--ink)" />
          <circle cx={x + 70} cy={70} r={10} fill="var(--sun)" />
          <svg x={x} y={18} width={96} height={104}>
            <Cover />
          </svg>
          <rect x={x} y={18} width={96} height={104} fill="none" {...INK} />
        </g>
      ))}
    </Art>
  );
}

// A map with colour patches, a playhead, and the bars it plays: bigger patch longer, further north higher.
export function PictureArt() {
  return (
    <Art>
      <rect x={8} y={14} width={110} height={112} fill="var(--paper)" {...INK} />
      <rect x={30} y={28} width={58} height={28} fill="var(--sun)" />
      <rect x={40} y={86} width={36} height={18} fill="var(--cobalt)" />
      <rect x={20} y={64} width={22} height={14} fill="var(--tomato)" />
      <rect x={56} y={14} width={14} height={112} fill="var(--ink)" fillOpacity={0.16} {...INK} />
      <line x1={126} y1={70} x2={146} y2={70} {...INK} />
      <Arrow x={146} y={70} dir="right" />
      <line x1={166} y1={14} x2={166} y2={126} {...INK} />
      <rect x={166} y={34} width={66} height={16} fill="var(--sun)" {...INK} />
      <rect x={166} y={88} width={30} height={16} fill="var(--cobalt)" {...INK} />
    </Art>
  );
}

// A wave over the weather grid turns into notes on a stave.
export function WeatherArt() {
  const notes = [52, 40, 64, 46, 34];
  return (
    <Art viewBox="1 0 240 140">
      <rect x={8} y={20} width={120} height={100} fill="var(--paper)" {...INK} />
      <Dots x={18} y={30} cols={6} rows={5} step={20} />
      <path
        d={wavePath(8, 30, 120, 80, 1.5, 0.8)}
        fill="none"
        stroke="var(--cobalt)"
        strokeWidth={4}
      />
      <line x1={136} y1={70} x2={150} y2={70} {...INK} />
      <Arrow x={150} y={70} dir="right" />
      {[34, 46, 58, 70, 82].map((y) => (
        <line key={y} x1={166} y1={y} x2={234} y2={y} stroke="var(--ink)" strokeWidth={1} />
      ))}
      {notes.map((y, i) => (
        <g key={i}>
          <ellipse cx={176 + i * 13} cy={y + 12} rx={5} ry={4} fill="var(--ink)" />
          <line x1={181 + i * 13} y1={y + 12} x2={181 + i * 13} y2={y - 10} {...INK} />
        </g>
      ))}
    </Art>
  );
}

// Headphones around the planet: the north half sounds in the left ear, the south half in the right.
export function EarsArt() {
  const { t } = useT();
  return (
    <Art>
      <path d="M44 84 V64 a76 54 0 0 1 152 0 V84" fill="none" stroke="var(--ink)" strokeWidth={6} />
      <path d="M120 40 a30 30 0 0 1 30 30 H90 a30 30 0 0 1 30 -30 Z" fill="var(--cobalt)" />
      <path d="M90 70 H150 a30 30 0 0 1 -60 0 Z" fill="var(--tomato)" />
      <circle cx={120} cy={70} r={30} fill="none" {...INK} />
      <path
        d={wavePath(90, 50, 60, 40, 1, 0.8)}
        fill="none"
        stroke="var(--paper)"
        strokeWidth={3}
      />
      <rect x={24} y={76} width={34} height={46} fill="var(--cobalt)" {...INK} />
      <text x={41} y={106} textAnchor="middle" className={`${styles.artMark} ${styles.markLight}`}>
        {t("how3.ear.l")}
      </text>
      <rect x={182} y={76} width={34} height={46} fill="var(--tomato)" {...INK} />
      <text x={199} y={106} textAnchor="middle" className={`${styles.artMark} ${styles.onAccent}`}>
        {t("how3.ear.r")}
      </text>
    </Art>
  );
}

// Three sources: a satellite for the NASA air map, a globe for the NASA base map, a cloud for the weather.
export function SourcesArt() {
  return (
    <Art viewBox="-3 34 240 90">
      <g>
        <rect x={34} y={52} width={24} height={24} fill="var(--paper)" {...INK} />
        <rect x={8} y={58} width={22} height={12} fill="var(--cobalt)" {...INK} />
        <rect x={62} y={58} width={22} height={12} fill="var(--cobalt)" {...INK} />
        <line x1={46} y1={76} x2={46} y2={88} {...INK} />
        <path d="M36 98 a10 10 0 0 1 20 0" fill="none" {...INK} />
      </g>
      <g>
        <circle cx={120} cy={70} r={30} fill="var(--cobalt)" {...INK} />
        <path d="M100 56 q12 -6 18 4 q-4 10 6 14 q-2 10 -12 8 Z" fill="var(--sun)" />
        <ellipse
          cx={120}
          cy={70}
          rx={12}
          ry={30}
          fill="none"
          stroke="var(--paper)"
          strokeWidth={2}
        />
        <line x1={90} y1={70} x2={150} y2={70} stroke="var(--paper)" strokeWidth={2} />
      </g>
      <g>
        <path
          d="M176 86 a14 14 0 0 1 4 -27 a18 18 0 0 1 34 -4 a14 14 0 0 1 12 31 Z"
          fill="var(--paper)"
          {...INK}
        />
        {[186, 200, 214].map((x) => (
          <line key={x} x1={x} y1={94} x2={x - 4} y2={106} stroke="var(--cobalt)" strokeWidth={3} />
        ))}
      </g>
    </Art>
  );
}

// The grid points are far apart: a small shower falls between them and no point sees it.
export function LimitsArt() {
  return (
    <Art>
      <rect x={8} y={14} width={224} height={112} fill="var(--paper)" {...INK} />
      <Dots x={40} y={40} cols={4} rows={2} step={54} r={5} />
      <path
        d="M98 66 a8 8 0 0 1 3 -15 a10 10 0 0 1 19 -2 a8 8 0 0 1 6 17 Z"
        fill="var(--stone)"
        {...INK}
      />
      {[104, 112, 120].map((x) => (
        <line key={x} x1={x} y1={72} x2={x - 3} y2={82} stroke="var(--cobalt)" strokeWidth={3} />
      ))}
      <circle
        cx={112}
        cy={68}
        r={28}
        fill="none"
        stroke="var(--tomato)"
        strokeWidth={3}
        strokeDasharray="6 4"
      />
    </Art>
  );
}

// Five things to try, in order along a dotted path: pick a record, press play, walk the map, tune, save.
export function TodoArt() {
  return (
    <Art>
      <polyline
        points="48,38 120,38 192,38 156,102 84,102"
        fill="none"
        stroke="var(--ink-2)"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      {[
        [24, 14],
        [96, 14],
        [168, 14],
        [132, 78],
        [60, 78],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={48} height={48} fill="var(--paper)" {...INK} />
      ))}
      <circle cx={48} cy={38} r={16} fill="var(--ink)" />
      <circle cx={48} cy={38} r={5} fill="var(--sun)" />
      <circle cx={120} cy={38} r={17} fill="var(--tomato)" {...INK} />
      <polygon points="114,29 129,38 114,47" fill="var(--on-accent)" />
      <rect x={174} y={22} width={18} height={12} fill="var(--cobalt)" />
      <rect x={192} y={42} width={16} height={10} fill="var(--sun)" />
      <line x1={186} y1={16} x2={186} y2={60} stroke="var(--tomato)" strokeWidth={3} />
      <rect x={181} y={33} width={10} height={10} fill="none" {...INK} />
      {[
        [92, 146],
        [102, 162],
        [112, 152],
      ].map(([y, knob]) => (
        <g key={y}>
          <line x1={140} y1={y} x2={172} y2={y} {...INK} />
          <rect x={knob! - 4} y={y! - 4} width={8} height={8} fill="var(--sun)" {...INK} />
        </g>
      ))}
      <line x1={84} y1={86} x2={84} y2={104} stroke="var(--ink)" strokeWidth={3} />
      <Arrow x={84} y={102} dir="down" />
      <path d="M70 106 V116 H98 V106" fill="none" stroke="var(--ink)" strokeWidth={3} />
    </Art>
  );
}

// One play is one trip: the playhead crosses the map west to east while the sound fills in behind it.
export function TripArt() {
  const bars = Array.from({ length: 27 }, (_, i) => 16 + i * 8);
  return (
    <Art>
      <rect x={8} y={10} width={224} height={70} fill="var(--paper)" {...INK} />
      <ellipse cx={46} cy={36} rx={22} ry={14} fill="var(--cobalt)" />
      <ellipse cx={62} cy={60} rx={12} ry={12} fill="var(--cobalt)" />
      <ellipse cx={124} cy={34} rx={26} ry={12} fill="var(--cobalt)" />
      <ellipse cx={130} cy={58} rx={12} ry={14} fill="var(--cobalt)" />
      <ellipse cx={194} cy={42} rx={24} ry={16} fill="var(--cobalt)" />
      <rect x={104} y={10} width={10} height={70} fill="var(--ink)" fillOpacity={0.16} {...INK} />
      <line x1={16} y1={92} x2={216} y2={92} {...INK} />
      <Arrow x={216} y={92} dir="right" />
      {bars.map((x, i) => {
        const h = 8 + Math.round(16 * Math.abs(Math.sin(i * 0.7)));
        return (
          <rect
            key={x}
            x={x}
            y={117 - h / 2}
            width={4}
            height={h}
            fill={x < 109 ? "var(--ink)" : "var(--ink-2)"}
            fillOpacity={x < 109 ? 1 : 0.35}
          />
        );
      })}
    </Art>
  );
}

// Rules (a pattern) or AI (a spark) write the score, it passes a check, and only then it plays.
export function CheckedArt() {
  return (
    <Art>
      <rect x={8} y={22} width={40} height={40} fill="var(--paper)" {...INK} />
      <Dots x={18} y={32} cols={3} rows={3} step={10} r={2} />
      <rect x={8} y={78} width={40} height={40} fill="var(--paper)" {...INK} />
      <path
        d="M28 84 Q30 96 42 98 Q30 100 28 112 Q26 100 14 98 Q26 96 28 84 Z"
        fill="var(--sun)"
        {...INK}
      />
      <polyline points="52,42 70,70 52,98" fill="none" {...INK} />
      <line x1={70} y1={70} x2={78} y2={70} {...INK} />
      <Arrow x={78} y={70} dir="right" />
      <rect x={94} y={24} width={56} height={88} fill="var(--paper)" {...INK} />
      {[44, 56, 68, 80].map((y) => (
        <line key={y} x1={102} y1={y} x2={142} y2={y} stroke="var(--ink)" strokeWidth={1} />
      ))}
      {[
        [110, 62],
        [122, 50],
        [134, 74],
      ].map(([x, y]) => (
        <g key={x}>
          <ellipse cx={x} cy={y} rx={5} ry={4} fill="var(--ink)" />
          <line x1={x! + 5} y1={y} x2={x! + 5} y2={y! - 18} {...INK} />
        </g>
      ))}
      <circle cx={150} cy={108} r={16} fill="var(--sun)" {...INK} />
      <polyline
        points="142,108 148,114 159,101"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth={4}
      />
      <line x1={170} y1={70} x2={182} y2={70} {...INK} />
      <Arrow x={182} y={70} dir="right" />
      <rect x={196} y={62} width={8} height={16} fill="var(--ink)" />
      <polygon points="204,62 216,52 216,88 204,78" fill="var(--ink)" />
      <path d="M222 60 a12 12 0 0 1 0 20" fill="none" stroke="var(--ink)" strokeWidth={3} />
      <path d="M228 52 a20 20 0 0 1 0 36" fill="none" stroke="var(--ink)" strokeWidth={3} />
    </Art>
  );
}

function Person({ x, h, fill, base = 130 }: { x: number; h: number; fill: string; base?: number }) {
  const top = base - h;
  return (
    <g>
      <path
        d={`M${x - 12} ${base} V${top + 26} a12 12 0 0 1 24 0 V${base} Z`}
        fill={fill}
        {...INK}
      />
      <circle cx={x} cy={top + 8} r={8} fill="var(--paper)" {...INK} />
    </g>
  );
}

// The planet sends sound out to people: one with a white cane, a child, an adult.
export function WhyArt() {
  return (
    <Art>
      <circle cx={120} cy={44} r={24} fill="var(--cobalt)" {...INK} />
      <path d="M104 34 q10 -6 16 3 q-4 9 5 12 q-2 9 -11 7 Z" fill="var(--sun)" />
      {[
        "M88 32 a16 16 0 0 0 0 24",
        "M80 24 a28 28 0 0 0 0 40",
        "M152 32 a16 16 0 0 1 0 24",
        "M160 24 a28 28 0 0 1 0 40",
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--ink)" strokeWidth={3} />
      ))}
      <Person x={40} h={50} fill="var(--cobalt)" />
      <line x1={56} y1={104} x2={66} y2={130} stroke="var(--ink)" strokeWidth={3} />
      <Person x={120} h={36} fill="var(--sun)" />
      <Person x={196} h={48} fill="var(--tomato)" />
    </Art>
  );
}

// Six people under one record: the team.
export function TeamArt() {
  const fills = ["var(--cobalt)", "var(--sun)", "var(--tomato)"];
  return (
    <Art>
      <circle cx={120} cy={40} r={26} fill="var(--ink)" />
      <circle cx={120} cy={40} r={7} fill="var(--sun)" />
      {[30, 66, 102, 138, 174, 210].map((x, i) => (
        <Person key={x} x={x} h={i % 2 ? 44 : 48} fill={fills[i % 3]!} base={126} />
      ))}
    </Art>
  );
}
