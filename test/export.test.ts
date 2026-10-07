import { describe, expect, it } from "vitest";
import { toCsv } from "../src/export/csv.js";
import { EXPORT_FORMATS, exportBacklog } from "../src/export/index.js";
import { toGithubIssues } from "../src/export/github.js";
import { toMermaid } from "../src/export/mermaid.js";
import { makeBacklog } from "./fixtures.js";

const backlog = makeBacklog();

/** Minimal RFC 4180 reader, enough to check exporter output round-trips. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") continue;
    else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  return rows;
}

describe("exporters", () => {
  it.each(EXPORT_FORMATS)("%s output matches snapshot", (format) => {
    expect(exportBacklog(backlog, format)).toMatchSnapshot();
  });

  it("escapes CSV fields", () => {
    expect(toCsv([["a", 'say "hi"', "x,y", "line\nbreak"]])).toBe(
      'a,"say ""hi""","x,y","line\nbreak"\r\n',
    );
  });

  it("jira csv links stories to epics and blockers by Issue Id", () => {
    const rows = parseCsv(exportBacklog(backlog, "jira"));
    const [header, epic, first, second] = rows;
    expect(header?.slice(0, 8)).toEqual([
      "Issue Id",
      "Issue Type",
      "Summary",
      "Description",
      "Priority",
      "Story Points",
      "Parent Id",
      "Inward issue link (Blocks)",
    ]);
    expect(epic?.slice(0, 3)).toEqual(["1", "Epic", "Invites"]);
    expect(first?.[6]).toBe("1");
    expect(second?.[7]).toBe("2");
    expect(rows.every((r) => r.length === header?.length)).toBe(true);
  });

  it("linear csv has one row per story", () => {
    const rows = parseCsv(exportBacklog(backlog, "linear"));
    expect(rows).toHaveLength(1 + backlog.stories.length);
    expect(rows[2]?.[2]).toContain("**Blocked by:** ST-a1");
  });

  it("github payloads put epics first and reference blockers", () => {
    const issues = toGithubIssues(backlog);
    expect(issues.map((i) => i.title)).toEqual([
      "[EP-core] Invites",
      "[ST-a1] Invite teammates by email",
      "[ST-b2] Accept an invite",
    ]);
    expect(issues[2]?.body).toContain("### Blocked by\n- [ST-a1] Invite teammates by email");
    expect(issues[1]?.labels).toEqual(["story", "priority:must"]);
  });

  it("mermaid marks inferred edges dotted and highlights cycles", () => {
    const cyclic = makeBacklog({
      dependencies: [
        { from: "ST-a1", to: "ST-b2", kind: "inferred", reason: "x" },
        { from: "ST-b2", to: "ST-a1", kind: "explicit", reason: "y" },
      ],
    });
    const graph = toMermaid(cyclic);
    expect(graph).toContain("ST_a1 -.-> ST_b2");
    expect(graph).toContain("ST_b2 --> ST_a1");
    expect(graph).toContain("class ST_a1,ST_b2 cycle");
  });
});
