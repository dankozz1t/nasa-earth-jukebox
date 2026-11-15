import type { ReactElement } from "react";
import type { CoverId } from "./presets";

// The "print" tokens do not change with the theme, so a sleeve looks the same in light and dark.
const c = {
  cobalt: "var(--print-cobalt)",
  tomato: "var(--tomato)",
  sun: "var(--sun)",
  stone: "var(--print-stone)",
  paper: "var(--print-paper)",
  ink: "var(--print-ink)",
};

function Frame({ bg, children }: { bg: string; children: ReactElement | ReactElement[] }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="120" height="120" fill={bg} />
      {children}
    </svg>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const Rain = () => (
  <Frame bg={c.cobalt}>
    <g stroke={c.paper} strokeWidth="4" strokeLinecap="butt">
      {range(7).map((i) => (
        <line
          key={i}
          x1={14 + i * 15}
          y1={i % 2 ? 24 : 12}
          x2={14 + i * 15}
          y2={i % 2 ? 100 : 88}
        />
      ))}
    </g>
  </Frame>
);

const Heat = () => (
  <Frame bg={c.tomato}>
    <circle cx="60" cy="60" r="30" fill={c.sun} />
  </Frame>
);

const Wind = () => (
  <Frame bg={c.stone}>
    <g fill="none" stroke={c.ink} strokeWidth="5">
      <path d="M0 48 Q15 28 30 48 T60 48 T90 48 T120 48" />
      <path d="M0 80 Q15 60 30 80 T60 80 T90 80 T120 80" />
    </g>
  </Frame>
);

const Clouds = () => (
  <Frame bg={c.paper}>
    <rect x="16" y="26" width="62" height="22" fill={c.stone} />
    <rect x="40" y="56" width="64" height="22" fill={c.ink} opacity="0.35" />
    <rect x="22" y="86" width="44" height="16" fill={c.stone} />
  </Frame>
);

const Ai = () => (
  <Frame bg={c.cobalt}>
    <path d="M60 14 L72 48 L106 60 L72 72 L60 106 L48 72 L14 60 L48 48 Z" fill={c.paper} />
  </Frame>
);

const Four = () => (
  <Frame bg={c.paper}>
    {[c.ink, c.sun, c.cobalt, c.tomato].map((fill, i) => (
      <rect key={i} x={10 + i * 26} y="10" width="22" height="100" fill={fill} />
    ))}
  </Frame>
);

const Scale = () => (
  <Frame bg={c.paper}>
    {range(5).map((i) => (
      <rect
        key={i}
        x={10 + i * 21}
        y={90 - i * 17}
        width="19"
        height={20 + i * 17}
        fill={i === 4 ? c.sun : c.ink}
        stroke={c.ink}
        strokeWidth="2"
      />
    ))}
  </Frame>
);

const Quick = () => (
  <Frame bg={c.sun}>
    <g fill={c.ink}>
      <polygon points="18,28 58,60 18,92" />
      <polygon points="62,28 102,60 62,92" />
    </g>
  </Frame>
);

// The person's own mix ("Create your mix", then "Your mix"): three faders of a mixing desk, each knob at its own height.
const Mix = () => (
  <Frame bg={c.paper}>
    {[
      [28, 44, c.tomato],
      [60, 78, c.sun],
      [92, 30, c.cobalt],
    ].map(([x, y, fill]) => (
      <g key={x as number}>
        <rect x={(x as number) - 3} y="14" width="6" height="92" fill={c.ink} />
        <rect
          x={(x as number) - 13}
          y={(y as number) - 8}
          width="26"
          height="16"
          fill={fill as string}
          stroke={c.ink}
          strokeWidth="3"
        />
      </g>
    ))}
  </Frame>
);

// "custom" is the sleeve of the person's own mix, whichever preset it grew from.
export const COVERS: Record<CoverId | "custom", () => ReactElement> = {
  four: Four,
  scale: Scale,
  quick: Quick,
  rain: Rain,
  heat: Heat,
  wind: Wind,
  clouds: Clouds,
  ai: Ai,
  custom: Mix,
};
