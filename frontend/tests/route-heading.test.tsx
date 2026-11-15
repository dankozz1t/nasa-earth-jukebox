import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { RouteFocus, RouteHeading } from "../src/app/RouteHeading";
import { setLang, t, useT } from "../src/shared/i18n";

const navRef: { current: ReturnType<typeof useNavigate> | null } = { current: null };
const nav = ((...args: unknown[]) =>
  (navRef.current as (...a: unknown[]) => unknown)(...args)) as ReturnType<typeof useNavigate>;

function Nav() {
  const navigate = useNavigate();
  useEffect(() => {
    navRef.current = navigate;
  });
  return (
    <>
      <Link to="/how">to how</Link>
      <Link to="/">to home</Link>
    </>
  );
}

function Page({ k }: { k: string }) {
  const { t } = useT();
  return <RouteHeading>{t(k)}</RouteHeading>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
      <RouteFocus>
        <Routes>
          <Route path="/" element={<Page k="app.title" />} />
          <Route path="/how" element={<Page k="how2.title" />} />
          <Route path="*" element={<Page k="notFound.title" />} />
        </Routes>
      </RouteFocus>
    </MemoryRouter>,
  );
}

const h1 = () => screen.getByRole("heading", { level: 1 });

afterEach(() => {
  setLang("en");
  document.title = "";
});

describe("route heading", () => {
  it("does not take focus on first load", () => {
    renderAt("/how");
    expect(document.activeElement).not.toBe(h1());
  });

  it("takes focus when a link goes to another page", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("link", { name: "to how" }));
    expect(document.activeElement).toBe(h1());
    expect(h1()).toHaveTextContent(t("how2.title"));
  });

  it("takes focus on Back, also when it returns to the page the visit began on", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("link", { name: "to how" }));
    (document.activeElement as HTMLElement).blur();
    await act(async () => void nav(-1));
    expect(h1()).toHaveTextContent(t("app.title"));
    expect(document.activeElement).toBe(h1());
  });

  it("keeps focus where it is when only the search changes or the URL is replaced", async () => {
    renderAt("/");
    const link = screen.getByRole("link", { name: "to how" });
    link.focus();
    await act(async () => void nav("/?p=rain", { replace: true }));
    expect(document.activeElement).toBe(link);
    await act(async () => void nav("/?p=wind"));
    expect(document.activeElement).toBe(link);
  });

  it("does not take focus on a replace to another path", async () => {
    renderAt("/");
    const link = screen.getByRole("link", { name: "to how" });
    link.focus();
    await act(async () => void nav("/how", { replace: true }));
    expect(h1()).toHaveTextContent(t("how2.title"));
    expect(document.activeElement).toBe(link);
  });

  it("sets the tab title per route and language", async () => {
    renderAt("/");
    expect(document.title).toBe("Earth Jukebox");
    await userEvent.click(screen.getByRole("link", { name: "to how" }));
    expect(document.title).toBe(`${t("how2.title")} · Earth Jukebox`);
    await act(async () => setLang("uk"));
    expect(document.title).toBe(`${t("how2.title", {}, "uk")} · Earth Jukebox`);
    expect(document.title).not.toContain(t("how2.title", {}, "en"));
  });
});
