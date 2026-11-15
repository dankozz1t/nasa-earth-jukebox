import { lazy, Suspense, useId, useRef, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { RouteHeading } from "../../app/RouteHeading";
import { useT } from "../../shared/i18n";
import { rovingIndex } from "../../shared/lib/roving";
import { ErrorBoundary, Icon, type IconName } from "../../shared/ui";
import { SimpleView } from "./SimpleView";
import styles from "./how.module.css";

// The views for scientists and engineers are separate chunks: most visitors never open them, so their
// tables and diagrams cost them nothing.
const ScienceView = lazy(() => import("./science/ScienceView"));
const TechView = lazy(() => import("./tech/TechView"));

export type View = "simple" | "science" | "tech";

// From the least detail to the most.
const VIEWS: { id: View; icon: IconName }[] = [
  { id: "simple", icon: "eye" },
  { id: "science", icon: "flask" },
  { id: "tech", icon: "layers" },
];

// /how?view=<view>, /how#<view> and /how#<view>-<section> open that view.
export function viewFrom(search: string, hash: string): View {
  const param = new URLSearchParams(search).get("view");
  const linked = VIEWS.find((v) => v.id !== "simple" && (param === v.id || hashOf(hash, v.id)));
  return linked?.id ?? "simple";
}

function hashOf(hash: string, view: View): boolean {
  return hash === `#${view}` || hash.startsWith(`#${view}-`);
}

export default function HowPage() {
  const { t } = useT();
  const { search, hash } = useLocation();
  const navigate = useNavigate();
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const view = viewFrom(search, hash);
  const current = VIEWS.findIndex((v) => v.id === view);

  // Replace, not push: switching views is not a new page, and the heading keeps focus rules intact.
  function select(next: View) {
    if (next === view) return;
    const params = new URLSearchParams(search);
    if (next === "simple") params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    void navigate({ search: query ? `?${query}` : "", hash: "" }, { replace: true });
  }

  // Selection follows focus: the views that take longer load behind a short status line.
  function onKeyDown(e: KeyboardEvent) {
    const next = rovingIndex(e.key, current, VIEWS.length);
    if (next === null) return;
    e.preventDefault();
    select(VIEWS[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <article className={styles.page} data-view={view}>
      <RouteHeading className={styles.h1}>{t("how2.title")}</RouteHeading>
      <div role="tablist" aria-label={t("how3.tabs")} className={styles.tabs}>
        {VIEWS.map((v, i) => (
          <button
            key={v.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${uid}-tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={v.id === view}
            aria-controls={`${uid}-panel-${v.id}`}
            tabIndex={v.id === view ? 0 : -1}
            className={styles.tab}
            onClick={() => select(v.id)}
            onKeyDown={onKeyDown}
          >
            <Icon name={v.icon} />
            <span>{t(`how3.tab.${v.id}`)}</span>
          </button>
        ))}
      </div>
      {VIEWS.map((v) => (
        <div
          key={v.id}
          id={`${uid}-panel-${v.id}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${v.id}`}
          hidden={v.id !== view}
          className={styles.panel}
        >
          {v.id === view && v.id === "simple" && <SimpleView />}
          {v.id === view && v.id === "science" && (
            <ErrorBoundary key={view}>
              <Suspense fallback={<p role="status">{t("how3.science.loading")}</p>}>
                <ScienceView />
              </Suspense>
            </ErrorBoundary>
          )}
          {v.id === view && v.id === "tech" && (
            <>
              <p className={styles.techIntro}>{t("how3.tech.intro")}</p>
              <ErrorBoundary key={view}>
                <Suspense fallback={<p role="status">{t("how3.tech.loading")}</p>}>
                  <TechView />
                </Suspense>
              </ErrorBoundary>
            </>
          )}
        </div>
      ))}
    </article>
  );
}
