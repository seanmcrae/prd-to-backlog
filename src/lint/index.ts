import type { Backlog } from "../model/schema.js";
import { findCycles } from "./graph.js";
import { RULES, type Finding, type Rule, type Severity } from "./rules.js";

export type { Finding, Rule, Severity };
export { RULES };

export interface LintReport {
  /** 0-100 blend of story quality and traceability, minus cycle penalties. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  /** Mean per-story score, 0-100. */
  storyQuality: number;
  coverage: { covered: number; total: number; percent: number; uncovered: string[] };
  cycles: string[][];
  counts: Record<Severity, number>;
  byRule: Record<string, number>;
  findings: Finding[];
}

const PENALTY: Record<Severity, number> = { error: 25, warning: 10, info: 0 };
const CYCLE_PENALTY = 10;
const BACKLOG_ERROR_PENALTY = 5;
const QUALITY_WEIGHT = 0.6;

function grade(score: number): LintReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Runs every rule and scores the result. Each story starts at 100 and loses points per finding
 * on it or its criteria; the backlog score weights mean story quality against requirement
 * coverage, then subtracts for cycles and broken references. Info findings never cost points:
 * they mark things a human should look at, not defects.
 */
export function lintBacklog(backlog: Backlog, rules: Rule[] = RULES): LintReport {
  const findings = rules.flatMap((r) => r.check(backlog));

  const owner = new Map<string, string>();
  for (const story of backlog.stories) {
    owner.set(story.id, story.id);
    for (const c of story.acceptanceCriteria) owner.set(c.id, story.id);
  }
  const storyScores = new Map(backlog.stories.map((s) => [s.id, 100]));
  for (const f of findings) {
    const storyId = f.rule === "dependency-cycle" ? undefined : owner.get(f.target);
    if (storyId !== undefined) {
      storyScores.set(storyId, Math.max(0, (storyScores.get(storyId) ?? 0) - PENALTY[f.severity]));
    }
  }
  const scores = [...storyScores.values()];
  const storyQuality = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const coveredIds = new Set(backlog.stories.flatMap((s) => s.requirementIds));
  const uncovered = backlog.requirements.filter((r) => !coveredIds.has(r.id)).map((r) => r.id);
  const total = backlog.requirements.length;
  const covered = total - uncovered.length;
  const percent = total ? (covered / total) * 100 : 0;

  const cycles = findCycles(
    backlog.stories.map((s) => s.id),
    backlog.dependencies,
  );
  const backlogErrors = findings.filter((f) => f.rule === "invalid-reference").length;
  const raw =
    QUALITY_WEIGHT * storyQuality +
    (1 - QUALITY_WEIGHT) * percent -
    CYCLE_PENALTY * cycles.length -
    BACKLOG_ERROR_PENALTY * backlogErrors;
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const byRule: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity]++;
    byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  }

  return {
    score,
    grade: grade(score),
    storyQuality: Math.round(storyQuality * 10) / 10,
    coverage: { covered, total, percent: Math.round(percent * 10) / 10, uncovered },
    cycles,
    counts,
    byRule,
    findings,
  };
}

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Human-readable report for the terminal. */
export function formatReport(report: LintReport, options: { showInfo?: boolean } = {}): string {
  const lines = [
    `Score: ${report.score}/100 (${report.grade})`,
    `Story quality: ${report.storyQuality}/100`,
    `Traceability: ${report.coverage.covered}/${report.coverage.total} requirements covered (${report.coverage.percent}%)`,
    `Dependency cycles: ${report.cycles.length}`,
    `Findings: ${report.counts.error} errors, ${report.counts.warning} warnings, ${report.counts.info} info`,
  ];
  const shown = report.findings
    .filter((f) => options.showInfo || f.severity !== "info")
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.target.localeCompare(b.target));
  if (shown.length > 0) lines.push("");
  for (const f of shown) {
    lines.push(`${f.severity.padEnd(7)} ${f.target.padEnd(14)} ${f.rule.padEnd(28)} ${f.message}`);
  }
  return lines.join("\n");
}
