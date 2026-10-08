import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateCase, ExpectationSchema, type CaseResult } from "../src/eval/index.js";
import { HeuristicGenerator } from "../src/generate/heuristic/index.js";
import { lintBacklog } from "../src/lint/index.js";
import { BacklogSchema, type Backlog } from "../src/model/schema.js";

/**
 * The README's Numbers card and "Where it fails" section, and the cost note in PRODUCT.md,
 * quote figures from the eval and the committed sample backlogs (which samples.test.ts
 * keeps equal to a fresh heuristic run). Recompute them so the docs cannot drift.
 */
const root = new URL("..", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const readme = read("README.md");
const product = read("docs/PRODUCT.md");

const expectations = readdirSync(new URL("eval/expected/", root))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ExpectationSchema.parse(JSON.parse(read(`eval/expected/${f}`))));

const sampleName = (prd: string) => prd.replace(/^examples\//, "").replace(/\.md$/, "");
const backlogs = new Map<string, Backlog>(
  expectations.map((e) => {
    const name = sampleName(e.prd);
    return [name, BacklogSchema.parse(JSON.parse(read(`examples/output/${name}/backlog.json`)))];
  }),
);
const allBacklogs = [...backlogs.values()];
const backlog = (name: string): Backlog => {
  const b = backlogs.get(name);
  if (b === undefined) throw new Error(`no sample backlog for ${name}`);
  return b;
};

async function evalRuns(): Promise<CaseResult[]> {
  return Promise.all(
    expectations.map((e) => evaluateCase(read(e.prd), e, new HeuristicGenerator())),
  );
}

const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const onlyInferred = (b: Backlog) =>
  b.stories.filter((s) => s.acceptanceCriteria.every((c) => c.origin === "inferred")).length;

describe("README numbers card", () => {
  it("quotes coverage, traceability, lint range and eval set size from a fresh eval", async () => {
    const runs = await evalRuns();
    const capabilities = total(expectations.map((e) => e.capabilities.length));
    const covered = total(
      runs.map((r, i) => (expectations[i]?.capabilities.length ?? 0) - r.missedCapabilities.length),
    );
    const phrases = total(expectations.map((e) => e.requirements.length));
    const found = total(
      runs.map((r, i) =>
        Math.round(r.extractionRecall * (expectations[i]?.requirements.length ?? 0)),
      ),
    );
    const requirements = total(allBacklogs.map((b) => b.requirements.length));
    const traced = total(allBacklogs.map((b) => lintBacklog(b).coverage.covered));
    const stories = total(runs.map((r) => r.stories));
    const scores = runs.map((r) => r.lintScore ?? 0);

    expect(readme).toContain(`**${covered} / ${capabilities}** hand-written capabilities`);
    expect(readme).toContain(`${traced} / ${requirements} requirements cited by a story`);
    expect(readme).toContain(`extraction recall ${found} / ${phrases} labelled phrases`);
    expect(readme).toContain(`${Math.min(...scores)}-${Math.max(...scores)} / 100`);
    expect(readme).toContain(
      `${expectations.length} synthetic PRDs, ${requirements} requirements, ${capabilities} capabilities, ${stories} stories`,
    );
  });

  it("quotes how many acceptance criteria had to be inferred", () => {
    const criteria = allBacklogs.flatMap((b) => b.stories.flatMap((s) => s.acceptanceCriteria));
    const inferred = criteria.filter((c) => c.origin === "inferred").length;
    expect(readme).toContain(`${inferred} of ${criteria.length} acceptance criteria inferred`);
  });
});

describe("PRODUCT.md minimum viable quality", () => {
  it("quotes today's readings from a fresh eval", async () => {
    const runs = await evalRuns();
    const phrases = total(expectations.map((e) => e.requirements.length));
    const coverage = runs.map((r) => Math.round(r.capabilityCoverage * 100));
    const scores = runs.map((r) => r.lintScore ?? 0);
    expect(runs.every((r) => r.extractionRecall === 1)).toBe(true);
    expect(product).toContain(`100% (${phrases} of ${phrases} today)`);
    expect(product).toContain(`(${Math.min(...coverage)}-${Math.max(...coverage)}% today)`);
    expect(product).toContain(`(${Math.min(...scores)}-${Math.max(...scores)} today)`);
  });
});

describe("README failure analysis", () => {
  it("quotes the offline-mode slice", async () => {
    const runs = await evalRuns();
    const offline = runs.find((r) => r.prd === "examples/mobile-offline-mode.md");
    const b = backlog("mobile-offline-mode");
    expect(readme).toContain(
      `${Math.round((offline?.capabilityCoverage ?? 0) * 100)}% capability coverage, lint ${offline?.lintScore ?? "-"}; ${onlyInferred(b)} of ${b.stories.length} stories have only inferred criteria`,
    );
    const fromSync = b.dependencies.every((d) => d.from === b.dependencies[0]?.from);
    expect(fromSync).toBe(true);
    expect(readme).toContain(
      `${b.dependencies.length} dependencies, both inferred and both from the sync story`,
    );
    expect(b.dependencies.every((d) => d.kind === "inferred")).toBe(true);
  });

  it("quotes untestable criteria and goal-linked benefits across the corpus", () => {
    const untestable = total(
      allBacklogs.map(
        (b) => lintBacklog(b).findings.filter((f) => f.rule === "untestable-criterion").length,
      ),
    );
    const linked = total(
      allBacklogs.map((b) => b.stories.filter((s) => s.labels.includes("benefit-inferred")).length),
    );
    const stories = total(allBacklogs.map((b) => b.stories.length));
    expect(readme).toContain(`${untestable} untestable-criterion warnings`);
    expect(readme).toContain(`${linked} of ${stories} "so that" clauses`);
    expect(readme).toContain(
      `${total(allBacklogs.map((b) => b.requirements.length))} requirements became ${stories} stories`,
    );
  });
});
