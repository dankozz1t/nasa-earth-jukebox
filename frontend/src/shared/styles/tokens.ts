// Mirrored from tokens.css so tests can check contrast in both themes;
// tests/tokens.test.ts fails if the two drift apart.
export const TOKENS: Record<string, string> = {
  ground: "#F4ECDF",
  ink: "#111111",
  "ink-2": "#4A453D",
  stone: "#E2D7C5",
  paper: "#FFFCF7",
  cobalt: "#1F5A32",
  tomato: "#D9573A",
  sun: "#F2B705",
  "on-accent": "#111111",
};

export const TOKENS_DARK: Record<string, string> = {
  ground: "#191C19",
  ink: "#D9CFBF",
  "ink-2": "#A6A093",
  stone: "#343A34",
  paper: "#222622",
  cobalt: "#8DC09A",
  tomato: "#C9786A",
  sun: "#D9B04C",
  "on-accent": "#111111",
  line: "#767369",
};

export const TOKENS_HC: Record<string, string> = {
  ground: "#FFFFFF",
  ink: "#000000",
  "ink-2": "#000000",
  stone: "#FFFFFF",
};
// Dark high contrast stays as harsh as before: pure black and white, the original bright accents.
export const TOKENS_DARK_HC: Record<string, string> = {
  ground: "#000000",
  ink: "#FFFFFF",
  "ink-2": "#FFFFFF",
  stone: "#000000",
  paper: "#000000",
  line: "#FFFFFF",
  cobalt: "#8FCA9E",
  tomato: "#D9573A",
  sun: "#F2B705",
};
