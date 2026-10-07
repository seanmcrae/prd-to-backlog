import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifySection, extractPrd, requirementId } from "../src/prd/extract.js";

const example = (name: string) =>
  readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8");

describe("classifySection", () => {
  it.each([
    ["Requirements", "requirements"],
    ["Functional requirements", "requirements"],
    ["Non-functional requirements", "nonFunctional"],
    ["Out of scope", "outOfScope"],
    ["Non-goals", "outOfScope"],
    ["Target users", "personas"],
    ["Success metrics", "goals"],
    ["Open questions", "openQuestions"],
    ["Must have", "requirements"],
    ["Background", "context"],
    ["Sending invites", "other"],
  ])("%s -> %s", (title, role) => {
    expect(classifySection(title)).toBe(role);
  });
});

describe("requirementId", () => {
  it("is stable under whitespace, case and punctuation changes", () => {
    expect(requirementId("Admins can revoke an invite.")).toBe(
      requirementId("  admins can REVOKE an invite "),
    );
  });

  it("prefers an explicit PRD id", () => {
    expect(requirementId("anything", "FR-7")).toBe("REQ-FR-7");
  });
});

describe("extractPrd", () => {
  it("extracts nested bullets with details, kinds, priorities and source lines", () => {
    const prd = extractPrd(example("team-invites.md"));
    expect(prd.title).toBe("Team Invites");
    expect(prd.requirements).toHaveLength(12);
    const invite = prd.requirements[0];
    expect(invite).toMatchObject({
      text: "Workspace admins can invite teammates by entering one or more email addresses.",
      kind: "functional",
      priority: "should",
      source: {
        line: 27,
        endLine: 30,
        section: ["Team Invites", "Requirements", "Sending invites"],
      },
    });
    expect(invite?.details).toHaveLength(3);
    const nfr = prd.requirements.filter((r) => r.kind === "non-functional");
    expect(nfr.map((r) => r.priority)).toEqual(["must", "must", "must"]);
  });

  it("collects personas, goals, scope cuts, risks and open questions", () => {
    const prd = extractPrd(example("team-invites.md"));
    expect(prd.personas.map((p) => p.name)).toEqual([
      "Workspace admin",
      "Invitee",
      "Security reviewer",
    ]);
    expect(prd.goals).toHaveLength(3);
    expect(prd.outOfScope.map((s) => s.text)).toContain("Bulk CSV upload of invitees.");
    expect(prd.risks).toHaveLength(2);
    expect(prd.openQuestions).toHaveLength(1);
    expect(prd.problem).toMatch(/^New workspaces stall/);
    expect(prd.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads requirement tables with explicit ids and attaches acceptance notes by id", () => {
    const prd = extractPrd(example("usage-based-billing.md"));
    const fr1 = prd.requirements.find((r) => r.sourceId === "FR-1");
    expect(fr1?.id).toBe("REQ-FR-1");
    expect(fr1?.details).toEqual([
      "If the same idempotency key is received twice, then usage is counted once.",
    ]);
    expect(prd.requirements.find((r) => r.sourceId === "FR-8")?.priority).toBe("could");
    expect(prd.externalDependencies).toHaveLength(1);
    expect(prd.warnings).toEqual([]);
  });

  it("splits prose into modal sentences and uses priority buckets from headings", () => {
    const prd = extractPrd(example("mobile-offline-mode.md"));
    const functional = prd.requirements.filter((r) => r.kind === "functional");
    expect(functional).toHaveLength(7);
    expect(functional[0]?.details).toEqual([
      "The download includes checklists, prior findings and site documents.",
    ]);
    // "should" sentence under "Must have" takes the heading's bucket.
    expect(functional[5]?.priority).toBe("must");
    expect(functional[6]?.priority).toBe("could");
  });

  it("keeps IDs stable when unrelated requirements are inserted", () => {
    const base = "## Requirements\n\n- Admins can export data\n- Users can log in\n";
    const edited =
      "## Requirements\n\n- Users can reset passwords\n- Admins can export data\n- Users can log in\n";
    const before = extractPrd(base).requirements.map((r) => r.id);
    const after = extractPrd(edited).requirements.map((r) => r.id);
    expect(after.slice(1)).toEqual(before);
  });

  it("suffixes duplicate requirement text and warns", () => {
    const prd = extractPrd("## Requirements\n\n- Users can log in\n- Users can log in\n");
    const [a, b] = prd.requirements;
    expect(b?.id).toBe(`${a?.id ?? ""}-2`);
    expect(prd.warnings[0]).toMatch(/Duplicate requirement/);
  });

  it("warns when nothing looks like a requirement", () => {
    const prd = extractPrd("# Notes\n\nSome thoughts.\n");
    expect(prd.requirements).toEqual([]);
    expect(prd.warnings[0]).toMatch(/No requirements found/);
  });
});
