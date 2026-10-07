/**
 * npm run eval: score every available generator on the bundled synthetic PRDs.
 * The heuristic generator always runs; LLM generators run when their API key is set.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  evaluateCase,
  ExpectationSchema,
  formatResults,
  type CaseResult,
} from "../src/eval/index.js";
import { availableGenerators, createGenerator } from "../src/generate/index.js";

const root = new URL("..", import.meta.url).pathname;
const expectedDir = join(root, "eval", "expected");

const files = (await readdir(expectedDir)).filter((f) => f.endsWith(".json")).sort();
const results: CaseResult[] = [];
for (const name of availableGenerators(process.env)) {
  const generator = createGenerator(name);
  for (const file of files) {
    const expectation = ExpectationSchema.parse(
      JSON.parse(await readFile(join(expectedDir, file), "utf8")),
    );
    const markdown = await readFile(join(root, expectation.prd), "utf8");
    results.push(await evaluateCase(markdown, expectation, generator));
  }
}

process.stdout.write(`${formatResults(results)}\n`);
if (process.argv.includes("--json")) {
  process.stdout.write(`\n${JSON.stringify(results, null, 2)}\n`);
}
