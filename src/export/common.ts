import type { Backlog, Priority, Requirement, Story } from "../model/schema.js";

export function storyStatement(story: Story): string {
  const article = /^[aeiou]/i.test(story.asA) ? "an" : "a";
  const benefit = story.soThat ? `, so that ${story.soThat}` : "";
  return `As ${article} ${story.asA}, I want ${story.iWant}${benefit}.`;
}

export function requirementsOf(story: Story, backlog: Backlog): Requirement[] {
  return story.requirementIds
    .map((id) => backlog.requirements.find((r) => r.id === id))
    .filter((r): r is Requirement => r !== undefined);
}

export function traceLine(req: Requirement, sourcePath?: string): string {
  const where = sourcePath ? `${sourcePath}:${req.source.line}` : `line ${req.source.line}`;
  return `${req.sourceId ?? req.id} (${where}): ${req.text}`;
}

export function blockersOf(story: Story, backlog: Backlog): Story[] {
  return backlog.dependencies
    .filter((d) => d.to === story.id)
    .map((d) => backlog.stories.find((s) => s.id === d.from))
    .filter((s): s is Story => s !== undefined);
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  must: "High",
  should: "Medium",
  could: "Low",
};

export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}
