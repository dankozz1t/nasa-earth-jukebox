/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- a scroll box must be reachable by keyboard (WCAG 2.1.1) */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { UI } from "./content";
import { rich } from "./rich";
import styles from "./tech.module.css";

// The drawing is one image with a text alternative that screen readers get instead; wide ones scroll in their own box.
export function Figure({
  title,
  caption,
  width,
  height,
  description,
  children,
}: {
  title: string;
  caption: string;
  width: number;
  height: number;
  description: ReactNode;
  children: ReactNode;
}) {
  const uid = useId();
  const descId = `${uid}-desc`;
  const scroller = useRef<HTMLDivElement>(null);

  // A drawing wider than its box opens scrolled to its middle, where the system under discussion sits,
  // with the same overflow hidden on both sides. It re-centres on resize until the reader scrolls it.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let touched = false;
    const centre = () => {
      if (!touched) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
    };
    const touch = () => {
      touched = true;
    };
    centre();
    const events = ["pointerdown", "wheel", "keydown", "touchstart"] as const;
    for (const e of events) box.addEventListener(e, touch, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(centre);
    observer?.observe(box);
    return () => {
      for (const e of events) box.removeEventListener(e, touch);
      observer?.disconnect();
    };
  }, []);

  return (
    <figure className={styles.figure}>
      {/* A wide drawing scrolls inside this box, so the box takes focus for keyboard scrolling. */}
      <div
        ref={scroller}
        className={styles.scroller}
        tabIndex={0}
        role="group"
        aria-label={`${title}. ${UI.scroll}`}
      >
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: Math.round(width * 0.8), maxWidth: width }}
          role="img"
          aria-label={title}
          aria-describedby={descId}
          focusable="false"
        >
          {children}
        </svg>
      </div>
      <figcaption className={styles.caption}>
        <strong>{title}.</strong> {rich(caption)}
      </figcaption>
      <div id={descId} className="visually-hidden">
        {description}
      </div>
    </figure>
  );
}

/** Arrow heads, unique per drawing so two drawings on one page never share an id. */
export function Markers({ id }: { id: string }) {
  return (
    <defs>
      <marker
        id={`${id}-arrow`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="9"
        markerHeight="9"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L10 5 L0 10 Z" className={styles.headFill} />
      </marker>
      <marker
        id={`${id}-open`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="9"
        markerHeight="9"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L10 5 L0 10" className={styles.headOpen} />
      </marker>
      <marker
        id={`${id}-tri`}
        viewBox="0 0 12 12"
        refX="12"
        refY="6"
        markerWidth="13"
        markerHeight="13"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L12 6 L0 12 Z" className={styles.headHollow} />
      </marker>
    </defs>
  );
}
