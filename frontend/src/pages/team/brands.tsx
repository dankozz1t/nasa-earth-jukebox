import type { ReactElement } from "react";

// Small monochrome marks of the networks the team uses. lucide-react has no brand icons, so they are
// drawn here: currentColor, decorative (the link carries the accessible name).

type Network = "telegram" | "linkedin" | "tiktok";

function Svg({ children }: { children: ReactElement | ReactElement[] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      {children}
    </svg>
  );
}

const Telegram = () => (
  <Svg>
    <path
      fillRule="evenodd"
      d="M21.4 3.2 2.6 10.5c-.8.3-.8 1.4 0 1.7l4.8 1.6 1.8 5.7c.2.7 1.1.9 1.6.4l2.6-2.5 4.9 3.6c.6.4 1.4.1 1.6-.6L22.8 4.6c.2-.9-.6-1.7-1.4-1.4ZM9.5 13.2l8.8-5.6-6.9 6.5-.3 3.3Z"
    />
  </Svg>
);

const LinkedIn = () => (
  <Svg>
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <rect x="6.5" y="10" width="2.2" height="7" />
    <circle cx="7.6" cy="7.4" r="1.3" />
    <path d="M11 10h2.1v1c.4-.7 1.2-1.2 2.3-1.2 2 0 2.6 1.3 2.6 3.1V17h-2.2v-3.7c0-.9-.3-1.5-1.1-1.5-.9 0-1.5.6-1.5 1.6V17H11Z" />
  </Svg>
);

const TikTok = () => (
  <Svg>
    <path
      d="M14 3v11.2a3.2 3.2 0 1 1-3.2-3.2M14 3c.3 2.4 1.9 4 4.5 4.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const BRANDS: Record<Network, { label: string; Mark: () => ReactElement }> = {
  telegram: { label: "Telegram", Mark: Telegram },
  linkedin: { label: "LinkedIn", Mark: LinkedIn },
  tiktok: { label: "TikTok", Mark: TikTok },
};

export type { Network };
