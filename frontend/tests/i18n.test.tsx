import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dictFor, I18nProvider, rationaleText, setLang, t, useT } from "../src/shared/i18n";

function Probe() {
  const { t, lang } = useT();
  return (
    <p>
      {lang}:{t("how2.title")}
    </p>
  );
}

afterEach(() => setLang("en"));

describe("i18n provider", () => {
  it("useT re-renders consumers when the language changes", () => {
    const { rerender } = render(
      <I18nProvider lang="en">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText(`en:${dictFor("en")["how2.title"]}`)).toBeInTheDocument();
    rerender(
      <I18nProvider lang="uk">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText(`uk:${dictFor("uk")["how2.title"]}`)).toBeInTheDocument();
  });

  it("re-renders when the language is set outside React", () => {
    render(<Probe />);
    act(() => setLang("uk"));
    expect(screen.getByText(`uk:${dictFor("uk")["how2.title"]}`)).toBeInTheDocument();
  });

  it("sets <html lang> to the active language", () => {
    const { rerender } = render(<I18nProvider lang="uk">{null}</I18nProvider>);
    expect(document.documentElement.lang).toBe("uk");
    rerender(<I18nProvider lang="en">{null}</I18nProvider>);
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("rationaleText", () => {
  const piece = (used: string, rationaleUk = "") => ({
    mode: "minor",
    rationaleEn: "Server note.",
    rationaleUk,
    composer: { used },
  });

  it("keeps the server's English note", () => {
    expect(rationaleText(piece("algorithmic"), "en")).toBe("Server note.");
  });

  it("writes the Ukrainian note for rule-based and aerosol pieces", () => {
    expect(rationaleText(piece("algorithmic"), "uk")).toBe(
      t("rationale.rules", { mode: t("rationale.minor", {}, "uk") }, "uk"),
    );
    expect(rationaleText(piece("aerosol"), "uk")).toBe(t("rationale.aerosol", {}, "uk"));
  });

  it("uses the AI's own Ukrainian note when there is one", () => {
    expect(rationaleText(piece("ai:model", "Нотатка ШІ."), "uk")).toBe("Нотатка ШІ.");
  });
});
