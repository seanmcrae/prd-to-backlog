import type { Backlog } from "../model/schema.js";
import { blockersOf, PRIORITY_LABEL, requirementsOf, storyStatement, traceLine } from "./common.js";
import { toCsv } from "./csv.js";

function description(lines: string[]): string {
  return lines.join("\n");
}

/**
 * CSV for Jira's external-system importer. "Issue Id" and "Parent Id" link stories to epics;
 * "Inward issue link (Blocks)" carries dependencies by Issue Id. Labels repeat across columns
 * because Jira labels cannot contain spaces or commas.
 */
export function toJiraCsv(backlog: Backlog): string {
  const issueId = new Map<string, string>();
  [...backlog.epics.map((e) => e.id), ...backlog.stories.map((s) => s.id)].forEach((id, i) =>
    issueId.set(id, String(i + 1)),
  );
  const label = (s: string) => s.replace(/[\s,]+/g, "-");
  const rows: { cells: string[]; labels: string[] }[] = [];

  for (const epic of backlog.epics) {
    rows.push({
      cells: [issueId.get(epic.id) ?? "", "Epic", epic.title, epic.description, "", "", "", ""],
      labels: [label(`prd2backlog-${epic.id}`)],
    });
  }
  for (const story of backlog.stories) {
    const desc = description([
      storyStatement(story),
      "",
      "h4. Acceptance criteria",
      ...story.acceptanceCriteria.map(
        (c) => `* *Given* ${c.given}, *when* ${c.when}, *then* ${c.then}`,
      ),
      "",
      "h4. Traceability",
      ...requirementsOf(story, backlog).map((r) => `* ${traceLine(r, backlog.source.path)}`),
      ...(story.estimate ? ["", `Estimate rationale: ${story.estimate.rationale}`] : []),
    ]);
    rows.push({
      cells: [
        issueId.get(story.id) ?? "",
        "Story",
        story.title,
        desc,
        PRIORITY_LABEL[story.priority],
        story.estimate ? String(story.estimate.points) : "",
        issueId.get(story.epicId) ?? "",
        blockersOf(story, backlog)
          .map((b) => issueId.get(b.id) ?? "")
          .join(","),
      ],
      labels: [label(`prd2backlog-${story.id}`), ...story.labels.map(label)],
    });
  }

  const labelColumns = Math.max(1, ...rows.map((r) => r.labels.length));
  const header = [
    "Issue Id",
    "Issue Type",
    "Summary",
    "Description",
    "Priority",
    "Story Points",
    "Parent Id",
    "Inward issue link (Blocks)",
    ...Array.from({ length: labelColumns }, () => "Labels"),
  ];
  return toCsv([
    header,
    ...rows.map((r) => [
      ...r.cells,
      ...Array.from({ length: labelColumns }, (_, i) => r.labels[i] ?? ""),
    ]),
  ]);
}
