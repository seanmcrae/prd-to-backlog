# prd-to-backlog: product write-up

## Problem

Between "PRD approved" and "sprint planned" a PM or eng lead spends hours, sometimes days,
re-typing the PRD into a tracker. The output is worse than the input, in four predictable ways:

1. **Dropped scope.** A requirement in a sub-bullet or a prose paragraph never becomes a
   ticket. Nobody notices until QA or a customer does.
2. **Invented scope.** Tickets show up that no requirement asked for. Sometimes they are good
   ideas, but they skip review because they look like they came from the PRD.
3. **Untestable acceptance criteria.** "Should be fast and easy" goes straight from the PRD into
   the ticket. The disagreement about what "done" means is pushed into the sprint.
4. **Lost traceability.** Once tickets exist, nobody can answer "which ticket covers PRD
   line 41?" or "what did the PRD say about this ticket?". When the PRD changes, nobody knows
   which tickets are now wrong.

The same translation also hides PRD quality problems. A requirement with no testable detail
reads fine in a doc and only becomes visible when someone tries to write its acceptance
criteria.

## Users and jobs to be done

| User                         | Job                                                                                            | What they need from the tool                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Product manager (PRD author) | "Turn my approved PRD into a first-draft backlog I can review in an hour, not build in a day." | Complete coverage, stories in the team's format, the gaps in the PRD itself called out |
| Engineering lead             | "Know the backlog is buildable before planning: sized, sequenced, no circular dependencies."   | Estimates with visible reasoning, a dependency graph, cycle detection                  |
| Reviewer / QA                | "Check that every requirement has testable criteria and nothing extra slipped in."             | Requirement-to-story trace, inferred-content labels, an untraced-story check           |
| Team running PRD reviews     | "Gate low-quality PRDs before they reach planning."                                            | A score with a CI exit code (`lint --min-score`)                                       |

## Scope

**In scope (v0.1, this repo)**

- Markdown PRDs: headings, nested bullets, tables, prose with modal verbs, front matter,
  "Acceptance notes" sections keyed by requirement ID.
- Requirement extraction with stable IDs and source line spans. Personas, goals, out-of-scope
  items, risks, open questions and external dependencies are captured as context.
- Backlog generation: deterministic heuristic (default, offline), plus Anthropic and OpenAI
  behind one interface, with schema validation and a repair loop.
- Quality linting with a 0-100 score, and exports to GitHub Issues payloads, Jira CSV, Linear
  CSV, markdown and mermaid.
- CLI, a small stateless HTTP API, and an offline eval harness.

**Out of scope (deliberately)**

- Writing to trackers through their APIs. Exports are files a person imports after review.
  Pushing straight to Jira would skip the review step that the whole design depends on.
- Google Docs, Confluence or Notion ingestion. Markdown export from those tools is good
  enough for v0.1, and connectors are an integration project, not a product question.
- Sprint planning, capacity or velocity forecasting. Estimates are relative sizing inputs.
- Multi-document PRDs and PRD diffing (see Roadmap).

## Requirements

| ID  | Requirement                                                                                           | How it is met                                                                              |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| R1  | Every extracted requirement is traceable to PRD lines and keeps its ID when other requirements change | Line spans on every block; content-addressed IDs or explicit PRD IDs (`REQ-FR-3`)          |
| R2  | Every requirement is covered by at least one story, or the gap is reported                            | `orphan-requirement` rule; traceability coverage % in the score                            |
| R3  | No story enters the backlog without citing a requirement                                              | `untraced-story` rule; LLM output with uncited stories is rejected and repaired            |
| R4  | Generated content is distinguishable from PRD content                                                 | `origin` on criteria, `benefit-inferred` label, explicit vs inferred dependency `kind`     |
| R5  | Output is machine-validated before anyone sees it                                                     | zod `BacklogSchema` plus referential checks in `validateBacklog`                           |
| R6  | Works with no network access and no API keys                                                          | Heuristic generator is the default; all tests run offline with faked HTTP for LLM adapters |
| R7  | Same input, same output for the default path                                                          | No timestamps or randomness; committed sample outputs are checked by a test                |
| R8  | Import into the trackers teams already use                                                            | GitHub, Jira CSV (epic links and blockers by Issue Id), Linear CSV                         |

## Success metrics and evals

The tool measures itself on four axes. The first two are automated today; the last two need a
pilot with real users and are listed so the instrumentation gets built with that in mind.

| Metric                        | Definition                                                                                                          | Current reading (bundled synthetic corpus, heuristic generator)                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Extraction recall             | Share of hand-labelled requirement phrases found among extracted requirements                                       | 100% on all three PRDs (33 of 33)                                                       |
| Capability coverage           | Share of hand-written capabilities (keyword sets) present in at least one story                                     | 100%, 100%, 92%; the miss is an open question the generator turns into a risk           |
| Traceability coverage         | Requirements with at least one story / all requirements                                                             | 100% on all three                                                                       |
| Lint score                    | 0.6 x mean story score + 0.4 x traceability %, minus 10 per dependency cycle                                        | 97 (team invites), 96 (billing), 94 (offline mode)                                      |
| Schema validity               | Output passes `validateBacklog`                                                                                     | 3 of 3                                                                                  |
| PM edit distance / acceptance | Share of generated stories accepted unchanged, edited, or deleted during review; token edit distance on edited ones | Not measured yet; needs a review UI or a diff of `backlog.json` before and after review |
| Time saved                    | Minutes from approved PRD to an import-ready backlog, against the team's manual baseline                            | Not measured yet; pilot metric                                                          |

All current readings come from running `npm run eval` and `prd2backlog lint` on the three
synthetic PRDs in `examples/`. They show the pipeline is wired correctly and the heuristic
handles well-structured PRDs. They do not show performance on messy real-world PRDs, and the
lint score partly grades the heuristic's own phrasing.

The more useful reading is what the linter says about the inputs. Across the corpus, 20 of 36
acceptance criteria (56%) had to be inferred, because 20 of 33 requirements had no testable
detail in the PRD. For 31 of 33 stories the benefit clause was linked to a PRD goal by the generator,
because the requirement did not state its own "so that". Those are the PRD-quality gaps this
tool exists to surface, and they are also where an LLM generator should beat the heuristic. The
eval harness is built to measure exactly that once API keys are available: same expectations,
one row per generator.

## Minimum viable quality

Release thresholds for a change to the parser, a generator or the linter. The "ship" column for the
first five rows is what `test/eval.test.ts` already enforces on the bundled synthetic PRDs; the
"delight" column needs the messy-PRD set and a verbatim-copy baseline that do not exist yet.

| Metric                               | Do not ship                              | Ship                                              | Delight                                                              | Measured today                                                          |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Schema validity                      | Any backlog that fails `validateBacklog` | 3 of 3                                            | Every PRD in a larger, messier set                                   | Yes                                                                     |
| Extraction recall                    | Below 100% on any bundled PRD            | 100% (33 of 33 today)                             | 95% or higher on messy PRDs                                          | Yes, bundled only                                                       |
| Traceability coverage                | Below 100%                               | 100%                                              | 100% after a PRD revision, with changed requirements reported by ID  | Yes                                                                     |
| Capability coverage, per PRD         | Below 90%                                | 90% or higher (92-100% today)                     | 100%, and clearly above a verbatim-copy baseline                     | Yes, but with no baseline (issue #6)                                    |
| Lint score, per PRD                  | Below 90                                 | 90 or higher (94-97 today)                        | 95 or higher with no `untestable-criterion` warning surviving review | Yes                                                                     |
| Invented scope from an LLM generator | Any untraced story reaching the output   | 0 untraced stories (the repair loop rejects them) | 0 invented criteria on a precision check as well                     | Untraced stories yes; criteria precision no (issue #7)                  |
| PM acceptance rate                   | Not set                                  | Not set                                           | Not set                                                              | No; the threshold should come from the first pilot, not be guessed here |

## Cost at 1x and 10x usage

Estimates only, from what the repo itself defines. It defines no traffic level, so 1x is set at
100 PRDs a month for illustration.

| Usage                   | Heuristic generator (default)      | Anthropic generator: output-token ceiling | OpenAI generator |
| ----------------------- | ---------------------------------- | ----------------------------------------- | ---------------- |
| 1x: 100 PRDs a month    | No model calls; local compute only | 4.8M output tokens a month                | No ceiling       |
| 10x: 1,000 PRDs a month | Same                               | 48M output tokens a month                 | No ceiling       |

The Anthropic ceiling is the adapter's `max_tokens` of 16,000 per call times the default three
validation-and-repair attempts, so 48,000 output tokens per PRD at worst. Each repair attempt also
resends the PRD and schema as input, which the repo does not measure. The OpenAI adapter sets no
output cap, so it has no ceiling to estimate. The repo holds no vendor prices and no measured token
counts, so none of this is converted to dollars; issue #7 tracks recording tokens, latency and
repair attempts per case. The heuristic path costs the same at 1x and 10x because it never calls a
model, and the HTTP API is stateless, so it scales with plain compute.

## Trade-offs and alternatives considered

**Heuristic vs LLM generation.** The heuristic is free, instant, private and deterministic, and
it never invents scope. But it writes one story per requirement, cannot split or merge, and
leans on the PRD's own wording. An LLM writes better benefits and criteria and can slice
stories, but it costs money per run, varies between runs and can hallucinate. The decision was
to keep both behind one interface, make the heuristic the default, and hold the LLM to the same
contract through validation and repair. Teams can start without sending a PRD to a vendor and
switch on a model when the eval shows it earns its cost.

**Human review as a step, not an option.** The obvious feature is "push to Jira". It was cut on
purpose. The output is a reviewable `backlog.md` plus import files, and inferred content is
labelled so the reviewer knows where to look. The linter's info findings exist to direct
review time, not to block anything.

**Own markdown reader vs remark/unified.** Remark is more complete, but the product needs exact
line spans for list items nested in list items and for table rows, plus a few PRD-specific
conventions. A small reader with focused tests was cheaper than mapping mdast positions, and
it has no runtime dependencies.

**Content-hash IDs vs sequential IDs.** Sequential IDs (`REQ-1`, `REQ-2`) are friendlier but
renumber on every insertion, which breaks every downstream reference. Hash IDs are ugly but
stable. Explicit IDs written in the PRD always win, so teams that number requirements keep
their numbering.

**One composite score vs a checklist.** A single number is easy to game and hides detail, but
it is what makes the `--min-score` CI gate and generator comparison possible. The report always
shows the components (story quality, coverage, cycles) and every finding, so the number is
never the only output.

## Risks

| Risk                                                                                | Likelihood | Impact | Mitigation                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hallucinated scope from LLM generators: stories or criteria the PRD never asked for | High       | High   | Requirements are parser-owned; stories must cite known IDs (enforced in the repair loop); `untraced-story` and `out-of-scope-overlap` rules               |
| Reviewers rubber-stamp generated stories because they look polished                 | Medium     | High   | Inferred content is labelled throughout; stories with only inferred criteria are warnings, not info; review is a required step (no direct push)           |
| Heuristic phrasing degrades on PRDs that do not follow common structure             | High       | Medium | Extraction warnings when nothing looks like a requirement; awkward phrasings fall back to literal text the linter flags; eval set to grow with messy PRDs |
| Score inflation: teams tune PRDs to the linter rather than to clarity               | Medium     | Medium | Score components shown separately; vague-term list is conservative; score positioned as a review aid and CI floor, not a target                           |
| Tracker import formats drift                                                        | Medium     | Low    | Exporters are small and snapshot-tested; README tells users to confirm column mapping on first import                                                     |
| Sending confidential PRDs to model vendors                                          | Medium     | High   | Offline default; LLM providers only run when explicitly selected and keyed                                                                                |

## Roadmap

**Now (v0.1, shipped in this repo)**

- Markdown ingestion with traceable, stable requirement IDs.
- Heuristic, Anthropic and OpenAI generators behind one validated contract.
- Linter with score and CI gate; GitHub, Jira, Linear, markdown and mermaid exports.
- Offline eval on three synthetic PRDs.

**Next**

- Run the eval against both LLM providers and publish the comparison, including cost and
  latency per PRD.
- Grow the eval set with deliberately messy PRDs (prose-only, mixed numbering, requirements
  hidden in tables of contents) and add a precision check for invented stories.
- Story splitting suggestions for `invest-small` findings, using the criteria as split points.
- PRD diff mode: re-run on a revised PRD and report added, removed and changed requirements by
  ID, with the stories each change affects.

**Later**

- Two-way sync with trackers. Push reviewed backlogs through the Jira, Linear and GitHub APIs,
  keep the requirement-to-issue mapping, and pull tracker edits back so the PRD trace stays
  true after sprint changes.
- Measure PM edit distance and acceptance rate from that sync loop. This is the metric that
  tells us whether the drafts actually save time.
- Google Docs and Confluence ingestion, with the same line-level traceability.
