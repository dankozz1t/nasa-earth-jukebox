import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useT } from "../../shared/i18n";
import { Button } from "./Button";
import styles from "./Drawer.module.css";

interface DrawerProps {
  open: boolean;
  onClose(): void;
  title: string;
  side: "right";
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// showModal gives inertness; Tab is also wrapped here so the trap holds in every browser.
export function Drawer({ open, onClose, title, side, children, returnFocusRef }: DrawerProps) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      (returnFocusRef?.current ?? opener.current)?.focus();
    }
  }, [open, returnFocusRef]);

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    // A modal <dialog> is natively interactive; the handlers wrap Escape and Tab for the focus trap.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={`${styles.drawer} ${styles[side]}`}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.inner}>
        {/* A div, not <header>: inside the page it would be a second banner landmark. */}
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button
            variant="ghost"
            iconOnly
            icon="x"
            aria-label={t("help.close")}
            onClick={onClose}
          />
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
