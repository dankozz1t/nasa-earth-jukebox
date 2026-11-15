import type { ReactElement, ReactNode } from "react";

// The "print" tokens do not change with the theme: in the dark theme --ink turns light and would vanish
// on sun or tomato.

const c = {
  cobalt: "var(--print-cobalt)",
  tomato: "var(--tomato)",
  sun: "var(--sun)",
  stone: "var(--print-stone)",
  paper: "var(--print-paper)",
  ink: "var(--print-ink)",
};

function Field({ bg, children }: { bg: string; children: ReactNode }) {
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

const Plus = () => (
  <Field bg={c.cobalt}>
    <rect x="50" y="20" width="20" height="80" fill={c.paper} />
    <rect x="20" y="50" width="80" height="20" fill={c.paper} />
  </Field>
);
const Talk = () => (
  <Field bg={c.tomato}>
    <rect x="16" y="22" width="60" height="40" fill={c.ink} />
    <rect x="44" y="52" width="60" height="40" fill={c.paper} stroke={c.ink} strokeWidth="4" />
  </Field>
);
const Tick = () => (
  <Field bg={c.stone}>
    <polyline
      points="22,64 48,90 98,32"
      fill="none"
      stroke={c.ink}
      strokeWidth="14"
      strokeLinejoin="miter"
    />
  </Field>
);
const Note = () => (
  <Field bg={c.sun}>
    <circle cx="46" cy="86" r="18" fill={c.ink} />
    <rect x="60" y="24" width="8" height="64" fill={c.ink} />
    <rect x="60" y="24" width="34" height="12" fill={c.ink} />
  </Field>
);
const Code = () => (
  <Field bg={c.ink}>
    <polyline
      points="46,32 20,60 46,88"
      fill="none"
      stroke={c.paper}
      strokeWidth="9"
      strokeLinejoin="miter"
    />
    <polyline
      points="74,32 100,60 74,88"
      fill="none"
      stroke={c.sun}
      strokeWidth="9"
      strokeLinejoin="miter"
    />
  </Field>
);
const Stack = () => (
  <Field bg={c.paper}>
    {[18, 46, 74].map((y) => (
      <g key={y}>
        <rect x="20" y={y} width="80" height="24" fill={c.cobalt} stroke={c.ink} strokeWidth="3" />
        <circle cx="34" cy={y + 12} r="4" fill={c.sun} />
      </g>
    ))}
  </Field>
);

// In the order of the team: lead, communicator, musician, AI implementer, algorithms, tech lead.
export const MARKS: Array<() => ReactElement> = [Plus, Talk, Note, Code, Stack, Tick];
