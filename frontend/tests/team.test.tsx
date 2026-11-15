// No photos, no contacts, no invented facts: only what the team agreed to publish. The one image is the team logo.

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import TeamPage, { MEMBERS, TEAM } from "../src/pages/team/TeamPage";
import { dictFor, KEYS, setLang, type Lang } from "../src/shared/i18n";

afterEach(() => setLang("en"));

function renderPage(lang: Lang) {
  setLang(lang);
  return render(
    <MemoryRouter initialEntries={["/team"]}>
      <TeamPage />
    </MemoryRouter>,
  );
}

describe("team members", () => {
  it("are the six people of the team, in order", () => {
    expect(MEMBERS).toEqual([
      "Aleks Teilor Danko",
      "Sergiy Veryovka",
      "Vladyslav Zhulai",
      "Nazar Drahusevych",
      "Nazar Khozin",
      "Ihor Moroz",
    ]);
    expect(TEAM.map((m) => m.handle)).toEqual([
      "dankozz1",
      "ephemerian",
      "saiko_sakana",
      "NAZARUT0",
      "errorNum",
      "asedeseq",
    ]);
    expect(TEAM.map((m) => m.social.url)).toEqual([
      "https://www.linkedin.com/in/dankozz1/",
      "https://www.linkedin.com/in/veryovkasergiy/",
      "https://www.tiktok.com/@saiko_sakana",
      "https://www.linkedin.com/in/nazar-drahusevych",
      "https://www.linkedin.com/in/argonaut",
      "https://www.linkedin.com/in/remmover/",
    ]);
    // Latin letters only: one slug was once typed with a Cyrillic "a".
    for (const m of TEAM) expect(m.social.url).toMatch(/^[\x21-\x7e]+$/);
    expect(TEAM.map((m) => m.country)).toEqual(["es", "ua", "ua", "de", "de", "es"]);
  });
});

const UK_NAMES = [
  "Алекс Тейлор Данько",
  "Сергій Верьовка",
  "Владислав Жулай",
  "Назар Драгусевич",
  "Назар Хозін",
  "Ігор Мороз",
];

describe.each<Lang>(["en", "uk"])("team page (%s)", (lang) => {
  const t = dictFor(lang);
  const names = lang === "en" ? MEMBERS : UK_NAMES;

  it("has the title as h1, the challenge line and the story", () => {
    renderPage(lang);
    expect(screen.getByRole("heading", { level: 1, name: t["team.title"] })).toBeInTheDocument();
    expect(screen.getByText(t["team.name"])).toBeInTheDocument();
    expect(t["team.name"]).toContain("DivineRapier");
    expect(screen.getByText(t["team.intro"])).toBeInTheDocument();
    expect(t["team.intro"]).toContain("NASA Space Apps Challenge Dnipro 2026");
    expect(t["team.intro"]).toContain("The Earth Information Jukebox");
    expect(screen.getByText(t["team.story"])).toBeInTheDocument();
  });

  it("shows the logo with a meaningful alt text and a size", () => {
    renderPage(lang);
    const logo = screen.getByRole("img", { name: t["team.logo.alt"] });
    expect(logo.tagName).toBe("IMG");
    expect(t["team.logo.alt"].length).toBeGreaterThan(25);
    expect(logo).toHaveAttribute("width");
    expect(logo).toHaveAttribute("height");
  });

  it("has the h1, then h2 sections, then h3 for the strip items and the members", () => {
    const { container } = renderPage(lang);
    const levels = [...container.querySelectorAll("h1,h2,h3,h4")].map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels.filter((l) => l === 2)).toHaveLength(2);
    expect(levels.filter((l) => l === 3)).toHaveLength(3 + MEMBERS.length);
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
    expect(
      screen.getByRole("heading", { level: 2, name: t["team.how.title"] }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: t["team.list"] })).toBeInTheDocument();
  });

  it("has the three-item strip as a list", () => {
    renderPage(lang);
    const how = screen
      .getByRole("heading", { level: 2, name: t["team.how.title"] })
      .parentElement!.querySelector("ul")!;
    const items = within(how).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    items.forEach((item, i) => {
      expect(
        within(item).getByRole("heading", { level: 3, name: t[`team.how${i + 1}.title`] }),
      ).toBeInTheDocument();
      expect(within(item).getByText(t[`team.how${i + 1}.text`])).toBeInTheDocument();
    });
  });

  it("renders all six names, handles and countries as a semantic list", () => {
    const { container } = renderPage(lang);
    for (const name of names) expect(screen.getByText(name)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: t["team.list"] });
    expect(list.tagName).toBe("UL");
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(TEAM.length);
    cards.forEach((card, i) => {
      const { handle, country } = TEAM[i]!;
      expect(within(card).getByRole("heading", { level: 3, name: names[i] })).toBeInTheDocument();
      expect(within(card).getByText(`@${handle}`)).toBeInTheDocument();
      expect(within(card).getByText(t[`team.country.${country}`])).toBeInTheDocument();
      expect(within(card).getByText(t[`team.m${i + 1}.role`])).toBeInTheDocument();
      expect(within(card).getByText(t[`team.m${i + 1}.does`])).toBeInTheDocument();
    });
    expect(container.querySelectorAll("li > ul, li > ol")).toHaveLength(0);
  });

  it("names are First name then Surname in both languages", () => {
    expect(t["team.m1.name"]).toBe(names[0]);
    for (let n = 1; n <= 6; n++) expect(t[`team.m${n}.name`], `m${n}`).toBe(names[n - 1]);
    expect(names).not.toContain("Zhulai Vladyslav");
    expect(names).not.toContain("Жулай Владислав");
  });

  it("links every handle to Telegram and every person to one social profile", () => {
    renderPage(lang);
    const list = screen.getByRole("list", { name: t["team.list"] });
    const cards = within(list).getAllByRole("listitem");
    cards.forEach((card, i) => {
      const { handle, social } = TEAM[i]!;
      const tg = within(card).getByRole("link", {
        name: `Telegram: @${handle}, ${t["team.link.telegram"].split(", ")[1]}`,
      });
      expect(tg).toHaveAttribute("href", `https://t.me/${handle}`);
      expect(tg).toHaveAttribute("target", "_blank");
      expect(tg).toHaveAttribute("rel", "noopener noreferrer");
      expect(tg).toHaveTextContent(`@${handle}`);
      const network = social.network === "linkedin" ? "LinkedIn" : "TikTok";
      const soc = within(card).getByRole("link", {
        name: `${network}: ${names[i]}, ${t["team.link.social"].split(", ")[1]}`,
      });
      expect(soc).toHaveAttribute("href", social.url);
      expect(soc).toHaveAttribute("target", "_blank");
      expect(soc).toHaveAttribute("rel", "noopener noreferrer");
      expect(within(card).getAllByRole("link")).toHaveLength(2);
    });
  });

  it("says that the handles are Telegram", () => {
    renderPage(lang);
    expect(screen.getByText(t["team.handles"])).toBeInTheDocument();
    expect(t["team.handles"]).toContain("Telegram");
  });

  it("each role line has 2 to 4 roles", () => {
    for (let n = 1; n <= 6; n++) {
      const roles = t[`team.m${n}.role`].split(",");
      expect(roles.length, `m${n}`).toBeGreaterThanOrEqual(2);
      expect(roles.length, `m${n}`).toBeLessThanOrEqual(4);
    }
  });

  it("has no photos of people and no emails", () => {
    const { container } = renderPage(lang);
    // The only image is the team logo.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll('a[href^="mailto:"]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/@[\w.-]+\.[a-z]{2,}/i);
    // The marks and strip icons are decorative drawings.
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("gives every member a distinct mark", () => {
    const { container } = renderPage(lang);
    const marks = [...container.querySelectorAll("li > div:first-child svg")].map(
      (svg) => svg.innerHTML,
    );
    expect(marks).toHaveLength(6);
    expect(new Set(marks).size).toBe(6);
  });

  it("ends with a Listen button to the jukebox", () => {
    renderPage(lang);
    expect(screen.getByRole("link", { name: t["team.cta"] })).toHaveAttribute("href", "/");
  });
});

describe("team copy", () => {
  const team = KEYS.filter((k) => k.startsWith("team.") || k === "nav.team");

  it("has the same keys in both languages", () => {
    for (const lang of ["en", "uk"] as const)
      for (const key of team) expect(dictFor(lang)[key], `${lang} ${key}`).toBeTruthy();
    const ukKeys = Object.keys(dictFor("uk")).filter(
      (k) => k.startsWith("team.") || k === "nav.team",
    );
    expect(ukKeys.sort()).toEqual([...team].sort());
  });

  it("copy has no semicolons or dashes", () => {
    expect(team.length).toBeGreaterThan(25);
    for (const lang of ["en", "uk"] as const) {
      for (const key of team) {
        expect(dictFor(lang)[key], `${lang} ${key}`).not.toMatch(/[;—–]/);
        expect(dictFor(lang)[key], `${lang} ${key}`).not.toMatch(/ - /);
      }
    }
  });

  it("the story is four short sentences", () => {
    for (const lang of ["en", "uk"] as const) {
      const sentences = dictFor(lang)["team.story"].split(/(?<=\.)\s+/);
      expect(sentences, lang).toHaveLength(4);
    }
  });

  it("avoids corporate filler", () => {
    for (const lang of ["en", "uk"] as const)
      for (const key of team)
        expect(dictFor(lang)[key], `${lang} ${key}`).not.toMatch(
          /passionate|synerg|cutting-edge|world-class|синерг|пристрасн/i,
        );
  });
});
