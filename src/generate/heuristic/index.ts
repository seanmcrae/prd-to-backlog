import { createHash } from "node:crypto";
import type { Epic, Requirement, Story } from "../../model/schema.js";
import type { ExtractedPrd, SectionInfo } from "../../prd/extract.js";
import { contentTokens, jaccard, lowerFirst } from "../../text.js";
import {
  backlogShell,
  type BacklogGenerator,
  type GenerateInput,
  type GenerateResult,
} from "../provider.js";
import { buildCriteria } from "./criteria.js";
import { inferDependencies, type DependencyCandidate } from "./dependencies.js";
import { estimateStory } from "./estimate.js";
import { matchPersona, phraseRequirement } from "./phrase.js";
import { buildRisks } from "./risks.js";

// Headings that name a bucket rather than a theme; they make poor epic titles.
const GENERIC_HEADING =
  /^((functional|product|core|key)\s+)?(requirements?|scope|features?|capabilities|functionality|user stories|specification)$|^(must|should|could|nice)[- ]to[- ]?have$|^(must|should|could)[- ]have$/i;

function shortHash(text: string): string {
  return createHash("sha1").update(text.toLowerCase()).digest("hex").slice(0, 6);
}

function storyKey(requirementId: string): string {
  return requirementId.replace(/^REQ-/, "");
}

/** Epic title for a requirement: its nearest thematic heading, or the PRD title. */
function epicTitle(req: Requirement, prd: ExtractedPrd, roles: Map<string, SectionInfo>): string {
  if (req.kind === "non-functional") return `${prd.title}: non-functional requirements`;
  for (let depth = req.source.section.length; depth > 0; depth--) {
    const path = req.source.section.slice(0, depth);
    const info = roles.get(path.join(" > "));
    if (!info || info.role !== "requirements") break;
    const heading = path.at(-1) ?? "";
    if (!GENERIC_HEADING.test(heading)) return heading.replace(/^\d+(\.\d+)*\.?\s+/, "");
  }
  return prd.title;
}

function bestGoal(text: string, goals: string[]): string | undefined {
  const tokens = contentTokens(text);
  let best: { goal: string; score: number } | undefined;
  for (const goal of goals) {
    const score = jaccard(tokens, contentTokens(goal));
    if (score > (best?.score ?? 0)) best = { goal, score };
  }
  return best && best.score >= 0.05 ? best.goal : goals[0];
}

/**
 * Offline, deterministic generator. One story per requirement, grouped into epics by PRD
 * heading; personas, criteria, estimates, dependencies and risks are derived from the text.
 * Same input, same output, byte for byte.
 */
export class HeuristicGenerator implements BacklogGenerator {
  readonly name = "heuristic";

  generate(input: GenerateInput): Promise<GenerateResult> {
    const { prd } = input;
    const warnings = [...prd.warnings];
    const roles = new Map(prd.sections.map((s) => [s.path.join(" > "), s]));
    const personaNames = prd.personas.map((p) => p.name);
    const defaultPersona =
      (prd.personas[0] && matchPersona(prd.personas[0].name, prd.personas)) ?? "user";
    if (prd.personas.length === 0) {
      warnings.push("No personas section found; stories default to 'user'.");
    }

    const epics = new Map<string, Epic>();
    const stories: Story[] = [];
    const candidates: DependencyCandidate[] = [];

    for (const req of prd.requirements) {
      const title = epicTitle(req, prd, roles);
      let epic = epics.get(title);
      if (!epic) {
        const section = roles.get(req.source.section.join(" > "));
        epic = {
          id: `EP-${shortHash(title)}`,
          title,
          description:
            (title === prd.title ? prd.problem : section?.summary) ||
            `Requirements under "${req.source.section.join(" > ")}".`,
          requirementIds: [],
        };
        epics.set(title, epic);
      }
      epic.requirementIds.push(req.id);

      const key = storyKey(req.id);
      const phrase = phraseRequirement(req.text, prd.personas, defaultPersona);
      const criteria = buildCriteria(key, req.details, phrase);
      const goal = phrase.benefit
        ? undefined
        : bestGoal(`${req.text} ${req.details.join(" ")}`, prd.goals);
      const soThat = phrase.benefit
        ? lowerFirst(phrase.benefit)
        : goal
          ? `it supports the goal "${goal.replace(/\.$/, "")}"`
          : "";
      const labels = [
        ...(req.kind === "non-functional" ? ["non-functional"] : []),
        ...(phrase.benefit ? [] : ["benefit-inferred"]),
      ];
      const story: Story = {
        id: `ST-${key}`,
        epicId: epic.id,
        title: phrase.title,
        asA: phrase.asA,
        iWant: phrase.iWant,
        soThat,
        acceptanceCriteria: criteria,
        requirementIds: [req.id],
        estimate: estimateStory([req.text, ...req.details].join(" "), criteria.length),
        priority: req.priority,
        labels,
      };
      stories.push(story);
      candidates.push({ storyId: story.id, requirement: req, phrase });
    }

    const dependencies = inferDependencies(candidates, personaNames);
    const risks = buildRisks(prd, stories);

    return Promise.resolve({
      backlog: {
        ...backlogShell(input, { name: this.name }),
        epics: [...epics.values()],
        stories,
        dependencies,
        risks,
      },
      warnings,
      attempts: 0,
    });
  }
}
