import type { Backlog } from "../model/schema.js";
import { blockersOf, requirementsOf, storyStatement, traceLine } from "./common.js";

/** Body of POST /repos/{owner}/{repo}/issues. */
export interface GithubIssuePayload {
  title: string;
  body: string;
  labels: string[];
}

/**
 * One issue per epic (with a task list of its stories) followed by one per story. Issue numbers
 * do not exist until creation, so cross-references use backlog IDs, which stay in each title.
 */
export function toGithubIssues(backlog: Backlog): GithubIssuePayload[] {
  const issues: GithubIssuePayload[] = [];
  for (const epic of backlog.epics) {
    const stories = backlog.stories.filter((s) => s.epicId === epic.id);
    issues.push({
      title: `[${epic.id}] ${epic.title}`,
      body: [
        epic.description,
        "",
        "### Stories",
        ...stories.map((s) => `- [ ] [${s.id}] ${s.title}`),
      ]
        .join("\n")
        .trim(),
      labels: ["epic"],
    });
  }
  for (const story of backlog.stories) {
    const blockers = blockersOf(story, backlog);
    const body = [
      storyStatement(story),
      "",
      "### Acceptance criteria",
      ...story.acceptanceCriteria.map(
        (c) => `- [ ] **Given** ${c.given}, **when** ${c.when}, **then** ${c.then}`,
      ),
      "",
      "### Traceability",
      ...requirementsOf(story, backlog).map((r) => `- ${traceLine(r, backlog.source.path)}`),
      ...(story.estimate
        ? ["", "### Estimate", `${story.estimate.points} points. ${story.estimate.rationale}`]
        : []),
      ...(blockers.length
        ? ["", "### Blocked by", ...blockers.map((b) => `- [${b.id}] ${b.title}`)]
        : []),
      "",
      `Epic: ${story.epicId}`,
    ].join("\n");
    issues.push({
      title: `[${story.id}] ${story.title}`,
      body,
      labels: ["story", `priority:${story.priority}`, ...story.labels],
    });
  }
  return issues;
}
