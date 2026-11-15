interface EarIconProps {
  side: "left" | "right";
  size?: number;
}

// Headphones seen from the front, as the person wears them: the cup on the side it stands for is solid,
// the other one faint, so "left headphone" reads without a letter.
export function EarIcon({ side, size = 20 }: EarIconProps) {
  const cups = [
    { x: 2.5, on: side === "left" },
    { x: 15.5, on: side === "right" },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-ear={side}
    >
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      {cups.map((c) => (
        <rect
          key={c.x}
          x={c.x}
          y={12.5}
          width={6}
          height={9}
          rx={2}
          fill={c.on ? "currentColor" : "none"}
          opacity={c.on ? 1 : 0.45}
        />
      ))}
    </svg>
  );
}
