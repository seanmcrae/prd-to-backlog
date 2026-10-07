/**
 * Renders the single-page docs site. Pure functions from collected data to HTML strings; the
 * CSS and the small script for the sample viewer are inlined so the page works offline.
 */
import { Marked, type Tokens } from "marked";
import { findCycles } from "../../src/lint/graph.js";
import type { Backlog, Requirement, Story } from "../../src/model/schema.js";
import { formatPoints, storyStatement } from "../../src/export/common.js";
import type { CorpusStats, Sample, SiteData } from "./data.js";
import { parseFlowchart } from "./mermaid.js";
import { escapeXml as esc, graphSvg, type GraphNode } from "./svg.js";

export const REPO_URL = "https://github.com/seanmcrae/prd-to-backlog";

export interface PageInput extends SiteData {
  chartSvg: string;
  architectureMermaid: string;
  productMarkdown: string;
  limitationsMarkdown: string;
  designMarkdown: string;
  version: string;
}

/** Markdown links to repo files become absolute GitHub links, since the site has no copies. */
function markdownToHtml(markdown: string, headingShift = 0): string {
  const marked = new Marked({ gfm: true });
  marked.use({
    walkTokens(token) {
      if (token.type === "heading") {
        const heading = token as Tokens.Heading;
        heading.depth = Math.min(6, heading.depth + headingShift);
        return;
      }
      if (token.type !== "link") return;
      const link = token as Tokens.Link;
      if (!/^(https?:|#|mailto:)/.test(link.href)) {
        link.href = `${REPO_URL}/blob/main/${link.href.replace(/^\.?\//, "")}`;
      }
    },
  });
  return marked.parse(markdown, { async: false });
}

/** The body of a `## Heading` section, without the heading itself. */
export function markdownSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) throw new Error(`Section "${heading}" not found`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##?\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function range(values: number[]): string {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

function hero(data: PageInput): string {
  const { stats, samples } = data;
  const scores = samples.map((s) => s.result.lintScore ?? 0);
  const traced = samples.every((s) => s.report.coverage.percent === 100);
  return `
<header class="hero" id="top">
  <div class="wrap hero-grid">
    <div>
      <p class="eyebrow">prd-to-backlog v${esc(data.version)} &middot; TypeScript CLI and HTTP API</p>
      <h1>Turn a markdown PRD into a backlog you can trace back to every line.</h1>
      <p class="lede">Epics, user stories, Given/When/Then acceptance criteria, estimates, dependencies and risks, each citing the PRD lines it came from. A linter scores the result, and exporters write GitHub Issues, Jira CSV and Linear CSV. The default generator is deterministic and runs offline; Anthropic and OpenAI adapters are optional.</p>
      <ul class="kpis">
        <li><strong>${traced ? "100%" : "&lt;100%"}</strong><span>requirements traced to a story</span></li>
        <li><strong>${stats.foundPhrases}/${stats.expectedPhrases}</strong><span>labelled requirements extracted</span></li>
        <li><strong>${range(scores)}</strong><span>lint score out of 100</span></li>
      </ul>
      <p class="fine">Measured with <code>npm run eval</code> on the ${stats.prds} bundled synthetic PRDs, heuristic generator, no API keys.</p>
      <p class="cta"><a class="button" href="#sample">See a PRD next to its backlog</a> <a class="button ghost" href="${REPO_URL}">View on GitHub</a></p>
    </div>
    <figure class="chart">${data.chartSvg}</figure>
  </div>
</header>`;
}

function requirementOf(id: string, backlog: Backlog): Requirement | undefined {
  return backlog.requirements.find((r) => r.id === id);
}

function storySpan(story: Story, backlog: Backlog): { line: number; endLine: number } | null {
  const reqs = story.requirementIds
    .map((id) => requirementOf(id, backlog))
    .filter((r): r is Requirement => r !== undefined);
  if (reqs.length === 0) return null;
  return {
    line: Math.min(...reqs.map((r) => r.source.line)),
    endLine: Math.max(...reqs.map((r) => r.source.endLine)),
  };
}

function prdPane(sample: Sample): string {
  const owner = new Map<number, string>();
  for (const story of sample.backlog.stories) {
    const span = storySpan(story, sample.backlog);
    if (!span) continue;
    for (let l = span.line; l <= span.endLine; l++) if (!owner.has(l)) owner.set(l, story.id);
  }
  const lines = sample.markdown.replace(/\n$/, "").split("\n");
  const body = lines
    .map((text, i) => {
      const n = i + 1;
      const story = owner.get(n);
      const attrs = story ? ` data-story="${sample.slug}-${story}" class="ln req"` : ` class="ln"`;
      return `<span id="${sample.slug}-L${n}"${attrs}><a class="no" href="#${sample.slug}-L${n}">${n}</a>${esc(text) || " "}</span>`;
    })
    .join("");
  return `<pre class="prd" data-pane>${body}</pre>`;
}

function storyCard(story: Story, sample: Sample): string {
  const { backlog, slug } = sample;
  const span = storySpan(story, backlog);
  const where = span
    ? `<a class="trace" href="#${slug}-L${span.line}" data-lines="${span.line}-${span.endLine}">${sample.path}:${span.line}${span.endLine > span.line ? `-${span.endLine}` : ""}</a>`
    : `<span class="trace">untraced</span>`;
  const blockers = backlog.dependencies.filter((d) => d.to === story.id);
  const criteria = story.acceptanceCriteria
    .map(
      (c) =>
        `<li${c.origin === "inferred" ? ` class="inferred" title="Inferred: the PRD gave no testable detail"` : ""}><b>Given</b> ${esc(c.given)}, <b>when</b> ${esc(c.when)}, <b>then</b> ${esc(c.then)}.</li>`,
    )
    .join("");
  const targets = new Set([story.id, ...story.acceptanceCriteria.map((c) => c.id)]);
  const findings = sample.report.findings.filter(
    (f) => f.severity !== "info" && targets.has(f.target),
  );
  return `
<article class="story" id="${slug}-${story.id}" data-lines="${span ? `${span.line}-${span.endLine}` : ""}" tabindex="0">
  <header><code>${story.id}</code><span class="pill p-${story.priority}">${story.priority}</span>${story.estimate ? `<span class="pill">${formatPoints(story.estimate.points)}</span>` : ""}</header>
  <h4>${esc(story.title)}</h4>
  <p>${esc(storyStatement(story))}</p>
  <ul class="criteria">${criteria}</ul>
  <p class="meta">Traces to ${where}${blockers.length ? ` &middot; blocked by ${blockers.map((b) => `<code>${b.from}</code>${b.kind === "inferred" ? " (inferred)" : ""}`).join(", ")}` : ""}</p>
  ${findings.map((f) => `<p class="finding">${esc(f.rule)}: ${esc(f.message)}</p>`).join("")}
</article>`;
}

const EPIC_COLORS = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#e0e7ff", "#ccfbf1"];

function dependencyGraph(sample: Sample): string {
  const { backlog } = sample;
  const palette = Object.fromEntries(
    backlog.epics.map((e, i) => [e.id, EPIC_COLORS[i % EPIC_COLORS.length] ?? "#eef2ff"]),
  );
  const cyclic = new Set(
    findCycles(
      backlog.stories.map((s) => s.id),
      backlog.dependencies,
    ).flat(),
  );
  const nodes: GraphNode[] = backlog.stories.map((s) => ({
    id: s.id,
    label: `${s.id}${s.estimate ? ` (${s.estimate.points})` : ""}\n${s.title}`,
    group: s.epicId,
    highlight: cyclic.has(s.id),
  }));
  const edges = backlog.dependencies.map((d) => ({
    from: d.from,
    to: d.to,
    ...(d.kind === "inferred" ? { dashed: true } : {}),
  }));
  const legend = backlog.epics
    .map((e) => `<span><i style="background:${palette[e.id] ?? ""}"></i>${esc(e.title)}</span>`)
    .join("");
  return `<div class="graph">${graphSvg(nodes, edges, { ariaLabel: `Story dependencies for ${backlog.source.title}`, idPrefix: sample.slug, nodeWidth: 200, wrap: 28, maxLines: 4, palette })}</div>
<p class="legend">${legend}<span>solid: stated in the PRD &middot; dashed: inferred &middot; red outline: in a cycle</span></p>`;
}

function samplePanel(sample: Sample, index: number): string {
  const { backlog, report, slug } = sample;
  const points = backlog.stories.reduce((p, s) => p + (s.estimate?.points ?? 0), 0);
  const epics = backlog.epics
    .map((epic) => {
      const stories = backlog.stories.filter((s) => s.epicId === epic.id);
      return `<div class="epic"><h3><code>${epic.id}</code> ${esc(epic.title)}</h3>${stories.map((s) => storyCard(s, sample)).join("")}</div>`;
    })
    .join("");
  const risks = backlog.risks.length
    ? `<h3>Risks</h3><table><thead><tr><th>ID</th><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr></thead><tbody>${backlog.risks
        .map(
          (r) =>
            `<tr><td><code>${r.id}</code></td><td>${esc(r.description)}</td><td>${r.likelihood}</td><td>${r.impact}</td><td>${esc(r.mitigation || "Not stated in PRD")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";
  const files = [
    ["backlog.json", "backlog.json"],
    ["backlog.md", "review markdown"],
    ["github-issues.json", "GitHub Issues"],
    ["jira.csv", "Jira CSV"],
    ["linear.csv", "Linear CSV"],
    ["dependencies.mmd", "mermaid graph"],
    ["lint.txt", "lint report"],
  ]
    .map(([file = "", text = ""]) => `<a href="samples/${slug}/${file}">${text}</a>`)
    .join(" &middot; ");
  return `
<div class="panel" id="panel-${slug}" role="tabpanel" aria-labelledby="tab-${slug}"${index === 0 ? "" : " hidden"}>
  <p class="summary"><b>${backlog.epics.length}</b> epics &middot; <b>${backlog.stories.length}</b> stories &middot; <b>${points}</b> pts &middot; <b>${backlog.dependencies.length}</b> dependencies &middot; <b>${backlog.risks.length}</b> risks &middot; lint <b>${report.score}/100 (${report.grade})</b> &middot; traceability <b>${report.coverage.percent}%</b> &middot; ${report.counts.warning} warnings</p>
  <div class="split">
    <div class="col"><h3 class="colhead">PRD <span>${esc(sample.path)} (synthetic)</span></h3>${prdPane(sample)}</div>
    <div class="col"><h3 class="colhead">Generated backlog <span>heuristic generator</span></h3><div class="backlog" data-pane>${epics}</div></div>
  </div>
  <h3>Dependency graph</h3>
  ${dependencyGraph(sample)}
  ${risks}
  <p class="downloads">Download the committed outputs: ${files}</p>
</div>`;
}

function sampleSection(samples: Sample[]): string {
  const tabs = samples
    .map(
      (s, i) =>
        `<button role="tab" id="tab-${s.slug}" aria-controls="panel-${s.slug}" aria-selected="${i === 0}">${esc(s.backlog.source.title)}</button>`,
    )
    .join("");
  return `
<section id="sample" class="wrap">
  <h2>A PRD next to its generated backlog</h2>
  <p>Hover or focus a story to highlight the PRD lines it came from; click a highlighted PRD line to jump to its story. Criteria in italics were inferred because the PRD gave no testable detail, and the linter flags them for review. Everything below is generated from the PRD on the left by <code>npm run site</code>.</p>
  <div class="tabs" role="tablist">${tabs}</div>
  ${samples.map(samplePanel).join("")}
</section>`;
}

function resultsSection(samples: Sample[], stats: CorpusStats): string {
  const rows = samples
    .map(
      (s) =>
        `<tr><td>${esc(s.backlog.source.title)}</td><td>${pct(s.result.extractionRecall)}</td><td>${pct(s.result.capabilityCoverage)}</td><td>${pct(s.result.traceability)}</td><td>${s.result.lintScore ?? "-"}</td><td>${s.result.schemaValid ? "yes" : "no"}</td><td>${s.result.stories}</td></tr>`,
    )
    .join("");
  const misses = samples
    .filter((s) => s.result.missedCapabilities.length > 0)
    .map((s) => {
      const questions = s.backlog.risks
        .filter((r) => r.origin === "derived" && r.description.startsWith("Unresolved question"))
        .map((r) => esc(r.description.replace(/^Unresolved question:\s*/, "")));
      const note = questions.length
        ? ` Open questions in this PRD become risks, not stories: ${questions.map((q) => `"${q}"`).join("; ")}`
        : "";
      return `<li>${esc(s.backlog.source.title)}: missed ${esc(s.result.missedCapabilities.join("; "))}.${note}</li>`;
    });
  const share = (a: number, b: number) => `${a} of ${b} (${Math.round((a / b) * 100)}%)`;
  return `
<section id="results" class="wrap">
  <h2>Results</h2>
  <p>Heuristic generator on the ${stats.prds} bundled synthetic PRDs (${stats.requirements} requirements, ${stats.stories} stories, ${stats.points} points). LLM providers are not run here because the site build uses no API keys.</p>
  <table class="num"><thead><tr><th>PRD</th><th>Extraction recall</th><th>Capability coverage</th><th>Traceability</th><th>Lint score</th><th>Schema valid</th><th>Stories</th></tr></thead><tbody>${rows}</tbody></table>
  ${misses.length ? `<ul class="misses">${misses.join("")}</ul>` : ""}
  <h3>How evaluation works</h3>
  <ul>
    <li><b>Extraction recall</b>: share of hand-labelled requirement phrases (<code>eval/expected/*.json</code>) found among the parser's requirements.</li>
    <li><b>Capability coverage</b>: share of hand-written capabilities whose keywords all appear in at least one story. Expectations are written independently of any generator's wording.</li>
    <li><b>Traceability</b>: requirements covered by at least one story.</li>
    <li><b>Lint score</b>: 0.6 &times; mean story quality + 0.4 &times; traceability, minus 10 per dependency cycle. Each story starts at 100 and loses 25 per error and 10 per warning.</li>
    <li><b>Schema valid</b>: output passes the zod <code>BacklogSchema</code> plus referential checks.</li>
  </ul>
  <h3>What the linter says about the PRDs</h3>
  <p>${share(stats.requirementsWithoutDetail, stats.requirements)} requirements had no testable detail in the PRD, so ${share(stats.inferredCriteria, stats.criteria)} acceptance criteria had to be inferred. For ${share(stats.benefitInferred, stats.stories)} stories the "so that" clause was linked to a PRD goal by the generator because the requirement did not state one. These are the PRD gaps the tool is built to surface, and where an LLM generator should beat the heuristic.</p>
</section>`;
}

function quickstartSection(): string {
  return `
<section id="quickstart" class="wrap">
  <h2>Quickstart</h2>
  <p>Requires Node 20 or later. No API keys.</p>
  <pre><code>git clone ${REPO_URL}.git &amp;&amp; cd prd-to-backlog
npm ci &amp;&amp; npm run build
node dist/bin.js generate examples/team-invites.md --out out/
node dist/bin.js lint out/backlog.json --min-score 90
node dist/bin.js export out/backlog.json --format jira --out out/jira.csv</code></pre>
  <table><thead><tr><th>Command</th><th>What it does</th></tr></thead><tbody>
    <tr><td><code>prd2backlog generate &lt;prd.md&gt; [--out dir] [--provider p]</code></td><td>Writes <code>backlog.json</code> and a reviewable <code>backlog.md</code></td></tr>
    <tr><td><code>prd2backlog lint &lt;backlog.json&gt; [--format json] [--min-score n]</code></td><td>Scored report; <code>--min-score</code> exits 1 below the threshold</td></tr>
    <tr><td><code>prd2backlog export &lt;backlog.json&gt; --format &lt;f&gt;</code></td><td><code>github</code>, <code>jira</code>, <code>linear</code>, <code>markdown</code>, <code>mermaid</code></td></tr>
    <tr><td><code>prd2backlog serve [--port 8787]</code></td><td>HTTP API: <code>POST /generate</code>, <code>/lint</code>, <code>/export</code></td></tr>
  </tbody></table>
</section>`;
}

const ARCH_PALETTE = { step: "#eef2ff", decision: "#fef3c7", store: "#dcfce7" };

function architectureSection(data: PageInput): string {
  const { nodes, edges } = parseFlowchart(data.architectureMermaid);
  const svg = graphSvg(nodes, edges, {
    ariaLabel: "prd-to-backlog architecture",
    idPrefix: "arch",
    nodeWidth: 200,
    wrap: 30,
    maxLines: 3,
    palette: ARCH_PALETTE,
    direction: "TB",
  });
  return `
<section id="architecture" class="wrap">
  <h2>Architecture</h2>
  <div class="arch">
    <figure class="graph">${svg}<figcaption class="fine">Drawn at build time from the Mermaid diagram in the README.</figcaption></figure>
    <div class="prose"><h3>Design decisions</h3>${markdownToHtml(data.designMarkdown)}</div>
  </div>
</section>`;
}

function productSection(markdown: string): string {
  const body = markdown.replace(/^# .*\n/, "");
  return `
<section id="product" class="wrap">
  <h2>Product brief</h2>
  <p class="fine">Rendered from <a href="${REPO_URL}/blob/main/docs/PRODUCT.md">docs/PRODUCT.md</a>.</p>
  <div class="prose product">${markdownToHtml(body, 1)}</div>
</section>`;
}

function limitationsSection(markdown: string): string {
  return `
<section id="limitations" class="wrap">
  <h2>Limitations</h2>
  <div class="prose">${markdownToHtml(markdown)}</div>
</section>`;
}

const CSS = `
:root{--fg:#111827;--muted:#4b5563;--line:#e5e7eb;--bg:#fff;--soft:#f8fafc;--accent:#1d4ed8;--hl:#fef9c3;--code:#f1f5f9}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:var(--bg)}
a{color:var(--accent)}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em}
code{background:var(--code);padding:.1em .3em;border-radius:4px}pre code{background:none;padding:0}
pre{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow:auto}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}
nav.top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
nav.top .wrap{display:flex;gap:20px;align-items:center;height:52px;overflow-x:auto;white-space:nowrap}
nav.top a{color:var(--fg);text-decoration:none;font-size:.92rem}nav.top a.brand{font-weight:700;margin-right:auto}
.hero{background:linear-gradient(180deg,#f8fafc,#fff);border-bottom:1px solid var(--line);padding:48px 0 40px}
.hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}
.eyebrow{color:var(--muted);font-size:.85rem;margin:0}
h1{font-size:2.3rem;line-height:1.2;margin:.3em 0 .4em;letter-spacing:-.01em}
.lede{color:#374151;font-size:1.05rem}
.kpis{list-style:none;padding:0;display:flex;gap:22px;margin:22px 0 6px;flex-wrap:wrap}
.kpis strong{display:block;font-size:1.7rem;line-height:1.1}.kpis span{color:var(--muted);font-size:.85rem}
.fine{color:var(--muted);font-size:.85rem}
.button{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600;margin:4px 8px 4px 0}
.button.ghost{background:none;color:var(--accent);border:1px solid var(--accent)}
.chart{margin:0}.chart svg,.graph svg{max-width:100%;height:auto;display:block}
.chart svg{border:1px solid var(--line);border-radius:10px}
section{padding:36px 0 8px}h2{font-size:1.6rem;margin:0 0 .5em}h3{margin:1.6em 0 .5em}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.92rem;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{background:var(--soft)}
table.num td:not(:first-child){text-align:right}td code{white-space:nowrap}
.tabs{display:flex;gap:6px;border-bottom:1px solid var(--line);margin-top:18px;flex-wrap:wrap}
.tabs button{font:inherit;border:1px solid var(--line);border-bottom:none;background:var(--soft);padding:8px 14px;border-radius:8px 8px 0 0;cursor:pointer}
.tabs button[aria-selected=true]{background:#fff;font-weight:600;position:relative;top:1px}
.summary{margin:14px 0}
.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.colhead{margin:.4em 0;font-size:1rem}.colhead span{color:var(--muted);font-weight:400;font-size:.85rem;margin-left:6px}
.prd,.backlog{height:min(74vh,780px);min-height:420px;overflow:auto;border:1px solid var(--line);border-radius:8px;margin:0}
.prd{padding:8px 0;white-space:pre-wrap;word-break:break-word;line-height:1.5}
.ln{display:block;padding:0 12px 0 52px;text-indent:-40px;scroll-margin-top:30vh}
.ln .no{display:inline-block;width:32px;margin-right:8px;text-align:right;color:#9ca3af;text-decoration:none;text-indent:0;user-select:none}
.ln.req{cursor:pointer;border-left:3px solid #c7d2fe}.ln.req:hover{background:#eef2ff}
.ln.hl{background:var(--hl);border-left-color:#ca8a04}
.backlog{padding:4px 12px;background:var(--soft)}
.epic h3{font-size:.95rem;margin:14px 0 8px}.epic:first-child h3{margin-top:8px}
.story{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0 0 10px;scroll-margin-top:12px;outline:none}
.story.hl,.story:focus{border-color:#ca8a04;box-shadow:0 0 0 3px #fde68a}
.story header{display:flex;gap:6px;align-items:center}.story h4{margin:6px 0 4px;font-size:1rem}
.story p{margin:4px 0;font-size:.92rem}
.pill{font-size:.75rem;border:1px solid var(--line);border-radius:99px;padding:0 8px;color:var(--muted)}
.p-must{border-color:#fca5a5;color:#b91c1c}.p-should{border-color:#fcd34d;color:#92400e}.p-could{border-color:#a7f3d0;color:#047857}
.criteria{margin:6px 0;padding-left:20px;font-size:.9rem}.criteria li.inferred{font-style:italic;color:var(--muted)}
.meta{color:var(--muted)}.finding{color:#92400e;background:#fffbeb;border-radius:6px;padding:2px 8px}
.graph{overflow-x:auto;border:1px solid var(--line);border-radius:8px;padding:8px;background:#fff}
.legend{font-size:.82rem;color:var(--muted);display:flex;flex-wrap:wrap;gap:14px}
.legend i{display:inline-block;width:12px;height:12px;border:1px solid #94a3b8;border-radius:3px;margin-right:5px;vertical-align:-1px}
.prose{max-width:860px}.arch{display:grid;grid-template-columns:auto minmax(0,1fr);gap:32px;align-items:start}.arch figure{margin:0;position:sticky;top:64px}.arch h3{margin-top:0}figcaption{padding:4px 8px}.product table{font-size:.86rem}
footer{border-top:1px solid var(--line);margin-top:40px;padding:24px 0;color:var(--muted);font-size:.88rem}
@media (max-width:900px){.hero-grid,.split,.arch{grid-template-columns:1fr}.arch figure{position:static}h1{font-size:1.8rem}.prd,.backlog{height:56vh}}
`;

const SCRIPT = `
(() => {
  const tabs = [...document.querySelectorAll('[role=tab]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
  for (const t of tabs) t.addEventListener('click', () => select(t));
  const clear = (panel) => panel.querySelectorAll('.hl').forEach((el) => el.classList.remove('hl'));
  const mark = (story) => {
    const panel = story.closest('.panel');
    clear(panel);
    story.classList.add('hl');
    const [from, to] = (story.dataset.lines || '').split('-').map(Number);
    if (!from) return;
    const slug = panel.id.replace('panel-', '');
    for (let n = from; n <= to; n++) document.getElementById(slug + '-L' + n)?.classList.add('hl');
    const first = document.getElementById(slug + '-L' + from);
    const pane = first.closest('[data-pane]');
    pane.scrollTo({ top: first.offsetTop - pane.clientHeight / 3, behavior: 'smooth' });
  };
  document.querySelectorAll('.story').forEach((story) => {
    story.addEventListener('mouseenter', () => mark(story));
    story.addEventListener('focus', () => mark(story));
  });
  document.querySelectorAll('.ln.req').forEach((line) => {
    line.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      const story = document.getElementById(line.dataset.story);
      const pane = story.closest('[data-pane]');
      pane.scrollTo({ top: story.offsetTop - 8, behavior: 'smooth' });
      mark(story);
    });
  });
  document.querySelectorAll('a.trace').forEach((a) => {
    a.addEventListener('click', (event) => {
      event.preventDefault();
      mark(a.closest('.story'));
    });
  });
})();
`;

export function renderPage(data: PageInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>prd-to-backlog: traceable backlogs from markdown PRDs</title>
<meta name="description" content="Turn a markdown PRD into epics, user stories, acceptance criteria, estimates and dependencies that trace back to PRD lines, with a quality linter and Jira, Linear and GitHub exports.">
<style>${CSS}</style>
</head>
<body>
<nav class="top"><div class="wrap"><a class="brand" href="#top">prd-to-backlog</a><a href="#sample">Sample</a><a href="#results">Results</a><a href="#quickstart">Quickstart</a><a href="#architecture">Architecture</a><a href="#product">Product brief</a><a href="#limitations">Limitations</a><a href="${REPO_URL}">GitHub</a></div></nav>
${hero(data)}
<main>
${sampleSection(data.samples)}
${resultsSection(data.samples, data.stats)}
${quickstartSection()}
${architectureSection(data)}
${productSection(data.productMarkdown)}
${limitationsSection(data.limitationsMarkdown)}
</main>
<footer><div class="wrap">prd-to-backlog v${esc(data.version)} &middot; <a href="${REPO_URL}">Source on GitHub</a> &middot; <a href="${REPO_URL}/blob/main/CONTRIBUTING.md">Contributing</a> &middot; MIT License, copyright 2026 Sean McRae. All PRDs on this page are synthetic and describe no real product or company. Built by <code>npm run site</code>.</div></footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
