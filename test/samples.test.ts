import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportBacklog } from "../src/export/index.js";
import { HeuristicGenerator } from "../src/generate/heuristic/index.js";
import { generateFromMarkdown } from "../src/pipeline.js";

const root = new URL("..", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

// examples/output/ is committed; fail if it drifts from what the code produces (npm run demo).
describe.each(["team-invites", "usage-based-billing", "mobile-offline-mode"])(
  "committed sample output for %s",
  (name) => {
    it("matches a fresh heuristic run", async () => {
      const prdPath = `examples/${name}.md`;
      const { backlog } = await generateFromMarkdown(
        read(prdPath),
        new HeuristicGenerator(),
        prdPath,
      );
      expect(JSON.parse(read(`examples/output/${name}/backlog.json`))).toEqual(backlog);
      expect(read(`examples/output/${name}/jira.csv`)).toBe(exportBacklog(backlog, "jira"));
      expect(read(`examples/output/${name}/backlog.md`)).toBe(exportBacklog(backlog, "markdown"));
    });
  },
);
