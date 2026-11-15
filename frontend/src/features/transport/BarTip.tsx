import type { ReactNode } from "react";
import styles from "./bar.module.css";

interface BarTipProps {
  label: string;
  children: ReactNode;
  align?: "center" | "end";
  className?: string;
}

// The visible name of an icon-only control, shown on hover or keyboard focus. The control keeps its own
// accessible name; this copy is hidden from assistive tech so it is not read twice.
export function BarTip({ label, children, align = "center", className }: BarTipProps) {
  return (
    <span className={[styles.tipped, className].filter(Boolean).join(" ")} data-align={align}>
      {children}
      <span className={styles.tipText} aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
