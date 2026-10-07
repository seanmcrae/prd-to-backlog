/**
 * Everything the docs site shows is computed here by running the real pipeline on the bundled
 * synthetic PRDs with the offline heuristic generator. Nothing on the site is hand-typed.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  evaluateCase,
  ExpectationSchema,
  type CaseResult,
  type Expectation,
} from "../../src/eval/index.js";
import { HeuristicGenerator } from "../../src/generate/heuristic/index.js";
import { lintBacklog, type LintReport } from "../../src/lint/index.js";
import type { Backlog } from "../../src/model/schema.js";
import { generateFromMarkdown } from "../../src/pipeline.js";
import { barChart } from "./svg.js";

export interface Sample {
  /** File stem, e.g. "team-invites". */
  slug: string;
  path: string;
  markdown: string;
  backlog: Backlog;
  report: LintReport;
  result: CaseResult;
  expectation: Expectation;
}

export interface CorpusStats {
  prds: number;
  requirements: number;
  requirementsWithoutDetail: number;
  stories: number;
  points: number;
  criteria: number;
  inferredCriteria: number;
  benefitInferred: number;
  expectedPhrases: number;
  foundPhrases: number;
}

export interface SiteData {
  samples: Sample[];
  stats: CorpusStats;
}

export async function collectSiteData(root: string): Promise<SiteData> {
  const expectedDir = join(root, "eval", "expected");
  const files = (await readdir(expectedDir)).filter((f) => f.endsWith(".json")).sort();
  const generator = new HeuristicGenerator();
  const samples: Sample[] = [];
  for (const file of files) {
    const expectation = ExpectationSchema.parse(
      JSON.parse(await readFile(join(expectedDir, file), "utf8")),
    );
    const markdown = await readFile(join(root, expectation.prd), "utf8");
    const { backlog } = await generateFromMarkdown(markdown, generator, expectation.prd);
    samples.push({
      slug: file.replace(/\.json$/, ""),
      path: expectation.prd,
      markdown,
      backlog,
      report: lintBacklog(backlog),
      result: await evaluateCase(markdown, expectation, generator),
      expectation,
    });
  }
  return { samples, stats: corpusStats(samples) };
}

export function corpusStats(samples: Sample[]): CorpusStats {
  const sum = (f: (s: Sample) => number) => samples.reduce((acc, s) => acc + f(s), 0);
  const criteria = (s: Sample) => s.backlog.stories.flatMap((st) => st.acceptanceCriteria);
  const expectedPhrases = sum((s) => s.expectation.requirements.length);
  return {
    prds: samples.length,
    requirements: sum((s) => s.backlog.requirements.length),
    requirementsWithoutDetail: sum(
      (s) => s.backlog.requirements.filter((r) => r.details.length === 0).length,
    ),
    stories: sum((s) => s.backlog.stories.length),
    points: sum((s) => s.backlog.stories.reduce((p, st) => p + (st.estimate?.points ?? 0), 0)),
    criteria: sum((s) => criteria(s).length),
    inferredCriteria: sum((s) => criteria(s).filter((c) => c.origin === "inferred").length),
    benefitInferred: sum(
      (s) => s.backlog.stories.filter((st) => st.labels.includes("benefit-inferred")).length,
    ),
    expectedPhrases,
    foundPhrases: Math.round(sum((s) => s.result.extractionRecall * s.expectation.requirements.length)),
  };
}

const pct = (x: number) => Math.round(x * 100);

/** Headline chart for the README and the landing page. */
export function resultsChart(samples: Sample[]): string {
  return barChart({
    title: "Heuristic generator on the bundled synthetic PRDs",
    subtitle: "npm run eval, no API keys. Percentages, lint score out of 100.",
    series: [
      { name: "Extraction recall", color: "#1d4ed8" },
      { name: "Capability coverage", color: "#0f766e" },
      { name: "Traceability", color: "#7c3aed" },
      { name: "Lint score", color: "#b45309" },
    ],
    groups: samples.map((s) => ({
      label: s.backlog.source.title,
      values: [
        pct(s.result.extractionRecall),
        pct(s.result.capabilityCoverage),
        pct(s.result.traceability),
        s.result.lintScore ?? 0,
      ],
    })),
  });
}
