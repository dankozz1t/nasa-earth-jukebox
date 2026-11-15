import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast } from "../src/shared/styles/contrast";
import { TOKENS, TOKENS_DARK, TOKENS_DARK_HC, TOKENS_HC } from "../src/shared/styles/tokens";

/** Text/background pairs in use. Text on tomato and sun is always `on-accent`. */
const PAIRS = [
  ["ink", "ground"],
  ["ink-2", "ground"],
  ["ink", "paper"],
  ["ink-2", "paper"],
  ["ink", "stone"],
  ["ground", "ink"], // captions, checked radios
  ["ground", "cobalt"],
  ["cobalt", "ground"], // links
  ["cobalt", "paper"],
  ["paper", "cobalt"], // words on the cobalt boxes of the How diagrams
  ["on-accent", "tomato"],
  ["on-accent", "sun"],
] as const;

const THEMES = {
  light: TOKENS,
  dark: TOKENS_DARK,
  "light high contrast": { ...TOKENS, ...TOKENS_HC },
  "dark high contrast": { ...TOKENS_DARK, ...TOKENS_DARK_HC },
} as const;

const css = readFileSync("src/shared/styles/tokens.css", "utf8");

/** The declarations of one rule in tokens.css, by its exact selector. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("token contrast", () => {
  describe.each(Object.entries(THEMES))("%s", (_, tokens) => {
    it.each(PAIRS)("%s on %s >= 4.5:1", (fg, bg) => {
      expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("white on tomato is not a token pair in use", () => {
    expect(contrast("#FFFFFF", TOKENS.tomato!)).toBeLessThan(4.5);
  });

  it("the dark theme's ink would fail on tomato, so text there uses on-accent", () => {
    expect(contrast(TOKENS_DARK.ink!, TOKENS_DARK.tomato!)).toBeLessThan(4.5);
    expect(contrast(TOKENS_DARK["on-accent"]!, TOKENS_DARK.tomato!)).toBeGreaterThanOrEqual(4.5);
  });

  it("the dark theme is low-glare: tinted charcoal, not black, and cream ink, not white", () => {
    expect(TOKENS_DARK.ground).not.toBe("#000000");
    expect(TOKENS_DARK.ink).not.toBe("#FFFFFF");
    // Comfortable, not harsh: well above AA for body text, well below black-on-white.
    const body = contrast(TOKENS_DARK.ink!, TOKENS_DARK.ground!);
    expect(body).toBeGreaterThanOrEqual(7);
    expect(body).toBeLessThan(15);
  });

  it("the dark theme's softer frame line still marks a control's edge (3:1, WCAG 1.4.11)", () => {
    expect(contrast(TOKENS_DARK.line!, TOKENS_DARK.ground!)).toBeGreaterThanOrEqual(3);
    expect(contrast(TOKENS_DARK.line!, TOKENS_DARK.paper!)).toBeGreaterThanOrEqual(3);
    expect(contrast(TOKENS_DARK.line!, TOKENS_DARK.ground!)).toBeLessThan(
      contrast(TOKENS_DARK.ink!, TOKENS_DARK.ground!),
    );
  });

  it("dark high contrast stays harsh: black, white and the bright accents", () => {
    const hc = { ...TOKENS_DARK, ...TOKENS_DARK_HC };
    expect(hc.ground).toBe("#000000");
    expect(hc.ink).toBe("#FFFFFF");
    expect(hc.line).toBe("#FFFFFF");
    expect(contrast(hc.ink!, hc.ground!)).toBe(21);
  });

  it.each([
    [":root", TOKENS],
    [':root[data-theme="dark"]', TOKENS_DARK],
    [":root.high-contrast", TOKENS_HC],
    [':root[data-theme="dark"].high-contrast', TOKENS_DARK_HC],
  ] as const)("matches the CSS custom properties of %s in tokens.css", (selector, tokens) => {
    const rule = block(selector);
    for (const [name, hex] of Object.entries(tokens)) {
      if (name === "on-accent" && selector !== ":root") continue; // set once, shared by both themes
      expect(rule).toMatch(new RegExp(`--${name}:\\s*${hex}\\b`, "i"));
    }
  });
});
