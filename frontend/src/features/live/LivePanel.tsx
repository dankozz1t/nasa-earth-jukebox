import { useEffect, useState } from "react";
import { localizeWarning, useLiveGrid } from "../../shared/api";
import { useT } from "../../shared/i18n";
import { formatTimeLocal, formatTimeUtc } from "../../shared/lib/format";
import { InfoTip } from "../../shared/ui";
import { countdown } from "./model/countdown";
import styles from "./live.module.css";

const TICK_MS = 1000;
const METEO_URL = "https://open-meteo.com/";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);

  return now;
}

// A new tab, so the music playing here does not stop.
function CreditLink({ href, children }: { href: string; children: string }) {
  const { t } = useT();

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> {t("how2.external")}</span>
    </a>
  );
}

// Two lines: whether the music is live and when the reading was taken, then when the next one comes.
// The 30-minute rhythm sits behind the "i". The credit stays in sight: CC BY asks for visible attribution.
export function LivePanel() {
  const { t, lang } = useT();
  const grid = useLiveGrid().data;
  const now = useNow(TICK_MS);

  if (!grid) return null;

  const state = grid.isSnapshot ? "snapshot" : "live";
  const reason = grid.isSnapshot ? grid.notes.map((n) => localizeWarning(n, t)).join(" ") : "";
  const utc = formatTimeUtc(grid.observedAt, lang);
  const wait = countdown(grid.nextUpdateAt, now);

  return (
    <section className={styles.panel} aria-label={t("live.label")} data-state={state}>
      <p className={styles.status}>
        <span className={styles.pulse} data-pulse={state} aria-hidden="true" />
        <span className={styles.label}>{t(grid.isSnapshot ? "live.snapshot" : "live.onAir")}</span>
        <span className="visually-hidden">{t("live.time")}</span>
        <time className={styles.local} dateTime={grid.observedAt}>
          {formatTimeLocal(grid.observedAt, lang)}
        </time>
        <InfoTip label={t("live.tip.label")} side="bottom">
          {grid.isSnapshot
            ? t("live.tip.snapshot", { time: utc, reason })
            : t("live.tip", { time: utc })}
        </InfoTip>
        {reason && <span className="visually-hidden">{reason}</span>}
      </p>
      {!grid.isSnapshot && wait.state !== "unknown" && (
        <p className={styles.next}>
          {wait.state === "updating"
            ? t("live.updating")
            : t("live.next", { minutes: wait.minutes })}
        </p>
      )}
      <p className={styles.credit}>
        {t("live.credit")} <CreditLink href={METEO_URL}>{t("live.credit.source")}</CreditLink> (
        <CreditLink href={LICENSE_URL}>{t("live.credit.license")}</CreditLink>)
      </p>
    </section>
  );
}
