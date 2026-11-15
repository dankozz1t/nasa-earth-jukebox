import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Info } from "lucide-react";
import styles from "./InfoTip.module.css";

interface InfoTipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}

// A small "i" button: hover, focus or tap shows a short explanation, Escape or a tap outside hides it.
export function InfoTip({ label, children, side = "top" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setPinned(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      setOpen(false);
      setPinned(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => {
    if (!pinned) setOpen(false);
  };
  const toggle = () => {
    setPinned(!pinned);
    setOpen(!pinned);
  };
  // Escape on the "i" closes only the note: inside a drawer it must not close the drawer as well.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Escape" || !open) return;
    e.preventDefault(); // a modal <dialog> would also take the key as its close request
    e.stopPropagation();
    setOpen(false);
    setPinned(false);
  };

  return (
    <span ref={root} className={styles.root} onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={tipId}
        onClick={toggle}
        onKeyDown={onKeyDown}
        onFocus={show}
        onBlur={hide}
      >
        <Info aria-hidden="true" focusable="false" size={14} strokeWidth={2.25} />
      </button>
      <span id={tipId} role="tooltip" className={styles.tip} data-side={side} hidden={!open}>
        {children}
      </span>
    </span>
  );
}
