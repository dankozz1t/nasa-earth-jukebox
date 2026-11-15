import { Component, type ErrorInfo, type ReactNode } from "react";
import { useT } from "../i18n";
import styles from "./ErrorBoundary.module.css";

interface Props {
  children: ReactNode;
  onReset?: () => void;
  // page: the default block. header and bar: one compact row that keeps its place.
  // drawer: a single button where the lazy settings drawer would open. silent: nothing (for no-UI parts).
  variant?: "page" | "header" | "bar" | "drawer" | "silent";
}

// After a redeploy the old hashed chunks are gone: only a reload fetches the new ones.
// Chrome, Firefox and Safari word the failed dynamic import differently.
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i;

export function isChunkError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR.test(error.message);
}

function ErrorFallback({
  variant,
  onRetry,
}: {
  variant: Exclude<Props["variant"], "silent" | undefined>;
  onRetry: () => void;
}) {
  const { t } = useT();

  if (variant === "drawer") {
    return (
      <div role="alert">
        <button type="button" className={styles.button} onClick={onRetry}>
          {t("error.drawer")}
        </button>
      </div>
    );
  }
  return (
    <div role="alert" className={variant === "page" ? undefined : styles[variant]}>
      <p>{t("error.title")}</p>
      <button type="button" className={styles.button} onClick={onRetry}>
        {t("error.retry")}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error("unknown") };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  private reset = () => {
    if (isChunkError(this.state.error)) {
      location.reload();
      return;
    }
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error === null) return this.props.children;
    const variant = this.props.variant ?? "page";
    if (variant === "silent") return null;
    return <ErrorFallback variant={variant} onRetry={this.reset} />;
  }
}
