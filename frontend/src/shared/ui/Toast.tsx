import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import styles from "./Toast.module.css";

export interface ToastOptions {
  kind?: "status" | "alert";
  // Shown but not read out: the caller announces the same news in its own words.
  quiet?: boolean;
  action?: { label: string; run(): void };
}
interface ToastItem extends ToastOptions {
  id: number;
  msg: string;
}
interface ToastApi {
  // The same text again replaces the older toast instead of stacking.
  show(msg: string, opts?: ToastOptions): number;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

// Only for a toast without a button: one with an action stays until used or closed (WCAG 2.2.1).
export const LIFETIME_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback(
    (id: number) => {
      window.clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), LIFETIME_MS),
      );
    },
    [dismiss],
  );

  const show = useCallback(
    (msg: string, opts: ToastOptions = {}) => {
      const id = ++next.current;
      setItems((cur) => {
        for (const old of cur) if (old.msg === msg) window.clearTimeout(timers.current.get(old.id));
        return [...cur.filter((x) => x.msg !== msg), { id, msg, ...opts }];
      });
      if (!opts.action) arm(id);
      return id;
    },
    [arm],
  );

  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const id of all.values()) window.clearTimeout(id);
      all.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const hold = (it: ToastItem) =>
    it.action
      ? {}
      : {
          onPointerEnter: () => window.clearTimeout(timers.current.get(it.id)),
          onPointerLeave: () => arm(it.id),
          onFocus: () => window.clearTimeout(timers.current.get(it.id)),
          onBlur: () => arm(it.id),
        };

  const render = (list: ToastItem[]) =>
    list.map((it) => (
      <div key={it.id} className={styles.toast} {...hold(it)}>
        <span>{it.msg}</span>
        {it.action && (
          <>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                it.action!.run();
                dismiss(it.id);
              }}
            >
              {it.action.label}
            </button>
            <button
              type="button"
              className={styles.close}
              aria-label={t("toast.close")}
              title={t("toast.close")}
              onClick={() => dismiss(it.id)}
            >
              <Icon name="x" />
            </button>
          </>
        )}
      </div>
    ));

  // Both live regions are always mounted so screen readers register them before text arrives.
  return (
    <ToastContext value={api}>
      {children}
      <div className={styles.region}>
        <div role="status" aria-live="polite">
          {render(items.filter((i) => i.kind !== "alert" && !i.quiet))}
        </div>
        <div role="alert" aria-live="assertive">
          {render(items.filter((i) => i.kind === "alert" && !i.quiet))}
        </div>
        <div aria-hidden="true">{render(items.filter((i) => i.quiet))}</div>
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
