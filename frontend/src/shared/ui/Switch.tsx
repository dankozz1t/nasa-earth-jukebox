import { useId } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Switch.module.css";

interface SwitchProps {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
  icon?: IconName;
  description?: string;
}

export function Switch({ checked, onChange, label, icon, description }: SwitchProps) {
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descId : undefined}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      {icon && <Icon name={icon} />}
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {description && (
          <span id={descId} className={styles.desc}>
            {description}
          </span>
        )}
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </button>
  );
}
