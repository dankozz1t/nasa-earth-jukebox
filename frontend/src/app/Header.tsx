import type { MouseEvent } from "react";
import { NavLink, useLocation } from "react-router";
import { AccessButton, setPref, ThemeButton } from "../features/access";
import { ShortcutsDialog } from "../features/help";
import { useSession } from "../features/presets";
import { say, wholeMapText } from "../features/transport";
import { useT, type Lang } from "../shared/i18n";
import { Icon, Segmented } from "../shared/ui";
import styles from "./Header.module.css";

// Each target must be focusable: tabindex -1, or the map explorer itself.
const HOME_SKIPS = [
  { target: "shelf", key: "skip.toShelf" },
  { target: "player", key: "skip.toPlayer" },
  { target: "map-explorer", key: "skip.toMap" },
] as const;

const OTHER_SKIPS = [
  { target: "main", key: "skip.toMain" },
  { target: "player", key: "skip.toPlayer" },
] as const;

// Moves focus without putting a hash into the router's URL.
function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;

  e.preventDefault();
  el.focus();
  el.scrollIntoView?.({ block: "start" });
}

export function SkipLinks() {
  const { t } = useT();
  const home = useLocation().pathname === "/";
  const links = home ? HOME_SKIPS : OTHER_SKIPS;

  return (
    <nav aria-label={t("skip.label")} className={styles.skips}>
      {links.map((l) => (
        <a
          key={l.target}
          href={`#${l.target}`}
          className={styles.skip}
          onClick={(e) => jump(e, l.target)}
        >
          {t(l.key)}
        </a>
      ))}
    </nav>
  );
}

// The Accessibility button comes first in the DOM, so Tab reaches it right after the skip links;
// CSS shows it at the far end.
export function Header() {
  const { t, lang } = useT();
  const hasMap = useSession((s) => s.soundscape !== undefined);

  const describeMap = () => {
    const text = wholeMapText(lang);
    if (text) say(text);
    return text;
  };

  return (
    <header className={styles.header}>
      <div className={styles.access}>
        <AccessButton onDescribeMap={hasMap ? describeMap : undefined} />
      </div>
      <NavLink to="/" end className={styles.logo}>
        {/* Decorative: the wordmark beside it names the link. */}
        <img src="/logo-192.png" alt="" width={40} height={40} className={styles.mark} />
        <span>{t("app.title")}</span>
      </NavLink>
      <nav aria-label={t("nav.sections")} className={styles.nav}>
        <NavLink to="/how" className={styles.navLink} title={t("nav.how")}>
          <Icon name="info" />
          <span className={styles.navText}>{t("nav.how")}</span>
        </NavLink>
        <NavLink to="/team" className={styles.navLink} title={t("nav.team")}>
          <Icon name="users" />
          <span className={styles.navText}>{t("nav.team")}</span>
        </NavLink>
      </nav>
      <div className={styles.lang}>
        <Segmented<Lang>
          label={t("lang.label")}
          value={lang}
          onChange={(v) => setPref("lang", v)}
          options={[
            { value: "uk", label: t("lang.uk") },
            { value: "en", label: t("lang.en") },
          ]}
        />
      </div>
      <div className={styles.theme}>
        <ThemeButton />
      </div>
      <ShortcutsDialog />
    </header>
  );
}
