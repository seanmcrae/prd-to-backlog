#!/bin/sh
# Regenerate examples/output/ from the bundled synthetic PRDs using the offline generator.
set -eu
cd "$(dirname "$0")/.."
cli="node dist/bin.js"
for prd in examples/*.md; do
  name=$(basename "$prd" .md)
  out="examples/output/$name"
  $cli generate "$prd" --out "$out"
  $cli lint "$out/backlog.json" > "$out/lint.txt"
  $cli export "$out/backlog.json" --format github --out "$out/github-issues.json"
  $cli export "$out/backlog.json" --format jira --out "$out/jira.csv"
  $cli export "$out/backlog.json" --format linear --out "$out/linear.csv"
  $cli export "$out/backlog.json" --format mermaid --out "$out/dependencies.mmd"
done
