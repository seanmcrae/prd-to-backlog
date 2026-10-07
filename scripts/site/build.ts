/**
 * Builds the static docs site: `npm run site` (or `tsx scripts/site/build.ts [outDir]`).
 * Runs the pipeline on the bundled synthetic PRDs, renders one self-contained index.html and
 * copies the committed sample outputs next to it. No network access is needed.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectSiteData, resultsChart } from "./data.js";
import { mermaidBlock } from "./mermaid.js";
import { markdownSection, renderPage } from "./page.js";

const FEATURED = "team-invites";

export async function buildSite(root: string, outDir: string): Promise<string[]> {
  const read = (path: string) => readFile(join(root, path), "utf8");
  const [readme, product, pkg] = await Promise.all([
    read("README.md"),
    read("docs/PRODUCT.md"),
    read("package.json"),
  ]);
  const data = await collectSiteData(root);
  // The README walks through team-invites, so the site opens on the same PRD.
  data.samples.sort((a, b) => Number(b.slug === FEATURED) - Number(a.slug === FEATURED));
  const html = renderPage({
    ...data,
    chartSvg: resultsChart(data.samples),
    architectureMermaid: mermaidBlock(readme),
    productMarkdown: product,
    limitationsMarkdown: markdownSection(readme, "Limitations"),
    designMarkdown: markdownSection(readme, "Design decisions"),
    version: (JSON.parse(pkg) as { version: string }).version,
  });

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.html"), html);
  await writeFile(join(outDir, ".nojekyll"), "");
  const written = ["index.html", ".nojekyll"];
  for (const sample of data.samples) {
    await cp(join(root, "examples", "output", sample.slug), join(outDir, "samples", sample.slug), {
      recursive: true,
    });
    written.push(`samples/${sample.slug}/`);
  }
  return written;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = resolve(new URL("../..", import.meta.url).pathname);
  const outDir = resolve(process.argv[2] ?? join(root, "site"));
  const written = await buildSite(root, outDir);
  process.stdout.write(`Built ${outDir}: ${written.join(", ")}\n`);
}
