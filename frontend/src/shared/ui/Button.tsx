import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Button.module.css";

type Base = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  variant?: "solid" | "outline" | "ghost";
  icon?: IconName;
  "aria-label"?: string;
};
type IconOnly = Base & { iconOnly: true; icon: IconName; "aria-label": string };
type WithText = Base & { iconOnly?: false };
type ButtonProps = IconOnly | WithText;

export function Button({
  variant = "solid",
  icon,
  iconOnly,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = [styles.button, styles[variant], iconOnly ? styles.iconOnly : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {!iconOnly && children}
    </button>
  );
}
