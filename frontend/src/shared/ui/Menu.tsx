import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Menu.module.css";

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  href?: string; // a download link the browser follows; `onSelect` is optional
  download?: string;
  onSelect?(): void;
}

interface MenuProps {
  label: string;
  items: MenuItem[];
  id?: string;
  icon?: IconName;
  disabledReason?: string;
}

export function Menu({ label, items, id, icon, disabledReason }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();
  const reasonId = useId();

  // Close now, so the list does not come back by itself once the menu is available again.
  if (disabledReason && open) setOpen(false);

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerAway = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerAway);
    return () => document.removeEventListener("pointerdown", onPointerAway);
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const idx = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    }
    // Space does not activate a link; the menu pattern expects Enter and Space on every item.
    else if (e.key === " " && e.currentTarget instanceof HTMLAnchorElement) {
      e.preventDefault();
      e.currentTarget.click();
    } else if (e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      itemRefs.current[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itemRefs.current[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itemRefs.current[items.length - 1]?.focus();
    }
  }

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        ref={button}
        id={id}
        type="button"
        className={styles.trigger}
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? reasonId : undefined}
        title={disabledReason}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon && <Icon name={icon} />}
        {label}
      </button>
      {disabledReason && (
        <span id={reasonId} className="visually-hidden">
          {disabledReason}
        </span>
      )}
      {open && !disabledReason && (
        <div id={menuId} role="menu" aria-label={label} className={styles.menu}>
          {items.map((it, i) => {
            const common = {
              ref: (el: HTMLElement | null) => {
                itemRefs.current[i] = el;
              },
              role: "menuitem",
              className: styles.item,
              onKeyDown,
              // A link must still be in the page when the browser acts on its click (the download), so the menu
              // closes right after that click, not inside it.
              onClick: it.href
                ? () => {
                    it.onSelect?.();
                    window.setTimeout(() => close(true), 0);
                  }
                : () => {
                    close(true);
                    it.onSelect?.();
                  },
            };
            const content = (
              <>
                {it.icon && <Icon name={it.icon} />}
                {it.label}
              </>
            );
            return it.href ? (
              <a key={it.id} {...common} href={it.href} download={it.download}>
                {content}
              </a>
            ) : (
              <button key={it.id} {...common} type="button">
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
