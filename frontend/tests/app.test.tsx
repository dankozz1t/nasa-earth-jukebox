import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../src/app/App";
import { Providers } from "../src/app/providers";
import { t } from "../src/shared/i18n";
import { installCanvas } from "./fakes/home";

function renderAt(path: string) {
  return render(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  );
}

// Home (and only Home) throws while `failHome` is set, to exercise the error boundary.
const state = vi.hoisted(() => ({ failHome: false }));
vi.mock("../src/app/routes/Home", async (orig) => {
  const Real = (await orig<typeof import("../src/app/routes/Home")>()).default;
  return {
    default: function Home() {
      if (state.failHome) throw new Error("boom");
      return <Real />;
    },
  };
});

beforeAll(installCanvas);
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  ); // Home asks the API; nothing answers here
});
afterEach(() => vi.unstubAllGlobals());

describe("app routes", () => {
  it("renders home with a level-1 heading", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("navigates to /how and moves focus to its h1", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("link", { name: t("nav.how") }));
    const h1 = await screen.findByRole("heading", { level: 1, name: t("how2.title") });
    expect(document.activeElement).toBe(h1);
  });

  it("navigates to /team from the header and moves focus to its h1", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("link", { name: t("nav.team") }));
    const h1 = await screen.findByRole("heading", { level: 1, name: t("team.title") });
    expect(document.activeElement).toBe(h1);
    expect(screen.getByRole("link", { name: t("nav.team") })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not steal focus on first load", async () => {
    renderAt("/how");
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(document.activeElement).not.toBe(h1);
  });

  it("shows NotFound with a link home for unknown path", () => {
    renderAt("/nope");
    expect(
      screen.getByRole("heading", { level: 1, name: t("notFound.title") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("notFound.home") })).toHaveAttribute("href", "/");
  });

  it("the error boundary resets on navigation", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.failHome = true;
    renderAt("/");
    expect(screen.getByText(t("error.title"))).toBeInTheDocument();
    state.failHome = false;
    await userEvent.click(screen.getByRole("link", { name: t("nav.how") }));
    expect(
      await screen.findByRole("heading", { level: 1, name: t("how2.title") }),
    ).toBeInTheDocument();
    expect(screen.queryByText(t("error.title"))).toBeNull();
    error.mockRestore();
  });
});
