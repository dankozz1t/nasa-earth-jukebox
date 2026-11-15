import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { LiveUpdates } from "../features/live";
import { TransportBar } from "../features/transport";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
import { Header, SkipLinks } from "./Header";
import { Providers } from "./providers";
import { RouteFocus } from "./RouteHeading";
import Home from "./routes/Home";
import NotFound from "./routes/NotFound";

const How = lazy(() => import("../pages/how/HowPage"));
const Team = lazy(() => import("../pages/team/TeamPage"));

// The player bar sits outside the routes, so the sound goes on while the page changes.
export function AppRoutes() {
  const { pathname } = useLocation();

  return (
    <>
      <SkipLinks />
      <ErrorBoundary variant="silent">
        <LiveUpdates />
      </ErrorBoundary>
      <ErrorBoundary variant="header">
        <Header />
      </ErrorBoundary>
      <main id="main" tabIndex={-1}>
        {/* Keyed by route, so an error on one page does not stick to the next. */}
        <RouteFocus>
          <ErrorBoundary key={pathname}>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/how" element={<How />} />
                <Route path="/team" element={<Team />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </RouteFocus>
      </main>
      <ErrorBoundary variant="bar">
        <TransportBar />
      </ErrorBoundary>
    </>
  );
}

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}
