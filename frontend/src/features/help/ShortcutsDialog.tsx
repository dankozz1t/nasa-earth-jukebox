import { useT } from "../../shared/i18n";
import { useOverlay } from "../../shared/lib/overlays";
import { Drawer } from "../../shared/ui";
import { HOTKEYS } from "./hotkeys";
import { useHelpKeys } from "./useHelpKeys";
import styles from "./help.module.css";

export function ShortcutsDialog() {
  const { t } = useT();
  const open = useOverlay((s) => s.open === "shortcuts");
  const hide = useOverlay((s) => s.hide);
  useHelpKeys();

  return (
    <Drawer open={open} onClose={() => hide("shortcuts")} side="right" title={t("help.title")}>
      {/* Not rendered while closed, so the page holds no second copy of the labels. */}
      {open && (
        <>
          <p className={styles.note}>{t("help.note")}</p>
          <dl className={styles.list}>
            {HOTKEYS.map((row) => (
              <div key={row.id} className={styles.row} data-hotkey={row.id}>
                <dt className={styles.caps}>
                  {row.caps.map((cap) => (
                    <kbd key={cap} className={styles.cap}>
                      {cap.startsWith("@") ? t(cap.slice(1)) : cap}
                    </kbd>
                  ))}
                </dt>
                <dd className={styles.label}>{t(row.label)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Drawer>
  );
}
