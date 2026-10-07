import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "../scripts/site/build.js";
import { markdownSection } from "../scripts/site/page.js";
import { mermaidBlock, parseFlowchart } from "../scripts/site/mermaid.js";

const root = new URL("..", import.meta.url).pathname;

describe("parseFlowchart", () => {
  it("reads shapes, arrow styles and edge labels", () => {
    const chart = parseFlowchart(
      [
        "flowchart LR",
        "  A[PRD<br/>markdown] --> G{Generator}",
        "  G -.-> S[(store)]",
        "  S -- fed back --> A",
      ].join("\n"),
    );
    expect(chart.nodes).toEqual([
      { id: "A", label: "PRD\nmarkdown", group: "step" },
      { id: "G", label: "Generator", group: "decision" },
      { id: "S", label: "store", group: "store" },
    ]);
    expect(chart.edges).toEqual([
      { from: "A", to: "G" },
      { from: "G", to: "S", dashed: true },
      { from: "S", to: "A", label: "fed back" },
    ]);
  });

  it("rejects syntax it cannot draw instead of dropping it", () => {
    expect(() => parseFlowchart("A --> B & C")).toThrow(/Unsupported/);
  });

  it("parses the README architecture diagram", async () => {
    const readme = await readFile(join(root, "README.md"), "utf8");
    const { nodes, edges } = parseFlowchart(mermaidBlock(readme));
    expect(nodes.length).toBeGreaterThan(8);
    expect(edges.every((e) => nodes.some((n) => n.id === e.from))).toBe(true);
  });
});

describe("markdownSection", () => {
  it("returns a section body up to the next heading of the same or higher level", () => {
    const md = "# T\n\n## A\n\none\n\n### A.1\n\ntwo\n\n## B\n\nthree\n";
    expect(markdownSection(md, "A")).toBe("one\n\n### A.1\n\ntwo");
    expect(() => markdownSection(md, "C")).toThrow(/not found/);
  });
});

describe("buildSite", () => {
  let out: string;
  let html: string;

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), "prd2backlog-site-"));
    await buildSite(root, out);
    html = await readFile(join(out, "index.html"), "utf8");
  });

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  it("writes index.html, .nojekyll and the sample outputs", async () => {
    expect((await readdir(out)).sort()).toEqual([".nojekyll", "index.html", "samples"]);
    expect((await readdir(join(out, "samples", "team-invites"))).sort()).toContain("jira.csv");
  });

  it("loads nothing from the network", () => {
    expect(html).not.toMatch(/<(script|link|img)[^>]+(src|href)="https?:/);
  });

  it("shows every sample PRD line next to stories that trace to them", () => {
    for (const title of ["Team Invites", "Usage-Based Billing", "Offline Mode"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain('id="team-invites-L27"');
    expect(html).toMatch(/data-story="team-invites-ST-[0-9a-f]+"/);
    expect(html).toContain('href="#team-invites-L27"');
  });

  it("renders the product brief and README sections", () => {
    expect(html).toContain("Users and jobs to be done");
    expect(html).toContain("Requirements are parser-owned.");
    expect(html).toContain("one story per requirement");
  });
});
