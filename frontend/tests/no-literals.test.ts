// No interface strings written straight into .tsx: every word a person reads comes from t().
// The files are parsed with the TypeScript compiler so generics are not mistaken for JSX.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const WORD = /[A-Za-zА-Яа-яІіЇїЄєҐґ]{3,}/;
/** Attributes whose string value a person reads or hears. */
const TEXT_ATTRS = new Set([
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "aria-roledescription",
  "title",
  "alt",
  "placeholder",
  "label",
]);
const WHITELIST: string[] = [];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith(".tsx") ? [path] : [];
  });
}

/** String literals an expression can render: itself, or the branches of `?:`, `&&`, `||`, `??`. */
function rendered(e: ts.Expression | undefined): string[] {
  if (!e) return [];
  if (ts.isStringLiteralLike(e)) return [e.text];
  if (ts.isParenthesizedExpression(e)) return rendered(e.expression);
  if (ts.isConditionalExpression(e)) return [...rendered(e.whenTrue), ...rendered(e.whenFalse)];
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return rendered(e.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
      return [...rendered(e.left), ...rendered(e.right)];
  }
  return [];
}

function literals(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const where = (node: ts.Node) =>
    `${relative(SRC, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && WORD.test(node.text))
      found.push(`${where(node)} text "${node.text.trim()}"`);
    if (ts.isJsxAttribute(node) && node.initializer && TEXT_ATTRS.has(node.name.getText(source))) {
      const init = node.initializer;
      const values = ts.isStringLiteral(init)
        ? [init.text]
        : ts.isJsxExpression(init)
          ? rendered(init.expression)
          : [];
      for (const v of values)
        if (WORD.test(v)) found.push(`${where(node)} ${node.name.getText(source)}="${v}"`);
    }
    if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      for (const v of rendered(node.expression))
        if (WORD.test(v)) found.push(`${where(node)} {"${v}"}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("no interface literals in .tsx", () => {
  it("finds the components to check", () => {
    expect(tsxFiles(SRC).length).toBeGreaterThan(20);
  });

  it("has no JSX text or readable attribute with a word of 3+ letters outside t()", () => {
    const hits = tsxFiles(SRC)
      .flatMap(literals)
      .filter((hit) => !WHITELIST.some((w) => hit.includes(w)));
    expect(hits).toEqual([]);
  });
});
