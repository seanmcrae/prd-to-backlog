import { createHash } from "node:crypto";
import type { Risk, Story } from "../../model/schema.js";
import type { ExtractedPrd } from "../../prd/extract.js";
import { capitalize, contentTokens, jaccard } from "../../text.js";

const LEVEL_PREFIX = /^(high|medium|low)\s*(?::|\s[\u2013\u2014-]\s)\s*/i;
const LARGE_STORY_POINTS = 8;

function riskId(text: string): string {
  return `RISK-${createHash("sha1").update(text.toLowerCase()).digest("hex").slice(0, 6)}`;
}

function relatedStories(text: string, stories: Story[]): string[] {
  const tokens = contentTokens(text);
  return stories
    .map((s) => ({
      id: s.id,
      score: jaccard(tokens, contentTokens(`${s.title} ${s.iWant} ${s.soThat}`)),
    }))
    .filter((s) => s.score >= 0.08)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((s) => s.id);
}

/** Risks stated in the PRD, plus ones derived from open questions, dependencies and sizing. */
export function buildRisks(prd: ExtractedPrd, stories: Story[]): Risk[] {
  const risks: Risk[] = [];
  for (const note of prd.risks) {
    const level = LEVEL_PREFIX.exec(note.text)?.[1]?.toLowerCase() as Risk["impact"] | undefined;
    const description = capitalize(note.text.replace(LEVEL_PREFIX, ""));
    risks.push({
      id: riskId(description),
      description,
      likelihood: "medium",
      impact: level ?? "medium",
      mitigation: "",
      relatedIds: relatedStories(description, stories),
      origin: "prd",
    });
  }
  for (const q of prd.openQuestions) {
    const description = `Unresolved question: ${q.text}`;
    risks.push({
      id: riskId(description),
      description,
      likelihood: "medium",
      impact: "medium",
      mitigation: "Resolve with the PRD owner before the related stories enter a sprint.",
      relatedIds: relatedStories(q.text, stories),
      origin: "derived",
    });
  }
  for (const dep of prd.externalDependencies) {
    const description = `External dependency: ${dep.text}`;
    risks.push({
      id: riskId(description),
      description,
      likelihood: "medium",
      impact: "high",
      mitigation: "Confirm scope and timeline with the owning team before committing dependents.",
      relatedIds: relatedStories(dep.text, stories),
      origin: "derived",
    });
  }
  for (const story of stories) {
    const points = story.estimate?.points ?? 0;
    if (points >= LARGE_STORY_POINTS) {
      const description = `${story.id} is estimated at ${points} points and may not fit in one sprint.`;
      risks.push({
        id: riskId(description),
        description,
        likelihood: "high",
        impact: "medium",
        mitigation: "Split by acceptance criterion or workflow step during refinement.",
        relatedIds: [story.id],
        origin: "derived",
      });
    }
  }
  return risks;
}
