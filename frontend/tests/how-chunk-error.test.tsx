import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HowPage from "../src/pages/how/HowPage";
import { dictFor, setLang } from "../src/shared/i18n";

const en = dictFor("en");

// The engineering chunk fails to load (a redeploy removed it, or the network dropped).
vi.mock("../src/pages/how/tech/TechView", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  setLang("en");
});

describe("engineering view that fails to load", () => {
  it("shows a local fallback, keeps the tabs, and Simple still works", async () => {
    const user = userEvent.setup();
    setLang("en");
    render(
      <MemoryRouter initialEntries={["/how?view=tech"]}>
        <HowPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(en["error.title"]);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: new RegExp(en["how3.tab.simple"]) }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("tab", { name: new RegExp(en["how3.tab.simple"]) })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
