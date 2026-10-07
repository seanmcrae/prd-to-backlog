import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { run, type CliIo } from "../src/cli.js";
import { BacklogSchema } from "../src/model/schema.js";
import { makeBacklog } from "./fixtures.js";

function capture(env: Record<string, string | undefined> = {}) {
  const io = { stdout: "", stderr: "" };
  const cli: CliIo = {
    out: (t) => (io.stdout += t),
    err: (t) => (io.stderr += t),
    env,
  };
  return { io, cli };
}

const EXAMPLE = new URL("../examples/team-invites.md", import.meta.url).pathname;

describe("prd2backlog CLI", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prd2backlog-"));
  });

  it("generate writes a valid backlog.json and backlog.md and prints a summary", async () => {
    const { io, cli } = capture();
    expect(await run(["generate", EXAMPLE, "--out", dir], cli)).toBe(0);
    const backlog = BacklogSchema.parse(
      JSON.parse(await readFile(join(dir, "backlog.json"), "utf8")),
    );
    expect(backlog.stories).toHaveLength(12);
    expect(await readFile(join(dir, "backlog.md"), "utf8")).toContain("# Backlog: Team Invites");
    expect(io.stdout).toMatch(/Parsed 12 requirements/);
    expect(io.stdout).toMatch(/Lint score \d+\/100/);
  });

  it("lint prints text or JSON and enforces --min-score", async () => {
    const file = join(dir, "backlog.json");
    await writeFile(
      file,
      JSON.stringify(makeBacklog({ stories: makeBacklog().stories.slice(0, 1), dependencies: [] })),
    );

    const text = capture();
    expect(await run(["lint", file], text.cli)).toBe(0);
    expect(text.io.stdout).toContain("Score: 80/100 (B)");

    const json = capture();
    expect(await run(["lint", file, "--format", "json"], json.cli)).toBe(0);
    expect(JSON.parse(json.io.stdout)).toMatchObject({ score: 80, coverage: { percent: 50 } });

    const gate = capture();
    expect(await run(["lint", file, "--min-score", "90"], gate.cli)).toBe(1);
    expect(gate.io.stderr).toContain("Score 80 is below 90");
  });

  it("export writes each format to stdout or a file", async () => {
    const file = join(dir, "backlog.json");
    await writeFile(file, JSON.stringify(makeBacklog()));

    const stdout = capture();
    expect(await run(["export", file, "--format", "github"], stdout.cli)).toBe(0);
    expect(JSON.parse(stdout.io.stdout)).toHaveLength(3);

    const out = join(dir, "jira.csv");
    const toFile = capture();
    expect(await run(["export", file, "--format", "jira", "--out", out], toFile.cli)).toBe(0);
    expect(await readFile(out, "utf8")).toMatch(/^Issue Id,Issue Type/);
  });

  it("reports schema problems in a backlog file with exit code 2", async () => {
    const file = join(dir, "bad.json");
    await writeFile(file, JSON.stringify({ ...makeBacklog(), stories: [{ id: "nope" }] }));
    const { io, cli } = capture();
    expect(await run(["lint", file], cli)).toBe(2);
    expect(io.stderr).toContain("is not a valid backlog");
    expect(io.stderr).toContain("stories.0");
  });

  it("rejects malformed JSON and unknown formats", async () => {
    const file = join(dir, "broken.json");
    await writeFile(file, "{ not json");
    expect(await run(["lint", file], capture().cli)).toBe(2);

    const unknown = capture();
    expect(await run(["export", file, "--format", "trello"], unknown.cli)).toBe(1);
    expect(unknown.io.stderr).toContain(
      "Allowed choices are github, jira, linear, markdown, mermaid",
    );
  });

  it("explains a missing API key instead of calling a provider", async () => {
    const { io, cli } = capture({});
    expect(await run(["generate", EXAMPLE, "--provider", "anthropic", "--out", dir], cli)).toBe(2);
    expect(io.stderr).toContain("ANTHROPIC_API_KEY is not set");
  });
});
