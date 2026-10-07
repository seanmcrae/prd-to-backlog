import { describe, expect, it } from "vitest";
import { toMermaid } from "../src/export/mermaid.js";
import { HeuristicGenerator } from "../src/generate/heuristic/index.js";
import { lintBacklog } from "../src/lint/index.js";
import { extractPrd } from "../src/prd/extract.js";
import { parseMarkdown, walkSections } from "../src/prd/markdown.js";
import { generateFromMarkdown } from "../src/pipeline.js";
import { makeBacklog, makeStory } from "./fixtures.js";

describe("parser edge cases", () => {
  it("handles an empty document", () => {
    const doc = parseMarkdown("");
    expect(doc.title).toBe("Untitled PRD");
    expect([...walkSections(doc.root)]).toEqual([]);
  });

  it("treats an unterminated fence as code to the end of the file", () => {
    const doc = parseMarkdown("# T\n\n```\n- hidden\n## Hidden\n");
    expect(doc.root.children[0]?.blocks).toEqual([]);
    expect(doc.root.children[0]?.children).toEqual([]);
  });

  it("ignores unterminated front matter instead of swallowing the document", () => {
    const doc = parseMarkdown("---\ntitle: x\n# Real title\n");
    expect(doc.frontMatter).toEqual({});
    expect(doc.title).toBe("Real title");
  });

  it("nests three levels of list items and closes sibling sections correctly", () => {
    const doc = parseMarkdown("# A\n## B\n- one\n  - two\n    - three\n## C\n### D\n## E\n");
    const items = doc.root.children[0]?.children[0]?.blocks;
    expect(items?.[0]).toMatchObject({
      text: "one",
      endLine: 5,
      children: [{ text: "two", children: [{ text: "three", line: 5 }] }],
    });
    const paths = [...walkSections(doc.root)].map((s) => s.path.join("/"));
    expect(paths).toEqual(["A", "A/B", "A/C", "A/C/D", "A/E"]);
  });

  it("does not mistake a horizontal rule for a setext heading after a blank line", () => {
    const doc = parseMarkdown("# T\n\nText\n\n---\n\nMore");
    expect([...walkSections(doc.root)]).toHaveLength(1);
    expect(doc.root.children[0]?.blocks).toHaveLength(2);
  });
});

describe("extraction edge cases", () => {
  it("ignores framing prose before the first modal sentence", () => {
    const prd = extractPrd(
      "## Requirements\n\nThis section lists scope. Admins must approve requests. Approval is logged.\n",
    );
    expect(prd.requirements.map((r) => [r.text, r.details])).toEqual([
      ["Admins must approve requests.", ["Approval is logged."]],
    ]);
  });

  it("skips tables without a requirement column", () => {
    const prd = extractPrd(
      "## Requirements\n\n| Metric | Target |\n| --- | --- |\n| p95 | 200ms |\n",
    );
    expect(prd.requirements).toEqual([]);
  });

  it("warns about acceptance notes that match nothing", () => {
    const prd = extractPrd(
      "## Requirements\n\n- Admins can export reports\n\n## Acceptance criteria\n\n- Zebra migration totally unrelated\n",
    );
    expect(prd.warnings).toContain("Acceptance note at line 7 matches no requirement.");
  });

  it("reads explicit ids from bullets", () => {
    const prd = extractPrd("## Requirements\n\n- FR-12: Admins can export reports\n");
    expect(prd.requirements[0]).toMatchObject({
      id: "REQ-FR-12",
      sourceId: "FR-12",
      text: "Admins can export reports",
    });
  });
});

describe("generator and linter on degenerate input", () => {
  it("produces an empty but valid backlog for a PRD with no requirements", async () => {
    const result = await generateFromMarkdown(
      "# Notes\n\nJust context.\n",
      new HeuristicGenerator(),
    );
    expect(result.backlog.stories).toEqual([]);
    const report = lintBacklog(result.backlog);
    expect(report.coverage).toMatchObject({ total: 0, percent: 0 });
    expect(report.score).toBe(0);
  });
});

describe("mermaid escaping", () => {
  it("escapes quotes and strips angle brackets from labels", () => {
    const backlog = makeBacklog({
      stories: [makeStory({ id: "ST-a1", title: 'Show "<b>bold</b>" names' })],
      dependencies: [],
    });
    expect(toMermaid(backlog)).toContain('ST_a1["ST-a1: Show #quot;bbold/b#quot; names (3 pts)"]');
  });
});
