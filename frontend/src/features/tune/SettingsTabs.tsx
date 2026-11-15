import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../../shared/i18n";
import { Icon, type IconName } from "../../shared/ui";
import styles from "./tune.module.css";

export type TabId = "sound" | "instruments" | "frame" | "more";

interface SettingsTab {
  id: TabId;
  icon: IconName;
  panel: ReactNode;
}

interface SettingsTabsProps {
  tabs: readonly SettingsTab[];
  value: TabId;
  onChange(id: TabId): void;
}

// Only the chosen panel is drawn; what a panel edits lives in its parent, so nothing is lost.
export function SettingsTabs({ tabs, value, onChange }: SettingsTabsProps) {
  const { t } = useT();
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  );
  const active = tabs[current]!;

  function onKeyDown(e: KeyboardEvent) {
    const n = tabs.length;

    let next: number;
    if (e.key === "ArrowRight") next = (current + 1) % n;
    else if (e.key === "ArrowLeft") next = (current - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;

    e.preventDefault();
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <div className={styles.tabsWrap}>
      <div role="tablist" aria-label={t("set.tabs")} className={styles.tabs}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${uid}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={i === current}
            aria-controls={`${uid}-panel-${tab.id}`}
            tabIndex={i === current ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(tab.id)}
            onKeyDown={onKeyDown}
          >
            <Icon name={tab.icon} />
            <span>{t(`set.tab.${tab.id}`)}</span>
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${uid}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${tab.id}`}
          hidden={tab.id !== active.id}
          className={styles.panel}
        >
          {tab.id === active.id && tab.panel}
        </div>
      ))}
    </div>
  );
}
