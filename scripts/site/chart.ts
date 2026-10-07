/**
 * Writes the headline results chart used by the README: `npm run chart`.
 * A test fails if the committed SVG drifts from a fresh render.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { collectSiteData, resultsChart } from "./data.js";

const CHART_PATH = "docs/img/eval-results.svg";

const root = resolve(new URL("../..", import.meta.url).pathname);
const target = join(root, CHART_PATH);
const { samples } = await collectSiteData(root);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, resultsChart(samples));
process.stdout.write(`Wrote ${CHART_PATH}\n`);
