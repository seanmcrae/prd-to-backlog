import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateCase,
  ExpectationSchema,
  formatResults,
  scoreCoverage,
  type Expectation,
} from "../src/eval/index.js";
import { HeuristicGenerator } from "../src/generate/heuristic/index.js";
import type { BacklogGenerator } from "../src/generate/provider.js";
import { makeBacklog } from "./fixtures.js";

const root = new URL("..", import.meta.url);
const expectations = readdirSync(new URL("eval/expected/", root))
  .filter((f) => f.endsWith(".json"))
  .map((f) =>
    ExpectationSchema.parse(JSON.parse(readFileSync(new URL(`eval/expected/${f}`, root), "utf8"))),
  );

const expectation = (capabilities: Expectation["capabilities"]): Expectation => ({
  prd: "fixture.md",
  requirements: [],
  capabilities,
});

describe("scoreCoverage", () => {
  it("requires every keyword within a single story", () => {
    const result = scoreCoverage(
      makeBacklog(),
      expectation([
        { name: "invite by email", keywords: ["invite", "email"] },
        { name: "split across stories", keywords: ["teammates", "join the workspace"] },
      ]),
    );
    expect(result).toEqual({ coverage: 0.5, missed: ["split across stories"] });
  });

  it("matches keywords at word starts only", () => {
    const { missed } = scoreCoverage(
      makeBacklog(),
      expectation([{ name: "x", keywords: ["vite"] }]),
    );
    expect(missed).toEqual(["x"]);
  });
});

describe("evaluateCase", () => {
  it("records generator failures instead of throwing", async () => {
    const failing: BacklogGenerator = {
      name: "failing",
      generate: () => Promise.reject(new Error("model unavailable")),
    };
    const result = await evaluateCase(
      "# T\n",
      expectation([{ name: "a", keywords: ["a"] }]),
      failing,
    );
    expect(result).toMatchObject({
      schemaValid: false,
      lintScore: null,
      error: "model unavailable",
    });
    expect(formatResults([result])).toContain("error: model unavailable");
  });

  // Regression gate for the default generator on the bundled synthetic PRDs.
  it.each(expectations.map((e) => [e.prd, e] as const))(
    "heuristic generator holds its baseline on %s",
    async (_, exp) => {
      const markdown = readFileSync(new URL(exp.prd, root), "utf8");
      const result = await evaluateCase(markdown, exp, new HeuristicGenerator());
      expect(result.schemaValid).toBe(true);
      expect(result.extractionRecall).toBe(1);
      expect(result.traceability).toBe(1);
      expect(result.capabilityCoverage).toBeGreaterThanOrEqual(0.9);
      expect(result.lintScore).toBeGreaterThanOrEqual(90);
    },
  );
});

describe("README results table", () => {
  // The README quotes eval numbers in prose and a table; keep them tied to the code.
  it("matches a fresh heuristic eval run", async () => {
    const readme = readFileSync(new URL("README.md", root), "utf8");
    const section = readme.split("\n## Results\n")[1]?.split("\n## ")[0] ?? "";
    const rows = section
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim().replace(/`/g, "")),
      );
    const expected = await Promise.all(
      [...expectations]
        .sort((a, b) => a.prd.localeCompare(b.prd))
        .map(async (exp) => {
          const markdown = readFileSync(new URL(exp.prd, root), "utf8");
          const r = await evaluateCase(markdown, exp, new HeuristicGenerator());
          const pct = (x: number) => `${Math.round(x * 100)}%`;
          return [
            r.prd,
            r.generator,
            pct(r.extractionRecall),
            pct(r.capabilityCoverage),
            pct(r.traceability),
            String(r.lintScore),
            r.schemaValid ? "yes" : "no",
            String(r.stories),
          ];
        }),
    );
    expect(rows).toEqual(expected);
  });
});
