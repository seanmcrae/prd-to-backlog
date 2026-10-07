import { describe, expect, it } from "vitest";
import { formatReport, lintBacklog } from "../src/lint/index.js";
import { vagueTerms } from "../src/lint/rules.js";
import { makeBacklog, makeStory } from "./fixtures.js";

const rulesFor = (target: string, backlog = makeBacklog()) =>
  lintBacklog(backlog)
    .findings.filter((f) => f.target === target)
    .map((f) => f.rule);

describe("lintBacklog", () => {
  it("gives a clean fixture a perfect score", () => {
    const report = lintBacklog(makeBacklog());
    expect(report.findings).toEqual([]);
    expect(report).toMatchObject({ score: 100, grade: "A", storyQuality: 100 });
    expect(report.coverage).toEqual({ covered: 2, total: 2, percent: 100, uncovered: [] });
  });

  it("detects vague language as whole words only", () => {
    expect(vagueTerms("A fast, easy flow etc. and/or more")).toEqual([
      "fast",
      "easy",
      "etc",
      "and/or",
    ]);
    expect(vagueTerms("breakfast is steadfast")).toEqual([]);
    const backlog = makeBacklog({
      stories: [makeStory({ id: "ST-a1", iWant: "a fast and intuitive invite flow" })],
      dependencies: [],
    });
    const finding = lintBacklog(backlog).findings.find((f) => f.rule === "vague-language");
    expect(finding?.message).toContain('"fast", "intuitive"');
  });

  it("flags stories without criteria as errors", () => {
    const backlog = makeBacklog({
      stories: [makeStory({ id: "ST-a1", acceptanceCriteria: [] })],
      dependencies: [],
    });
    expect(rulesFor("ST-a1", backlog)).toContain("missing-acceptance-criteria");
  });

  it("flags untestable then-clauses on the criterion", () => {
    const story = makeStory({ id: "ST-a1" });
    const ac = story.acceptanceCriteria[0];
    if (!ac) throw new Error("fixture");
    story.acceptanceCriteria = [
      { ...ac, then: "the invite flow works properly" },
      { ...ac, id: "AC-a1-2", then: "it succeeds" },
    ];
    const backlog = makeBacklog({ stories: [story], dependencies: [] });
    expect(rulesFor("AC-a1-1", backlog)).toEqual(["untestable-criterion"]);
    expect(rulesFor("AC-a1-2", backlog)).toEqual(["untestable-criterion"]);
  });

  it("warns when every criterion was inferred", () => {
    const story = makeStory({ id: "ST-a1" });
    story.acceptanceCriteria = story.acceptanceCriteria.map((c) => ({ ...c, origin: "inferred" }));
    const finding = lintBacklog(makeBacklog({ stories: [story], dependencies: [] })).findings[0];
    expect(finding).toMatchObject({ rule: "inferred-criterion", severity: "warning" });
  });

  it("checks INVEST size, value and estimability", () => {
    const backlog = makeBacklog({
      stories: [
        makeStory({ id: "ST-a1", estimate: { points: 13, rationale: "big" }, soThat: "" }),
        makeStory({
          id: "ST-b2",
          title: "Accept",
          iWant: "to accept an invite",
          soThat: "accept an invite",
          requirementIds: ["REQ-b2"],
          estimate: undefined,
        }),
      ],
      dependencies: [],
    });
    const report = lintBacklog(backlog);
    const byTarget = (id: string) =>
      report.findings.filter((f) => f.target === id).map((f) => `${f.rule}:${f.severity}`);
    expect(byTarget("ST-a1")).toEqual(["invest-valuable:warning", "invest-small:error"]);
    expect(byTarget("ST-b2")).toEqual(["invest-valuable:warning", "invest-estimable:warning"]);
  });

  it("flags heavily-blocked stories and implementation detail", () => {
    const stories = ["a1", "b2", "c3", "d4"].map((k) =>
      makeStory({ id: `ST-${k}`, title: `Story ${k}`, iWant: `to do thing ${k}` }),
    );
    const last = stories[3];
    if (last) last.iWant = "to add a column to the invites database table";
    const backlog = makeBacklog({
      stories,
      dependencies: ["ST-a1", "ST-b2", "ST-c3"].map((from) => ({
        from,
        to: "ST-d4",
        kind: "inferred" as const,
        reason: "x",
      })),
    });
    expect(rulesFor("ST-d4", backlog)).toEqual(["invest-independent", "invest-negotiable"]);
  });

  it("reports orphan requirements and the coverage they cost", () => {
    const backlog = makeBacklog({ stories: [makeStory({ id: "ST-a1" })], dependencies: [] });
    const report = lintBacklog(backlog);
    expect(report.findings).toEqual([
      expect.objectContaining({ rule: "orphan-requirement", severity: "error", target: "REQ-b2" }),
    ]);
    expect(report.coverage.percent).toBe(50);
    expect(report.score).toBe(80);
  });

  it("flags untraced stories and out-of-scope overlap", () => {
    const backlog = makeBacklog({
      outOfScope: [
        { text: "Bulk CSV upload of invitees.", source: { line: 40, endLine: 40, section: [] } },
      ],
      stories: [
        makeStory({ id: "ST-a1" }),
        makeStory({ id: "ST-b2", requirementIds: ["REQ-b2"], title: "Accept", iWant: "to accept" }),
        makeStory({
          id: "ST-x9",
          title: "Bulk upload invitees from CSV",
          iWant: "to bulk upload invitees from a CSV file",
          requirementIds: [],
        }),
      ],
      dependencies: [],
    });
    expect(rulesFor("ST-x9", backlog)).toEqual(["untraced-story", "out-of-scope-overlap"]);
  });

  it("finds near-duplicate stories", () => {
    const backlog = makeBacklog({
      stories: [makeStory({ id: "ST-a1" }), makeStory({ id: "ST-b2", requirementIds: ["REQ-b2"] })],
      dependencies: [],
    });
    expect(rulesFor("ST-b2", backlog)).toEqual(["duplicate-story"]);
  });

  it("reports dependency cycles and penalises the score", () => {
    const backlog = makeBacklog({
      dependencies: [
        { from: "ST-a1", to: "ST-b2", kind: "inferred", reason: "x" },
        { from: "ST-b2", to: "ST-a1", kind: "explicit", reason: "y" },
      ],
    });
    const report = lintBacklog(backlog);
    expect(report.cycles).toEqual([["ST-a1", "ST-b2"]]);
    expect(report.findings[0]).toMatchObject({ rule: "dependency-cycle", severity: "error" });
    expect(report.score).toBe(90);
  });

  it("formats a readable report", () => {
    const backlog = makeBacklog({ stories: [makeStory({ id: "ST-a1" })], dependencies: [] });
    const text = formatReport(lintBacklog(backlog));
    expect(text).toContain("Score: 80/100 (B)");
    expect(text).toContain("Traceability: 1/2 requirements covered (50%)");
    expect(text).toMatch(/error\s+REQ-b2\s+orphan-requirement/);
  });
});
