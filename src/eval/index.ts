/**
 * Offline evaluation of generators against hand-written expectations for the bundled
 * synthetic PRDs. Expectations are deliberately independent of any generator's wording:
 * a capability counts as covered when every keyword appears somewhere in a story.
 */
import { z } from "zod";
import type { BacklogGenerator } from "../generate/provider.js";
import { lintBacklog } from "../lint/index.js";
import { validateBacklog, type Backlog } from "../model/schema.js";
import { extractPrd } from "../prd/extract.js";

export const ExpectationSchema = z.object({
  prd: z.string(),
  note: z.string().optional(),
  /** Phrases that must appear in some extracted requirement (case-insensitive). */
  requirements: z.array(z.string()),
  capabilities: z.array(z.object({ name: z.string(), keywords: z.array(z.string()).min(1) })),
});
export type Expectation = z.infer<typeof ExpectationSchema>;

export interface CaseResult {
  prd: string;
  generator: string;
  extractionRecall: number;
  capabilityCoverage: number;
  missedCapabilities: string[];
  traceability: number;
  lintScore: number | null;
  schemaValid: boolean;
  stories: number;
  error?: string;
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

function storyCorpus(backlog: Backlog): string[] {
  return backlog.stories.map((s) =>
    normalize(
      [
        s.title,
        s.iWant,
        s.soThat,
        ...s.acceptanceCriteria.flatMap((c) => [c.given, c.when, c.then]),
      ].join(" "),
    ),
  );
}

/** Keyword match on word starts, so "invite" matches "invites" but not "uninvited". */
function mentions(text: string, keyword: string): boolean {
  const escaped = normalize(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}`).test(text);
}

export function scoreCoverage(backlog: Backlog, expectation: Expectation) {
  const corpus = storyCorpus(backlog);
  const missed = expectation.capabilities
    .filter((cap) => !corpus.some((text) => cap.keywords.every((k) => mentions(text, k))))
    .map((cap) => cap.name);
  const total = expectation.capabilities.length;
  return { coverage: total ? (total - missed.length) / total : 1, missed };
}

export function extractionRecall(markdown: string, expectation: Expectation): number {
  const texts = extractPrd(markdown).requirements.map((r) => normalize(r.text));
  const found = expectation.requirements.filter((p) => texts.some((t) => t.includes(normalize(p))));
  return expectation.requirements.length ? found.length / expectation.requirements.length : 1;
}

export async function evaluateCase(
  markdown: string,
  expectation: Expectation,
  generator: BacklogGenerator,
): Promise<CaseResult> {
  const base = {
    prd: expectation.prd,
    generator: generator.name,
    extractionRecall: extractionRecall(markdown, expectation),
  };
  try {
    const { backlog } = await generator.generate({
      markdown,
      prd: extractPrd(markdown),
      path: expectation.prd,
    });
    const valid = validateBacklog(backlog).ok;
    const report = lintBacklog(backlog);
    const { coverage, missed } = scoreCoverage(backlog, expectation);
    return {
      ...base,
      capabilityCoverage: coverage,
      missedCapabilities: missed,
      traceability: report.coverage.percent / 100,
      lintScore: report.score,
      schemaValid: valid,
      stories: backlog.stories.length,
    };
  } catch (error) {
    return {
      ...base,
      capabilityCoverage: 0,
      missedCapabilities: expectation.capabilities.map((c) => c.name),
      traceability: 0,
      lintScore: null,
      schemaValid: false,
      stories: 0,
      error: (error as Error).message,
    };
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function formatResults(results: CaseResult[]): string {
  const header =
    "| PRD | Generator | Extraction recall | Capability coverage | Traceability | Lint score | Schema valid | Stories |";
  const rows = results.map(
    (r) =>
      `| ${r.prd} | ${r.generator} | ${pct(r.extractionRecall)} | ${pct(r.capabilityCoverage)} | ${pct(r.traceability)} | ${r.lintScore ?? "-"} | ${r.schemaValid ? "yes" : "no"} | ${r.stories} |`,
  );
  const missed = results
    .filter((r) => r.missedCapabilities.length > 0 || r.error)
    .map(
      (r) =>
        `- ${r.prd} / ${r.generator}: ${r.error ? `error: ${r.error}` : `missed ${r.missedCapabilities.join("; ")}`}`,
    );
  return [header, "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |", ...rows, "", ...missed]
    .join("\n")
    .trimEnd();
}
