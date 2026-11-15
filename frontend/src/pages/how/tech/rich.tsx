import { Fragment, type ReactNode } from "react";
import type { Rich } from "./model";

export function rich(text: Rich): ReactNode {
  const parts = text.split("`");
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function plain(text: Rich): string {
  return text.replaceAll("`", "");
}
