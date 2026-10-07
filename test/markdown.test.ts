import { describe, expect, it } from "vitest";
import { parseMarkdown, walkSections, type ListItemBlock } from "../src/prd/markdown.js";

const DOC = `---
title: Sample PRD
owner: pm
---
# Ignored H1 because front matter wins

Intro paragraph
spanning two lines.

## Requirements

- **Admins** can invite people
  - Invite email includes a link
  - Link expires after 7 days
- [x] Admins can revoke an invite
  that is still pending.

1. Ordered item

\`\`\`ts
- not a list item
# not a heading
\`\`\`

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Export \\| import CSV | P0 |
| FR-2 | Show history | P2 |

Setext Section
--------------

> Quoted note

### Nested
Text under nested.
`;

describe("parseMarkdown", () => {
  const doc = parseMarkdown(DOC);
  const sections = [...walkSections(doc.root)];

  it("reads front matter and prefers its title", () => {
    expect(doc.frontMatter).toEqual({ title: "Sample PRD", owner: "pm" });
    expect(doc.title).toBe("Sample PRD");
  });

  it("builds a section tree with paths and line spans", () => {
    expect(sections.map((s) => s.path.join(" > "))).toEqual([
      "Ignored H1 because front matter wins",
      "Ignored H1 because front matter wins > Requirements",
      "Ignored H1 because front matter wins > Setext Section",
      "Ignored H1 because front matter wins > Setext Section > Nested",
    ]);
    const req = sections[1];
    expect(req?.line).toBe(10);
    expect(req?.endLine).toBe(29);
    expect(sections[2]?.line).toBe(30);
  });

  it("joins multi-line paragraphs and keeps their span", () => {
    const intro = sections[0]?.blocks[0];
    expect(intro).toMatchObject({
      kind: "paragraph",
      text: "Intro paragraph spanning two lines.",
      line: 7,
      endLine: 8,
    });
  });

  it("nests list items, strips task markers and inline markup", () => {
    const items = sections[1]?.blocks.filter((b) => b.kind === "listItem") as ListItemBlock[];
    expect(items).toHaveLength(3);
    const [first, second, ordered] = items;
    expect(first?.text).toBe("Admins can invite people");
    expect(first?.children.map((c) => [c.text, c.line])).toEqual([
      ["Invite email includes a link", 13],
      ["Link expires after 7 days", 14],
    ]);
    expect(first?.endLine).toBe(14);
    expect(second).toMatchObject({
      text: "Admins can revoke an invite that is still pending.",
      checked: true,
      line: 15,
      endLine: 16,
    });
    expect(ordered).toMatchObject({ ordered: true, text: "Ordered item" });
  });

  it("skips fenced code entirely", () => {
    const texts = sections[1]?.blocks.map((b) => ("text" in b ? b.text : "table"));
    expect(texts).not.toContain("not a list item");
    expect(sections.some((s) => s.title === "not a heading")).toBe(false);
  });

  it("parses tables with escaped pipes and row lines", () => {
    const table = sections[1]?.blocks.find((b) => b.kind === "table");
    expect(table).toMatchObject({
      header: ["ID", "Requirement", "Priority"],
      rows: [
        { cells: ["FR-1", "Export | import CSV", "P0"], line: 27 },
        { cells: ["FR-2", "Show history", "P2"], line: 28 },
      ],
    });
  });

  it("marks block quotes", () => {
    expect(sections[2]?.blocks[0]).toMatchObject({ kind: "paragraph", quote: true });
  });

  it("falls back to an untitled document", () => {
    expect(parseMarkdown("just text").title).toBe("Untitled PRD");
  });

  it("normalises CRLF line endings", () => {
    const crlf = parseMarkdown("# T\r\n\r\n- a\r\n- b\r\n");
    expect(crlf.root.children[0]?.blocks).toHaveLength(2);
  });
});
