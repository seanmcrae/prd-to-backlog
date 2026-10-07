import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCriteria } from "../src/generate/heuristic/criteria.js";
import { estimateStory } from "../src/generate/heuristic/estimate.js";
import { HeuristicGenerator } from "../src/generate/heuristic/index.js";
import { phraseRequirement } from "../src/generate/heuristic/phrase.js";
import { validateBacklog } from "../src/model/schema.js";
import { generateFromMarkdown } from "../src/pipeline.js";

const example = (name: string) =>
  readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8");
const generator = new HeuristicGenerator();

describe("buildCriteria", () => {
  const phrase = phraseRequirement(
    "Admins can revoke a pending invite",
    [{ name: "Admin", description: "" }],
    "admin",
  );

  it("maps GWT, conditional and plain details", () => {
    const criteria = buildCriteria(
      "x",
      [
        "Given a pending invite, when the admin revokes it, then the link stops working.",
        "If the invite was accepted, then revoke is disabled.",
        "Revoked invites appear in the audit log.",
      ],
      phrase,
    );
    expect(criteria.map(({ given, when, then }) => [given, when, then])).toEqual([
      ["a pending invite", "the admin revokes it", "the link stops working"],
      ["an admin", "the invite was accepted", "revoke is disabled"],
      ["an admin", "the admin revokes a pending invite", "revoked invites appear in the audit log"],
    ]);
    expect(criteria.every((c) => c.origin === "prd")).toBe(true);
  });

  it("infers one criterion when the PRD gives none", () => {
    const [only, ...rest] = buildCriteria("x", [], phrase);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: "AC-x-1", origin: "inferred" });
  });
});

describe("estimateStory", () => {
  it("sizes a plain story at 1 point", () => {
    expect(estimateStory("Admins can view invites", 1).points).toBe(1);
  });

  it("adds criteria and complexity signals and explains them", () => {
    const e = estimateStory("Sync queued changes offline and resolve conflicts via webhook", 3);
    expect(e.points).toBe(8);
    expect(e.rationale).toContain("+2 for 3 acceptance criteria");
    expect(e.rationale).toContain("distributed-state complexity");
    expect(e.rationale).toContain("external integration (webhook)");
  });
});

describe("HeuristicGenerator", () => {
  it("produces a schema-valid backlog for every bundled example", async () => {
    for (const name of ["team-invites.md", "usage-based-billing.md", "mobile-offline-mode.md"]) {
      const { backlog } = await generateFromMarkdown(example(name), generator, `examples/${name}`);
      expect(validateBacklog(backlog).ok).toBe(true);
      expect(backlog.stories).toHaveLength(backlog.requirements.length);
      expect(backlog.source.path).toBe(`examples/${name}`);
    }
  });

  it("is deterministic", async () => {
    const md = example("team-invites.md");
    const a = await generateFromMarkdown(md, generator);
    const b = await generateFromMarkdown(md, generator);
    expect(JSON.stringify(a.backlog)).toBe(JSON.stringify(b.backlog));
  });

  it("groups stories into epics by thematic heading", async () => {
    const { backlog } = await generateFromMarkdown(example("team-invites.md"), generator);
    expect(backlog.epics.map((e) => e.title)).toEqual([
      "Sending invites",
      "Accepting invites",
      "Managing invites",
      "Team Invites: non-functional requirements",
    ]);
  });

  it("links explicit and inferred dependencies", async () => {
    const { backlog } = await generateFromMarkdown(example("usage-based-billing.md"), generator);
    const edges = backlog.dependencies.map((d) => `${d.from}->${d.to}:${d.kind}`);
    expect(edges).toContain("ST-FR-2->ST-FR-3:explicit");
    expect(edges).toContain("ST-FR-1->ST-FR-2:inferred");
    expect(edges).toContain("ST-FR-4->ST-FR-8:inferred");
  });

  it("derives risks from the PRD, open questions and external dependencies", async () => {
    const { backlog } = await generateFromMarkdown(example("usage-based-billing.md"), generator);
    expect(backlog.risks.map((r) => r.origin)).toEqual(["prd", "prd", "derived", "derived"]);
    expect(backlog.risks[0]).toMatchObject({ impact: "high", relatedIds: ["ST-FR-1"] });
  });

  it("warns and defaults the persona when the PRD has none", async () => {
    const result = await generateFromMarkdown(
      "# X\n\n## Requirements\n\n- Users can export reports\n",
      generator,
    );
    expect(result.backlog.stories[0]?.asA).toBe("user");
    expect(result.warnings).toContain("No personas section found; stories default to 'user'.");
  });
});
