# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

## [0.1.0] - 2026-10-07

### Added

- Line-accurate markdown reader and requirement extraction with content-addressed IDs and
  source line spans.
- zod schemas for epics, stories, acceptance criteria, estimates, dependencies and risks,
  with referential checks.
- Deterministic heuristic generator (default, offline) and Anthropic and OpenAI generators
  behind one interface, with a validation and repair loop.
- Backlog linter: INVEST, vague-language, testability and traceability rules, dependency
  cycle detection, and a 0-100 score with a `--min-score` CI gate.
- Exporters for GitHub Issues, Jira CSV, Linear CSV, markdown and mermaid.
- `prd2backlog` CLI and a Hono HTTP API.
- Offline eval harness with hand-written expectations for three synthetic PRDs.
- Static docs site (`npm run site`) with a PRD shown next to its generated backlog, deployed
  to GitHub Pages.

[0.1.0]: https://github.com/seanmcrae/prd-to-backlog/releases/tag/v0.1.0
