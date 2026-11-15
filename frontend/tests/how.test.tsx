import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import HowPage, { viewFrom } from "../src/pages/how/HowPage";
import { LINES_PER_STEP, STEPS } from "../src/pages/how/SimpleView";
import { CONTENT } from "../src/pages/how/science/content";
import { SECTIONS } from "../src/pages/how/tech/content";
import type { BoxDiagramSpec, SequenceSpec } from "../src/pages/how/tech/model";
import { dictFor, KEYS, setLang, type Lang } from "../src/shared/i18n";

afterEach(() => setLang("en"));

let where = "";
function Where() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    where = `${pathname}${search}${hash}`;
  });
  return null;
}

function renderPage(lang: Lang, path = "/how") {
  setLang(lang);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HowPage />
      <Where />
    </MemoryRouter>,
  );
}

const ids = STEPS.map((s) => s.id);
const blocks = SECTIONS.flatMap((s) => s.blocks);
const boxes = blocks.flatMap((b) => (b.kind === "box" ? [b.diagram] : []));
const sequences = blocks.flatMap((b) => (b.kind === "seq" ? [b.diagram] : []));
const tables = blocks.flatMap((b) => (b.kind === "table" ? [b.table] : []));

describe.each<Lang>(["en", "uk"])("how it works, simple view (%s)", (lang) => {
  const t = dictFor(lang);

  it("opens on the Simple tab, selected, then the scientists' and the engineers' tabs", () => {
    renderPage(lang);
    expect(screen.getByRole("heading", { level: 1, name: t["how2.title"] })).toBeInTheDocument();
    const list = screen.getByRole("tablist", { name: t["how3.tabs"] });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((x) => x.textContent)).toEqual([
      t["how3.tab.simple"],
      t["how3.tab.science"],
      t["how3.tab.tech"],
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    for (const tab of tabs.slice(1)) {
      expect(tab).toHaveAttribute("aria-selected", "false");
      expect(tab).toHaveAttribute("tabindex", "-1");
    }
    const panel = screen.getByRole("tabpanel", { name: t["how3.tab.simple"] });
    expect(tabs[0]).toHaveAttribute("aria-controls", panel.id);
  });

  it("shows every step in order, each a heading and two short lines", () => {
    renderPage(lang);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(ids.map((id) => t[`how3.${id}.h`]));
    const steps = within(screen.getByRole("tabpanel")).getAllByRole("listitem");
    const cards = steps.filter((li) => li.querySelector("h2"));
    expect(cards).toHaveLength(STEPS.length);
    cards.forEach((card, i) => {
      const lines = [...card.querySelectorAll('[data-kind="line"]')].map((p) => p.textContent);
      expect(lines).toEqual([t[`how3.${ids[i]}.l1`], t[`how3.${ids[i]}.l2`]]);
    });
  });

  it("pictures are decorative, so a screen reader hears each step once", () => {
    const { container } = renderPage(lang);
    const panel = container.querySelector('[role="tabpanel"]:not([hidden])')!;
    const svgs = [...panel.querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThanOrEqual(STEPS.length);
    for (const svg of svgs) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(panel.querySelectorAll('[role="img"]')).toHaveLength(0);
    // Text inside a picture is set by CSS class, never by a fill attribute that the CSS would beat.
    for (const text of panel.querySelectorAll("svg text"))
      expect(text.hasAttribute("fill")).toBe(false);
  });

  it("tells the product story: what you can do, the trip, the checks, why, and who", () => {
    renderPage(lang);
    for (const id of ["todo", "trip", "checked", "why", "team"])
      expect(
        screen.getByRole("heading", { level: 2, name: t[`how3.${id}.h`] }),
      ).toBeInTheDocument();
    // Every step but the tiles one leads with its own picture.
    const cards = [...document.querySelectorAll("ol > li")];
    expect(cards).toHaveLength(STEPS.length);
    cards.forEach((card, i) => {
      if (STEPS[i]!.tiles) return;
      expect(card.querySelector("svg[viewBox]"), ids[i]).not.toBeNull();
    });
  });

  it("the headphone step shows a left and a right ear for north and south, for the eye only", () => {
    renderPage(lang);
    const legend = screen.getByText(t["how3.ear.north"]!).closest("p")!;
    expect(legend).toHaveAttribute("aria-hidden", "true");
    expect(legend).toHaveTextContent(t["how3.ear.south"]!);
    expect(legend.querySelectorAll("svg")).toHaveLength(2);
  });

  it("extra details open from an info button and close with Escape", async () => {
    const user = userEvent.setup();
    renderPage(lang);
    for (const id of STEPS.filter((s) => s.tip).map((s) => s.id)) {
      const button = screen.getByRole("button", { name: t[`how3.${id}.tipLabel`] });
      expect(button).toHaveAttribute("aria-expanded", "false");
      await user.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("tooltip")).toHaveTextContent(t[`how3.${id}.tip`]!);
      await user.keyboard("{Escape}");
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("the team step links to the team page", () => {
    renderPage(lang);
    expect(screen.getByRole("link", { name: t["how3.team.link"] })).toHaveAttribute(
      "href",
      "/team",
    );
  });

  it("the everyone step shows four icon tiles", () => {
    renderPage(lang);
    for (const key of ["how3.t.keys", "how3.t.captions", "how3.t.voice", "how3.t.print"]) {
      const tile = screen.getByText(t[key]!).closest("li")!;
      expect(tile.querySelector("svg")).not.toBeNull();
    }
  });

  it("links the three sources safely and says they open a new tab", () => {
    renderPage(lang);
    const hrefs = {
      "how2.link.svs": "https://svs.gsfc.nasa.gov/5669/",
      "how2.link.gibs":
        "https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs",
      "how2.link.meteo": "https://open-meteo.com/",
    };
    for (const [key, href] of Object.entries(hrefs)) {
      const link = screen.getByRole("link", { name: `${t[key]} ${t["how2.external"]}` });
      expect(link).toHaveAttribute("href", href);
      expect(link.getAttribute("rel")).toMatch(/\bnoopener\b/);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("ends with a Listen link to the jukebox", () => {
    renderPage(lang);
    expect(screen.getByRole("link", { name: t["how2.cta"] })).toHaveAttribute("href", "/");
  });
});

describe("switching views", () => {
  const t = dictFor("en");

  it("arrow keys move selection and focus, and the URL follows with ?view=", async () => {
    const user = userEvent.setup();
    renderPage("en");
    const [simple, science, tech] = screen.getAllByRole("tab");
    await user.click(simple!);
    await user.keyboard("{ArrowRight}");
    expect(science).toHaveAttribute("aria-selected", "true");
    expect(science).toHaveFocus();
    expect(where).toBe("/how?view=science");
    expect(await screen.findByRole("navigation", { name: CONTENT.en.toc })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(tech).toHaveAttribute("aria-selected", "true");
    expect(tech).toHaveFocus();
    expect(where).toBe("/how?view=tech");
    expect(await screen.findByRole("navigation", { name: "Contents" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t["how2.cta"] })).not.toBeInTheDocument();

    await user.keyboard("{Home}");
    expect(simple).toHaveAttribute("aria-selected", "true");
    expect(simple).toHaveFocus();
    expect(where).toBe("/how");

    await user.keyboard("{End}");
    expect(tech).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(simple).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}"); // wraps round
    expect(tech).toHaveAttribute("aria-selected", "true");
  });

  it("a click selects too", async () => {
    const user = userEvent.setup();
    renderPage("en");
    await user.click(screen.getByRole("tab", { name: t["how3.tab.tech"] }));
    expect(await screen.findByRole("tabpanel", { name: t["how3.tab.tech"] })).toBeInTheDocument();
    expect(where).toBe("/how?view=tech");
  });

  it.each(["/how?view=tech", "/how#tech", "/how#tech-api"])(
    "%s opens the engineering view",
    async (path) => {
      renderPage("en", path);
      expect(screen.getByRole("tab", { name: t["how3.tab.tech"] })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByText(t["how3.tech.intro"]!)).toBeInTheDocument();
      expect(await screen.findByRole("navigation", { name: "Contents" })).toBeInTheDocument();
    },
  );

  it("reads the view from the query or the hash", () => {
    expect(viewFrom("", "")).toBe("simple");
    expect(viewFrom("?view=tech", "")).toBe("tech");
    expect(viewFrom("?p=live-rain", "#tech-runtime")).toBe("tech");
    expect(viewFrom("", "#technical")).toBe("simple");
    expect(viewFrom("?view=science", "")).toBe("science");
    expect(viewFrom("", "#science")).toBe("science");
    expect(viewFrom("", "#science-nasa")).toBe("science");
    expect(viewFrom("", "#sciencefiction")).toBe("simple");
    expect(viewFrom("?view=nope", "")).toBe("simple");
  });

  it.each(["/how?view=science", "/how#science", "/how#science-music"])(
    "%s opens the view for scientists",
    async (path) => {
      renderPage("en", path);
      expect(screen.getByRole("tab", { name: t["how3.tab.science"] })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(await screen.findByRole("navigation", { name: CONTENT.en.toc })).toBeInTheDocument();
    },
  );
});

describe.each<Lang>(["en", "uk"])("view for scientists (%s)", (lang) => {
  const t = dictFor(lang);
  const content = CONTENT[lang];

  async function openScience() {
    const view = renderPage(lang, "/how?view=science");
    await screen.findByRole("navigation", { name: content.toc });
    return view;
  }

  it("is in the page language, with science, NASA and music sections linked from its contents", async () => {
    const { container } = await openScience();
    const panel = screen.getByRole("tabpanel", { name: t["how3.tab.science"] });
    expect(panel.querySelector("[lang]")).toBeNull();
    expect(within(panel).getByText(content.intro)).toBeInTheDocument();
    expect(content.sections.map((s) => s.id)).toEqual(["science", "nasa", "music"]);
    const links = within(screen.getByRole("navigation", { name: content.toc })).getAllByRole(
      "link",
    );
    expect(links).toHaveLength(3);
    for (const [i, link] of links.entries()) {
      const section = container.querySelector(link.getAttribute("href")!)!;
      expect(section.tagName).toBe("SECTION");
      expect(
        within(section as HTMLElement).getAllByRole("heading", { level: 2 })[0],
      ).toHaveTextContent(content.sections[i]!.title);
    }
  });

  it("tables have captions and headers, and pipelines are ordered lists named by their caption", async () => {
    const { container } = await openScience();
    const blocks = content.sections.flatMap((s) => s.blocks);
    const tables = blocks.filter((b) => b.kind === "table");
    const flows = blocks.filter((b) => b.kind === "flow");
    expect(container.querySelectorAll("table")).toHaveLength(tables.length);
    for (const table of container.querySelectorAll("table")) {
      expect(table.querySelector("caption")?.textContent).toBeTruthy();
      expect(table.querySelectorAll('thead th[scope="col"]').length).toBeGreaterThan(1);
      expect(table.closest('[tabindex="0"]')).toHaveAttribute("role", "group");
    }
    expect(flows.length).toBeGreaterThanOrEqual(2);
    for (const flow of flows) {
      if (flow.kind !== "flow") continue;
      const list = screen.getByRole("list", { name: flow.label });
      expect(list.tagName).toBe("OL");
      expect(within(list).getAllByRole("listitem")).toHaveLength(flow.steps.length);
    }
  });

  it("names the NASA assets and the honest limits, with the 30 minute weather cadence", async () => {
    const { container } = await openScience();
    const text = container.textContent ?? "";
    for (const fact of ["SVS 5669", "GEOS-FP", "GIBS", "Blue Marble", "13786", "Open-Meteo"])
      expect(text, fact).toContain(fact);
    expect(text).toMatch(lang === "en" ? /every 30 minutes/ : /кожні 30 хвилин/);
    expect(text).not.toMatch(/15 min|15 хв/);
    expect(text).toContain("CSV");
    expect(text).toContain("MIDI");
    expect(text).toContain("JSON");
  });
});

describe("view for scientists: copy", () => {
  it("has the same structure in both languages", () => {
    const shape = (lang: Lang) =>
      CONTENT[lang].sections.map((s) => ({
        id: s.id,
        blocks: s.blocks.map((b) =>
          b.kind === "table"
            ? `table:${b.table.id}:${b.table.columns.length}x${b.table.rows.length}`
            : b.kind === "list" || b.kind === "flow"
              ? `${b.kind}:${(b.kind === "list" ? b.items : b.steps).length}`
              : b.kind,
        ),
      }));
    expect(shape("uk")).toEqual(shape("en"));
  });

  it("Ukrainian copy has no semicolons or em dashes", () => {
    const words = JSON.stringify(CONTENT.uk);
    expect(words).not.toMatch(/[;—]/);
  });
});

// The scientists' view is lazy too: nothing of it is drawn until its tab opens.
describe("lazy view for scientists", () => {
  it("is not rendered while the simple view shows", async () => {
    renderPage("en");
    await act(async () => undefined);
    expect(screen.queryByRole("navigation", { name: CONTENT.en.toc })).not.toBeInTheDocument();
  });
});

describe.each<Lang>(["en", "uk"])("engineering view (%s)", (lang) => {
  async function openTech() {
    const view = renderPage(lang, "/how?view=tech");
    await screen.findByRole("navigation", { name: "Contents" });
    return view;
  }

  it("is marked English and lists every section in its contents", async () => {
    const { container } = await openTech();
    const root = container.querySelector('[lang="en"]')!;
    expect(root).not.toBeNull();
    const toc = screen.getByRole("navigation", { name: "Contents" });
    const links = within(toc).getAllByRole("link");
    expect(links).toHaveLength(SECTIONS.length);
    for (const [i, link] of links.entries()) {
      const id = link.getAttribute("href")!.slice(1);
      const section = document.getElementById(id)!;
      expect(section, id).not.toBeNull();
      expect(within(section).getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(
        SECTIONS[i]!.title,
      );
    }
  });

  it("every diagram is one image with a name, a caption and a text description", async () => {
    const { container } = await openTech();
    const images = [...container.querySelectorAll('svg[role="img"]')];
    expect(images).toHaveLength(boxes.length + sequences.length);
    expect(images.length).toBeGreaterThanOrEqual(7);
    for (const svg of images) {
      const name = svg.getAttribute("aria-label") ?? "";
      expect(name.length).toBeGreaterThan(10);
      const desc = document.getElementById(svg.getAttribute("aria-describedby") ?? "");
      expect(desc, name).not.toBeNull();
      expect(desc!.className).toContain("visually-hidden");
      expect((desc!.textContent ?? "").length, name).toBeGreaterThan(200);
      const figure = svg.closest("figure")!;
      expect(figure.querySelector("figcaption")?.textContent).toContain(name);
      // Wide drawings scroll inside a box that the keyboard can reach.
      expect(svg.parentElement).toHaveAttribute("tabindex", "0");
    }
  });

  it("tables are real tables with a caption, column headers and row headers", async () => {
    const { container } = await openTech();
    const rendered = [...container.querySelectorAll("table")];
    expect(rendered).toHaveLength(tables.length);
    for (const table of rendered) {
      expect(table.querySelector("caption")?.textContent).toBeTruthy();
      const cols = table.querySelectorAll('thead th[scope="col"]');
      expect(cols.length).toBeGreaterThan(1);
      for (const row of table.querySelectorAll("tbody tr")) {
        expect(row.firstElementChild?.tagName).toBe("TH");
        expect(row.firstElementChild).toHaveAttribute("scope", "row");
        expect(row.children).toHaveLength(cols.length);
      }
    }
  });

  it("identifiers in backticks render as code", async () => {
    const { container } = await openTech();
    expect(container.querySelectorAll("code").length).toBeGreaterThan(100);
    expect(container.textContent).not.toContain("`");
  });
});

describe("engineering content", () => {
  it("covers the requested parts", () => {
    const ids = SECTIONS.map((s) => s.id);
    for (const id of [
      "context",
      "containers",
      "components",
      "runtime",
      "data",
      "api",
      "stack",
      "crosscutting",
      "risks",
    ])
      expect(ids).toContain(id);
    expect(boxes.map((b) => b.id)).toEqual(["c4-context", "c4-containers", "c4-components"]);
    expect(sequences).toHaveLength(4);
    const api = tables.find((x) => x.id === "api-public")!;
    expect(api.columns).toEqual(["Endpoint", "Request", "Response", "Caching", "Rate limit"]);
    // Every public route of the C# API is in the contract table.
    const routes = api.rows.map((r) => r[0]);
    for (const route of [
      "GET /api/health",
      "GET /api/frames",
      "POST /api/soundscapes",
      "POST /api/soundscapes/upload",
      "GET /api/weather/grid",
      "GET /api/weather/readings",
      "POST /api/weather/soundscapes",
      "GET /api/weather/basemap",
    ])
      expect(routes.some((r) => r?.includes(route))).toBe(true);
  });

  it("ids are unique per kind, so anchors, captions and arrow markers never clash", () => {
    for (const ids of [
      SECTIONS.map((s) => s.id),
      tables.map((x) => x.id),
      [...boxes, ...sequences].map((d) => d.id),
    ])
      expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(boxes.map((b) => [b.id, b] as const))(
    "%s: every arrow joins known elements",
    (_, box: BoxDiagramSpec) => {
      const known = new Set([...box.nodes.map((n) => n.id), ...box.boundaries.map((b) => b.id)]);
      for (const e of box.edges) {
        expect(known.has(e.from), e.from).toBe(true);
        expect(known.has(e.to), e.to).toBe(true);
        expect(e.points.length).toBeGreaterThanOrEqual(2);
      }
      for (const n of box.nodes) {
        expect(n.x + n.w).toBeLessThanOrEqual(box.width);
        expect(n.y + n.h).toBeLessThanOrEqual(box.height);
      }
    },
  );

  it.each(sequences.map((s) => [s.id, s] as const))(
    "%s: messages and fragments are consistent",
    (_, seq: SequenceSpec) => {
      const known = new Set(seq.participants.map((p) => p.id));
      for (const m of seq.messages) {
        expect(known.has(m.from), m.from).toBe(true);
        expect(known.has(m.to), m.to).toBe(true);
      }
      for (const f of seq.fragments) {
        expect(f.start).toBeLessThanOrEqual(f.end);
        expect(f.end).toBeLessThan(seq.messages.length);
        for (const o of f.others ?? []) expect(o.at > f.start && o.at <= f.end).toBe(true);
      }
    },
  );

  it("the live cadence is 30 minutes everywhere it is named", () => {
    const text = JSON.stringify(SECTIONS);
    expect(text).not.toMatch(/15 min|every 15|900 s/);
    expect(text).toMatch(/30 min/);
    for (const lang of ["en", "uk"] as const)
      expect(dictFor(lang)["how3.records.l2"]).toContain("30");
  });
});

describe("simple view copy", () => {
  const how = KEYS.filter((k) => k.startsWith("how2.") || k.startsWith("how3."));
  const stepKey = /^how3\.(\w+)\.(h|l\d)$/;
  const lines = how.filter((k) => stepKey.exec(k)?.[2]?.startsWith("l"));
  const tips = how.filter((k) => k.endsWith(".tip"));

  it("has the same keys in both languages", () => {
    const uk = Object.keys(dictFor("uk")).filter(
      (k) => k.startsWith("how2.") || k.startsWith("how3."),
    );
    expect(uk.sort()).toEqual([...how].sort());
    for (const lang of ["en", "uk"] as const)
      for (const key of how) expect(dictFor(lang)[key], `${lang} ${key}`).toBeTruthy();
  });

  it("every step has a heading and exactly the lines the page shows", () => {
    for (const lang of ["en", "uk"] as const)
      for (const id of ids) {
        const d = dictFor(lang);
        expect(d[`how3.${id}.h`], `${lang} ${id}.h`).toBeTruthy();
        expect(d[`how3.${id}.l${LINES_PER_STEP}`], `${lang} ${id}`).toBeTruthy();
        expect(d[`how3.${id}.l${LINES_PER_STEP + 1}`], `${lang} ${id} extra line`).toBeUndefined();
      }
    // No orphan copy: every heading or line key belongs to a step on the page.
    for (const key of how) {
      const id = stepKey.exec(key)?.[1];
      if (id) expect(ids, key).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no semicolons, dashes or filler", () => {
    for (const lang of ["en", "uk"] as const)
      for (const key of how) {
        const text = dictFor(lang)[key]!;
        expect(text, `${lang} ${key}`).not.toMatch(/[;—–]/);
        expect(text, `${lang} ${key}`).not.toMatch(/ - /);
        expect(text, `${lang} ${key}`).not.toMatch(
          /\b(honest|honestly|calm|it is worth noting|simply)\b|чесно|спокійн|варто зазначити/i,
        );
      }
  });

  it("lines are at most 12 words, headings at most 5", () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(10);
    expect(lines).toHaveLength(STEPS.length * LINES_PER_STEP);
    for (const lang of ["en", "uk"] as const) {
      for (const key of lines) {
        const words = dictFor(lang)[key]!.split(/\s+/).filter(Boolean);
        expect(words.length, `${lang} ${key}`).toBeLessThanOrEqual(12);
      }
      for (const id of ids) {
        const words = dictFor(lang)[`how3.${id}.h`]!.split(/\s+/);
        expect(words.length, `${lang} ${id}.h`).toBeLessThanOrEqual(5);
      }
      // A detail behind an info button may run a little longer, never into a paragraph.
      for (const key of tips)
        expect(dictFor(lang)[key]!.split(/\s+/).length, `${lang} ${key}`).toBeLessThanOrEqual(14);
    }
  });

  it("keeps the page title", () => {
    expect(dictFor("en")["how2.title"]).toBe("How the Earth becomes music");
    expect(dictFor("uk")["how2.title"]).toBe("Як Земля стає музикою");
  });
});

// The engineering view is lazy: nothing of it is in the page module until the tab opens.
describe("lazy engineering chunk", () => {
  it("is not rendered while the simple view shows", async () => {
    renderPage("en");
    await act(async () => undefined);
    expect(screen.queryByRole("navigation", { name: "Contents" })).not.toBeInTheDocument();
    expect(document.querySelectorAll("table")).toHaveLength(0);
  });
});
