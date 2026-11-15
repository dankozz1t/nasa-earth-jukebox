import { useT } from "../../shared/i18n";
import { Icon } from "../../shared/ui";
import styles from "./theme.module.css";
import { setPref, usePrefs } from "./prefs.store";

// The icon shows the theme a press brings: a moon in the light, a sun in the dark.
export function ThemeButton() {
  const { t } = useT();
  const dark = usePrefs((p) => p.theme === "dark");

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={dark}
      aria-label={t("theme.dark")}
      title={t("theme.dark")}
      onClick={() => setPref("theme", dark ? "light" : "dark")}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
