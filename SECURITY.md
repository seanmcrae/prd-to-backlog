# Security policy

## Supported versions

Only the latest release on `main` receives fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/seanmcrae/prd-to-backlog/security/advisories/new)
rather than a public issue. Include steps to reproduce and the version or commit you tested.
You should get a first response within a week.

## Scope notes

- `prd2backlog serve` is a stateless HTTP API for local or internal use. It binds to
  `127.0.0.1` unless you pass `--host`, and rejects request bodies over 1 MB. It has no
  authentication, and a request can select an LLM provider, which spends the server's API
  keys. Put it behind a proxy that adds authentication before exposing it to a network.
- With `--provider anthropic` or `--provider openai`, the full PRD text is sent to that
  vendor's API. The default heuristic generator never makes network calls.
- API keys are read from environment variables only and are never written to output files.
