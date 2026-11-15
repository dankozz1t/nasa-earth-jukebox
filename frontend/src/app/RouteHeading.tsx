import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useT } from "../shared/i18n";

// True once the pathname has changed at least once, so the first load never steals focus
// (also when Back returns to the page the visit began on).
const NavigatedContext = createContext(false);

export function RouteFocus({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [seen, setSeen] = useState(pathname);
  const [navigated, setNavigated] = useState(false);
  if (pathname !== seen) {
    setSeen(pathname);
    setNavigated(true);
  }
  return <NavigatedContext value={navigated}>{children}</NavigatedContext>;
}

// Takes focus after in-app navigation to another page (PUSH, or Back and Forward), never on first load,
// on a replace or on a same-page change like the ?p= sync. Also names the tab.
export function RouteHeading({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { t, lang } = useT();
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const navigated = useContext(NavigatedContext);

  // A page's heading mounts, or sees a new pathname, exactly when the page changes.
  useEffect(() => {
    if (navigated && navigationType !== "REPLACE") ref.current?.focus();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const app = t("app.title");
    document.title = children === app ? app : t("app.pageTitle", { page: children });
  }, [children, lang, t]);

  return (
    <h1 ref={ref} tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
