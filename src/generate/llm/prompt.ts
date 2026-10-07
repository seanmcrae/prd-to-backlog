import type { ExtractedPrd } from "../../prd/extract.js";
import { FIBONACCI_POINTS, type ValidationIssue } from "../../model/schema.js";

export interface Prompt {
  system: string;
  user: string;
}

const SYSTEM = `You are a senior product manager turning a PRD into a delivery backlog.
Rules:
- Use ONLY the numbered requirements provided. Never invent scope; every story must list at least one requirementId from the list.
- Cover every requirement with at least one story. Do not create stories for out-of-scope items.
- Stories: "As a <persona from the PRD>, I want <capability>, so that <benefit>". Keep each story small enough for one sprint.
- Acceptance criteria use Given/When/Then with an observable, measurable outcome. Set origin to "prd" when the criterion restates PRD text and "inferred" otherwise.
- Estimates are story points from {${FIBONACCI_POINTS.join(", ")}} with a one-sentence rationale naming the complexity drivers.
- Dependencies point from the prerequisite story ("from") to the blocked story ("to"); kind "explicit" only when the PRD states it.
- IDs: epics "EP-<slug>", stories "ST-<slug>", criteria "AC-<slug>", risks "RISK-<slug>". IDs must be unique.
- Avoid vague words such as fast, easy, intuitive, seamless, etc.
Return a single JSON object matching the provided schema and nothing else.`;

export function buildPrompt(prd: ExtractedPrd, markdown: string): Prompt {
  const numbered = markdown
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4)}| ${line}`)
    .join("\n");
  const requirements = prd.requirements
    .map((r) => {
      const details = r.details.map((d) => `\n      - ${d}`).join("");
      return `- ${r.id} [${r.kind}, ${r.priority}, line ${r.source.line}]: ${r.text}${details}`;
    })
    .join("\n");
  const personas =
    prd.personas.map((p) => `- ${p.name}: ${p.description}`).join("\n") || "- (none)";
  const outOfScope = prd.outOfScope.map((s) => `- ${s.text}`).join("\n") || "- (none)";
  return {
    system: SYSTEM,
    user: [
      `PRD title: ${prd.title}`,
      `Personas:\n${personas}`,
      `Requirements (the only valid requirementIds):\n${requirements}`,
      `Out of scope (do not build):\n${outOfScope}`,
      `Full PRD with line numbers:\n${numbered}`,
    ].join("\n\n"),
  };
}

export function repairPrompt(base: Prompt, previous: string, issues: ValidationIssue[]): Prompt {
  const list = issues
    .slice(0, 30)
    .map((i) => `- ${i.path}: ${i.message}`)
    .join("\n");
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer was rejected.\n\nPrevious answer:\n${previous}\n\nValidation errors:\n${list}\n\nReturn the complete corrected JSON object.`,
  };
}
