import type { Backlog } from "../model/schema.js";
import { blockersOf, PRIORITY_LABEL, requirementsOf, storyStatement, traceLine } from "./common.js";
import { toCsv } from "./csv.js";

/**
 * CSV for Linear's CSV importer: one row per story, epic carried as a label, markdown
 * descriptions. Dependencies are written into the description because Linear's CSV import
 * does not create issue relations.
 */
export function toLinearCsv(backlog: Backlog): string {
  const epicTitle = new Map(backlog.epics.map((e) => [e.id, e.title]));
  const rows = backlog.stories.map((story) => {
    const blockers = blockersOf(story, backlog);
    const desc = [
      storyStatement(story),
      "",
      "**Acceptance criteria**",
      ...story.acceptanceCriteria.map(
        (c) => `- [ ] Given ${c.given}, when ${c.when}, then ${c.then}`,
      ),
      "",
      "**Traceability**",
      ...requirementsOf(story, backlog).map((r) => `- ${traceLine(r, backlog.source.path)}`),
      ...(blockers.length ? ["", `**Blocked by:** ${blockers.map((b) => b.id).join(", ")}`] : []),
    ].join("\n");
    const labels = [`Epic: ${epicTitle.get(story.epicId) ?? story.epicId}`, ...story.labels];
    return [
      story.id,
      story.title,
      desc,
      PRIORITY_LABEL[story.priority],
      story.estimate ? String(story.estimate.points) : "",
      labels.join(", "),
      "Backlog",
    ];
  });
  return toCsv([
    ["ID", "Title", "Description", "Priority", "Estimate", "Labels", "Status"],
    ...rows,
  ]);
}
