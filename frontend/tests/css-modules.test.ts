// The pref classes on <html> are global. A bare `.reduce-motion` in a CSS module gets hashed and never
// matches, so every such class must be wrapped in :global(...).

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const GLOBAL_CLASSES = ["reduce-motion", "high-contrast", "readable-font", "color-safe"];

function moduleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return moduleFiles(path);
    return e.name.endsWith(".module.css") ? [path] : [];
  });
}

/** Lines that use a prefs class outside :global(...). */
export function unwrappedGlobals(css: string): string[] {
  const bare = new RegExp(`\\.(${GLOBAL_CLASSES.join("|")})(?![\\w-])`);
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => bare.test(line.replace(/:global\([^)]*\)/g, "")));
}

describe("CSS modules", () => {
  it("the scan catches a bare prefs class and accepts a :global one", () => {
    expect(unwrappedGlobals(":root.reduce-motion .pulse { animation: none; }")).toHaveLength(1);
    expect(unwrappedGlobals(":root:global(.reduce-motion) .pulse { animation: none; }")).toEqual(
      [],
    );
    expect(unwrappedGlobals("/* :root.high-contrast */ .a { color: red; }")).toEqual([]);
  });

  it("prefs classes on <html> are wrapped in :global(...)", () => {
    const found = moduleFiles(SRC).flatMap((f) =>
      unwrappedGlobals(readFileSync(f, "utf-8")).map((l) => `${relative(SRC, f)}: ${l.trim()}`),
    );
    expect(found).toEqual([]);
  });
});
