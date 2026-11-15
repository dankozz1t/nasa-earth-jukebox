import { useEffect, useRef, useState } from "react";
import { usePlayer, usePosition } from "../../audio/usePlayer";
import { useT } from "../../shared/i18n";
import { formatTimeLocal } from "../../shared/lib/format";
import { captionLines } from "../aerosols";
import { usePrefs } from "../access";
import { weatherCaptionLines } from "../live/model/describe-weather";
import { isWeather, useSession } from "../presets";
import { audible, currentStep } from "../stage";
import styles from "./transport.module.css";

const NEW_DATA_CAPTION_SEC = 6;

// Not a live region: the "now" line speaks. When off, nothing is mounted, so nothing re-renders with
// the position.
export function Captions() {
  const visible = usePrefs((p) => p.captions);

  return visible ? <CaptionLines /> : null;
}

function CaptionLines() {
  const { t, lang } = useT();
  const muted = useSession((s) => s.muted);
  const s = useSession((s) => s.soundscape);
  const { playing } = usePlayer();
  const position = usePosition(10);

  const [seen, setSeen] = useState(s);
  const [freshAt, setFreshAt] = useState<string | null>(null);
  if (s !== seen) {
    const newerReading =
      s && seen && isWeather(s) && isWeather(seen) && s.observedAt !== seen.observedAt;
    setSeen(s);
    setFreshAt(newerReading ? s.observedAt : null);
  }

  let lines: string[] = [];
  if (s && playing) {
    if (isWeather(s)) {
      lines = weatherCaptionLines(s, position, lang, muted);
      if (freshAt === s.observedAt && position < NEW_DATA_CAPTION_SEC) {
        lines = [t("captions.newData", { time: formatTimeLocal(freshAt, lang) }), ...lines];
      }
    } else {
      const step = currentStep(s, position, true);
      if (step >= 0) lines = captionLines(audible(s, muted), step);
    }
  }

  const { box, content, scrolls } = useOverflow();

  // A box of fixed height: lines come and go inside it and the page around never moves. When they do not
  // fit, the box scrolls and takes keyboard focus so it can be scrolled without a mouse.
  return (
    <section
      ref={box}
      className={styles.captions}
      aria-label={t("captions.label")}
      // A box that scrolls must be reachable from the keyboard (axe: scrollable-region-focusable).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={scrolls ? 0 : undefined}
    >
      <div ref={content}>
        {lines.length ? (
          <ul>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>{t("captions.idle")}</p>
        )}
      </div>
    </section>
  );
}

// Whether the content is taller than its box. Measured on resize only, not on every position tick.
function useOverflow() {
  const box = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const outer = box.current;
    const inner = content.current;
    if (!outer || !inner || typeof ResizeObserver === "undefined") return;

    const check = () => setScrolls(inner.offsetHeight > outer.clientHeight + 1);
    const ro = new ResizeObserver(check);
    ro.observe(inner);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  return { box, content, scrolls };
}
