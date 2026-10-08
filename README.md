# prd-to-backlog

[![CI](https://github.com/seanmcrae/prd-to-backlog/actions/workflows/ci.yml/badge.svg)](https://github.com/seanmcrae/prd-to-backlog/actions/workflows/ci.yml)
[![Docs](https://github.com/seanmcrae/prd-to-backlog/actions/workflows/pages.yml/badge.svg)](https://seanmcrae.github.io/prd-to-backlog/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)

Decide whether a PRD is ready for sprint planning: prd-to-backlog turns a markdown PRD into a traceable, linted backlog, shows which requirements nobody can test yet, and exports the result to GitHub Issues, Jira or Linear.

**Live docs:** <https://seanmcrae.github.io/prd-to-backlog/> shows each bundled sample PRD next to
the backlog generated from it, with every story linked to the PRD lines it cites.

Turning a PRD into tickets is slow, and it loses things. Requirements get merged or dropped,
acceptance criteria get paraphrased into something nobody can test, and a month later nobody can
say which ticket a PRD line became. `prd2backlog` parses a markdown PRD into requirements with
stable IDs and source line numbers, generates epics, user stories, Given/When/Then acceptance
criteria, estimates, dependencies and risks, validates them against a zod schema, and lints the
result. The default generator is deterministic and runs offline. Anthropic and OpenAI adapters
are optional.

## Numbers

From `npm run eval` and `prd2backlog lint` on the three bundled **synthetic** PRDs, offline
heuristic generator, no API keys. `test/readme-numbers.test.ts` recomputes each figure on every
CI run.

| Measure                        | Result                                                                            | Read it against                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability coverage (headline) | **36 / 37** hand-written capabilities appear in some story                        | No baseline is measured yet. A verbatim copy of each requirement has not been run through the eval, so this does not yet show how much the generator adds ([#6](https://github.com/seanmcrae/prd-to-backlog/issues/6)) |
| Traceability                   | 33 / 33 requirements cited by a story; extraction recall 33 / 33 labelled phrases | The parser owns the requirement list, so this checks wiring, not judgment                                                                                                                                              |
| Lint score                     | 94-97 / 100                                                                       | Grades the heuristic's own phrasing; most useful for comparing generators or a backlog before and after review                                                                                                         |
| PRD gaps surfaced              | 20 of 36 acceptance criteria inferred because the PRD gave no testable detail     | This is the output a PM acts on                                                                                                                                                                                        |
| Eval set                       | 3 synthetic PRDs, 33 requirements, 37 capabilities, 33 stories                    | Small and well-structured by design                                                                                                                                                                                    |
| Latency, cost                  | Not measured                                                                      | The default generator makes no model calls; the LLM generators have not been run against live models ([#7](https://github.com/seanmcrae/prd-to-backlog/issues/7))                                                      |

![Eval results for the heuristic generator on the bundled synthetic PRDs](docs/img/eval-results.svg)

## Quickstart

Requires Node 20 or later. One command installs, builds and generates a backlog for the sample
team-invites PRD into `out/`:

```sh
npm ci && npm run build && node dist/bin.js generate examples/team-invites.md --out out/
```

Then lint it and export it:

```sh
node dist/bin.js lint out/backlog.json
node dist/bin.js export out/backlog.json --format jira --out out/jira.csv
```

After `npm link` (or a global install) the same commands are available as `prd2backlog`. The
Docker image runs the CLI:
`docker build -t prd2backlog . && docker run --rm prd2backlog generate examples/team-invites.md`.

| Command                                                         | What it does                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `prd2backlog generate <prd.md> [--out dir] [--provider p]`      | Writes `backlog.json` and a reviewable `backlog.md`                |
| `prd2backlog lint <backlog.json> [--format json] [--min-score]` | Scored report; `--min-score` exits 1 below the threshold (CI gate) |
| `prd2backlog export <backlog.json> --format <f> [--out file]`   | `github`, `jira`, `linear`, `markdown`, `mermaid`                  |
| `prd2backlog serve [--port 8787] [--host 127.0.0.1]`            | HTTP API: `POST /generate`, `POST /lint`, `POST /export`           |

## Features

- **Line-accurate parsing.** Sections, nested lists, tables and front matter, with 1-based line
  spans kept for every block. Requirements get stable, content-addressed IDs (or the PRD's own
  `FR-3` style IDs), priorities, personas, goals and out-of-scope items.
- **Backlog generation.** Epics, user stories, Given/When/Then acceptance criteria, estimates with
  the signals behind them, explicit and inferred dependencies, and risks from open questions.
- **Traceability.** Every story cites the requirement and PRD line it came from; criteria are
  marked `prd` or `inferred`.
- **Linting and scoring.** INVEST checks, vague-wording and untestable-criterion rules,
  traceability coverage, dependency-cycle detection, and a 0-100 score usable as a CI gate.
- **Exports.** GitHub Issues payloads, Jira CSV, Linear CSV, markdown and a mermaid dependency
  graph.
- **Pluggable generators.** A deterministic offline heuristic (default), plus Anthropic and OpenAI
  generators behind one interface with a zod validation and repair loop.
- **CLI and HTTP API** over the same pipeline, and a static docs site built from the samples.

## Example output

The following is real output from the commands above, run on the bundled synthetic team-invites PRD:

```text
$ prd2backlog generate examples/team-invites.md --out out/
Parsed 12 requirements from examples/team-invites.md (3 out-of-scope items)
Generated 4 epics, 12 stories (23 pts), 8 dependencies, 3 risks with heuristic
Lint score 97/100 (A), traceability 100%, 0 errors, 7 warnings
Wrote out/backlog.json and out/backlog.md

$ prd2backlog lint out/backlog.json
Score: 97/100 (A)
Story quality: 94.2/100
Traceability: 12/12 requirements covered (100%)
Dependency cycles: 0
Findings: 0 errors, 7 warnings, 12 info

warning AC-b7f7fa-1    untestable-criterion         Then-clause uses subjective terms (fast, easy): "the invite flow should be fast and easy for invitees". State a measurable or visible result.
warning ST-03f995      inferred-criterion           All criteria were inferred; the PRD gives no testable detail for this story.
warning ST-51ea02      inferred-criterion           All criteria were inferred; the PRD gives no testable detail for this story.
warning ST-9b69c7      inferred-criterion           All criteria were inferred; the PRD gives no testable detail for this story.
warning ST-b7f7fa      inferred-criterion           All criteria were inferred; the PRD gives no testable detail for this story.
warning ST-b7f7fa      vague-language               Vague wording: "fast", "easy". Replace with a measurable target.
warning ST-c74591      inferred-criterion           All criteria were inferred; the PRD gives no testable detail for this story.
```

The warnings point at the PRD, not at the generator. The PRD says "The invite flow should be
fast and easy", which no one can test. Five requirements have no detail bullets, so their
acceptance criteria had to be inferred. Here is one story from `out/backlog.md`:

```markdown
### ST-456a6d: Invite teammates by entering one or more email addresses

As a workspace admin, I want to invite teammates by entering one or more email addresses, so that it supports the goal "Let workspace owners add their team without contacting support".

- Priority: should | Estimate: 5 pts
- Estimate rationale: base 1; +2 for 3 acceptance criteria; +1 measurable performance target (within 2 minutes) = score 4 -> 5 pts
- Traces to REQ-456a6d (examples/team-invites.md:27): Workspace admins can invite teammates by entering one or more email addresses.
- Labels: benefit-inferred

Acceptance criteria:

- [ ] **Given** a workspace admin, **when** an admin submits up to 20 valid addresses, **then** each address receives an invite email within 2 minutes.
- [ ] **Given** a workspace admin, **when** an address is malformed, **then** the form shows an inline error and no invite is sent for it.
- [ ] **Given** a workspace admin, **when** the address already belongs to a member, **then** the admin sees "already a member".
```

Every output file, including tracker exports, is committed under
[`examples/output/`](examples/output/) and regenerated by `npm run demo`. A test fails if those
samples drift from what the code produces.

## Results

`npm run eval` on the bundled synthetic corpus (no API keys set, so only the heuristic generator
ran):

| PRD                               | Generator | Extraction recall | Capability coverage | Traceability | Lint score | Schema valid | Stories |
| --------------------------------- | --------- | ----------------: | ------------------: | -----------: | ---------: | ------------ | ------: |
| `examples/mobile-offline-mode.md` | heuristic |              100% |                 92% |         100% |         94 | yes          |      10 |
| `examples/team-invites.md`        | heuristic |              100% |                100% |         100% |         97 | yes          |      12 |
| `examples/usage-based-billing.md` | heuristic |              100% |                100% |         100% |         96 | yes          |      11 |

The one miss is expected. Cache retention appears in the offline PRD only as an open question,
so it becomes a risk rather than a story. The chart above is drawn from the same run by
`npm run chart`, and a test fails if the committed SVG drifts from the code's output.

## Where it fails

Every sample passes its regression gate, so the failures that matter show up in the weakest
slice of the eval and in what the linter says about each backlog.

### Limits of the inputs and the corpus

| Slice or failure  | What the eval and lint show                                                                   | Cause                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Offline-mode PRD  | Weakest sample: 92% capability coverage, lint 94; 8 of 10 stories have only inferred criteria | Most of its requirements carry no detail bullets, and cache retention appears only as an open question, so it becomes a risk rather than a story |
| Vague PRD wording | 2 untestable-criterion warnings ("fast and easy", "a clear offline indicator")                | The heuristic keeps the PRD's words; it flags vague terms but cannot replace them with a target                                                  |
| Missing benefits  | 31 of 33 "so that" clauses were linked to a PRD goal by the generator                         | Requirements rarely state their own benefit; each one carries a `benefit-inferred` label for review                                              |
| Narrow corpus     | Three tidy, synthetic PRDs; no messy or real ones; no live-model rows                         | Says nothing yet about prose-only PRDs or how an LLM generator compares ([#7](https://github.com/seanmcrae/prd-to-backlog/issues/7))             |

### Limits of the design

| Limit                          | Evidence                                                                                                             | Consequence                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| One story per requirement      | 33 requirements became 33 stories                                                                                    | Large requirements are never split, small ones never merged                                                                    |
| Verb/noun dependency inference | Offline-mode backlog: 2 dependencies, both inferred and both from the sync story                                     | Misses semantic order, such as downloading inspections before filling them in offline                                          |
| Keyword coverage metric        | A capability counts as covered when its keywords appear in any story, and the PRD's own bullets usually contain them | The headline cannot yet tell the generator from a copy of the PRD ([#6](https://github.com/seanmcrae/prd-to-backlog/issues/6)) |
| Self-graded lint score         | The linter scores the heuristic's own phrasing                                                                       | A high score is a structure check, not evidence the stories are right                                                          |

**Considered and rejected: pushing straight to the tracker.** "Push to Jira" is the obvious
feature and was cut on purpose ([docs/PRODUCT.md](docs/PRODUCT.md#trade-offs-and-alternatives-considered)).
The output is a reviewable `backlog.md` plus import files, because the inferred content above is
exactly what a person has to check before it becomes a ticket. The cost is a manual import step.

## Limitations

- The heuristic generator writes one story per requirement. It does not split a large
  requirement or merge small ones. That is a refinement call for a person or an LLM.
- Story phrasing is pattern-based ("X can Y", "The system must Y", "As a X, I want Y"). Unusual
  sentence shapes fall back to a literal "I want ..." clause, and the linter usually flags them.
- Inferred dependencies come from verb/noun overlap. They catch "create before act on" chains
  and miss semantic ones (for example, offline storage before background sync).
- Estimates are relative signals, not velocity-calibrated forecasts.
- The lint score grades structure and wording, not whether the product decisions are right. On
  the bundled corpus it is also grading the heuristic's own output. It is most useful for
  comparing generators, or a backlog before and after review.
- The LLM adapters are covered by tests against faked HTTP responses. They have not been
  benchmarked against live models in this repo, so the eval table above has heuristic rows only.
- Jira and Linear CSV column names follow their importers' documented fields. Confirm the
  column mapping in the importer UI on first use.

## How evaluation works

Each bundled PRD has a hand-written expectation file in `eval/expected/`. The expectations are
deliberately independent of any generator's wording:

- **Extraction recall:** share of expected requirement phrases found (case-insensitive) in some
  requirement the parser extracted.
- **Capability coverage:** share of named capabilities (for example "Revoke invite" or
  "Expired link handling") whose keywords all appear, matched on word starts, in at least one
  story's title, want, benefit or acceptance criteria.
- **Traceability:** share of extracted requirements cited by at least one story.
- **Lint score** and **schema validity:** the linter's 0-100 score and whether the backlog
  passes the zod schema and referential checks.

`npm run eval` scores every available generator: the heuristic always, and the Anthropic or
OpenAI generator when its API key is set. Add `--json` for per-case details.

## Architecture

```mermaid
flowchart LR
  PRD[PRD markdown] --> Parser[markdown reader<br/>sections, lists, tables, line spans]
  Parser --> Extract[requirement extraction<br/>stable IDs, priority, personas, goals, scope cuts]
  Extract --> Gen{BacklogGenerator}
  Gen --> Heur[heuristic<br/>offline, deterministic]
  Gen --> LLM[LLM generator<br/>Anthropic / OpenAI]
  LLM --> Repair[zod validation +<br/>referential checks]
  Repair -- errors fed back --> LLM
  Heur --> Backlog[(backlog.json<br/>BacklogSchema)]
  Repair --> Backlog
  Backlog --> Lint[linter<br/>INVEST, vague terms, coverage, cycles]
  Backlog --> Export[exporters<br/>GitHub, Jira, Linear, markdown, mermaid]
  Lint --> Report[score report]
```

## Design decisions

- **Requirements are parser-owned.** Models generate epics, stories, dependencies and risks
  only. The requirement list, its IDs and its line numbers always come from the parser, so a
  model cannot invent or reword scope, and every story citation can be checked.
- **Content-addressed IDs.** A requirement without an explicit PRD ID (`FR-3`) gets
  `REQ-<sha1 of normalised text>`. Inserting, deleting or reordering other requirements does
  not renumber it, so references in trackers stay valid across PRD revisions. Editing the
  requirement's own wording changes its ID, and that is intended: it is a different requirement.
- **A heuristic default that does real work.** It reads the PRD structure, not keywords. Detail
  bullets become Given/When/Then criteria, headings become epics, "Must have" buckets set
  priority, and "Depends on FR-2" becomes an explicit edge. Create/consume verb pairs ("invite"
  then "revoke an invite") become inferred edges. Same input, byte-identical output, which is
  what makes snapshot tests and the committed samples possible.
- **Inference is labelled, never hidden.** Criteria carry `origin: prd | inferred`. Benefits
  linked to a PRD goal carry a `benefit-inferred` label. Inferred dependencies are dotted in the
  graph. Estimates list every signal that moved the number. The linter turns these labels into
  review prompts instead of treating generated text as fact.
- **Repair loop over trust.** LLM output goes through JSON extraction, zod validation and
  referential checks. Unknown requirement IDs, dangling dependencies and uncited stories are
  sent back to the model verbatim, for up to three attempts, after which it fails loudly.
- **A score you can argue with.** Each story starts at 100 and loses 25 per error and 10 per
  warning. The backlog score is 60% mean story quality plus 40% traceability coverage, minus
  10 per dependency cycle. Info findings cost nothing; they mark things a person should look at.
- **Own markdown reader instead of remark.** PRDs use a small, predictable subset of markdown.
  A reader of under 300 lines with exact line spans, setext headings, nested lists, tables and front
  matter was simpler to make line-accurate than mapping mdast positions back through
  list nesting. It is covered by its own tests.

## How this was built

Code was written with AI coding agents under my direction. I set the problem, success metrics and
eval gates, and decided what shipped. Every number here comes from the committed eval scripts and
is reproduced in CI.

## Data

All PRDs in `examples/` are **synthetic**. I wrote them for this repo and each one says so in
its header: team invites, usage-based billing, and offline mode for a field-inspections mobile
app. They do not describe a real product, company or customer. The eval expectations in
`eval/expected/` are also hand-written and synthetic. They are released under the same MIT
license as the code. No external datasets are used or downloaded.

## Configuration

Nothing needs configuring for the default offline generator. The LLM generators read their
settings from the environment (see [`.env.example`](.env.example)):

| Variable            | Used by                | Default             |
| ------------------- | ---------------------- | ------------------- |
| `ANTHROPIC_API_KEY` | `--provider anthropic` | required for it     |
| `ANTHROPIC_MODEL`   | `--provider anthropic` | `claude-sonnet-4-5` |
| `OPENAI_API_KEY`    | `--provider openai`    | required for it     |
| `OPENAI_MODEL`      | `--provider openai`    | `gpt-4.1`           |

`generate` also accepts `--model` to override the model and `--max-attempts` (default 3) for the
validation and repair loop. `serve` binds to `127.0.0.1:8787` by default; pass `--host 0.0.0.0`
to listen on all interfaces. The API is stateless and rejects request bodies over 1 MB with 413.

## Project layout

| Path                          | Responsibility                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `src/prd/markdown.ts`         | Block-level markdown reader that keeps 1-based line spans for every block         |
| `src/prd/extract.ts`          | Section roles, requirement extraction, content-addressed IDs, acceptance notes    |
| `src/model/schema.ts`         | zod schemas for the backlog plus referential checks (unique IDs, resolvable refs) |
| `src/generate/heuristic/`     | Story phrasing, criteria, signal-based estimates, dependency and risk inference   |
| `src/generate/llm/`           | Provider-agnostic generator, prompt, repair loop, Anthropic and OpenAI clients    |
| `src/lint/`                   | Rules, scoring, iterative Tarjan SCC for cycles                                   |
| `src/export/`                 | Tracker formats and the mermaid graph                                             |
| `src/eval/`, `eval/`          | Coverage scoring against hand-written expectations                                |
| `src/cli.ts`, `src/server.ts` | commander CLI and Hono API over the same pipeline                                 |
| `scripts/site/`               | Offline docs site generator and the dependency-free SVG chart and graph renderer  |
| `examples/`                   | Synthetic sample PRDs and their committed generated outputs                       |
| `test/`                       | vitest unit and integration tests; no network, no API keys                        |

Development scripts: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`,
`npm run eval`, `npm run demo` (regenerates `examples/output/`), `npm run chart` (regenerates
`docs/img/eval-results.svg`) and `npm run site` (builds the docs site into `site/`).

## Roadmap

See [docs/PRODUCT.md](docs/PRODUCT.md) for the problem framing, success metrics and the
now / next / later roadmap. Two-way sync with trackers is the main item under "later".

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the checks CI runs, and
[SECURITY.md](SECURITY.md) for reporting vulnerabilities. Changes are listed in
[CHANGELOG.md](CHANGELOG.md). If you use this in published work, [CITATION.cff](CITATION.cff)
has the citation details.

## License

MIT, copyright 2026 Sean McRae. See [LICENSE](LICENSE).
