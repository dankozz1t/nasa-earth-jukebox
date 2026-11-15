import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../src/app/App";
import { Providers } from "../src/app/providers";
import { t } from "../src/shared/i18n";
import { ErrorBoundary } from "../src/shared/ui/ErrorBoundary";
import { installCanvas } from "./fakes/home";

const state = vi.hoisted(() => ({ barError: null as Error | null }));
vi.mock("../src/features/transport", async (orig) => {
  const real = await orig<typeof import("../src/features/transport")>();
  return {
    ...real,
    TransportBar: function TransportBar() {
      if (state.barError) throw state.barError;
      return <real.TransportBar />;
    },
  };
});

beforeAll(installCanvas);
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
});
afterEach(() => {
  state.barError = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("error boundaries", () => {
  it("a render error in the player bar shows a compact fallback and the rest of the app stays", async () => {
    state.barError = new Error("boom");
    render(
      <Providers>
        <MemoryRouter initialEntries={["/how"]}>
          <AppRoutes />
        </MemoryRouter>
      </Providers>,
    );
    expect(screen.getByText(t("error.title"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("error.retry") })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: t("transport.label") })).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 1, name: t("how2.title") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("nav.team") })).toBeInTheDocument();
  });
});

describe("chunk load errors", () => {
  function Broken({ message }: { message: string }): never {
    throw new Error(message);
  }

  it.each([
    "Failed to fetch dynamically imported module: /assets/x.js",
    "Importing a module script failed.",
    "Loading chunk 7 failed.",
  ])("Try again reloads the page after a failed dynamic import: %s", async (message) => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(
      <ErrorBoundary>
        <Broken message={message} />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: t("error.retry") }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Try again only re-renders after an ordinary error", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    let fail = true;
    function Maybe() {
      if (fail) throw new Error("boom");
      return <p>fine</p>;
    }
    render(
      <ErrorBoundary variant="header">
        <Maybe />
      </ErrorBoundary>,
    );
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: t("error.retry") }));
    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
