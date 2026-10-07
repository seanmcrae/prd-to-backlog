# Contributing

Issues and pull requests are welcome. For anything larger than a small fix, open an issue
first so we can agree on the approach before you write code.

## Setup

Node 20 or later.

```sh
npm ci
npm run check   # lint, format check, type check, tests
```

No API keys are needed. The default heuristic generator runs offline, and the LLM adapters
are tested against faked HTTP responses.

## Before you open a pull request

Run the same steps CI runs:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run eval
npm run site
```

- Keep tests deterministic and offline. Do not add tests that call a live model or any
  network service.
- If your change alters generated output, run `npm run demo` to regenerate
  `examples/output/` and `npm run chart` to regenerate `docs/img/eval-results.svg`, and
  commit the results. Tests fail when either drifts from what the code produces.
- If you change the eval or the linter's scoring, update the numbers quoted in `README.md`
  and `docs/PRODUCT.md` from a fresh `npm run eval` run.
- New example PRDs must be synthetic and say so in their header. Do not commit real company
  documents.
- Use imperative commit messages that say what changed ("Add Linear CSV estimate column").

## Project layout

See the "Project layout" section of the [README](README.md#project-layout).

## Reporting security issues

Please do not open a public issue. See [SECURITY.md](SECURITY.md).
