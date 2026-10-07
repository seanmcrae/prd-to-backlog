import { describe, expect, it } from "vitest";
import { BacklogSchema, validateBacklog } from "../src/model/schema.js";
import { makeBacklog, makeStory } from "./fixtures.js";

describe("backlog schema", () => {
  it("accepts a well-formed backlog", () => {
    const result = validateBacklog(makeBacklog());
    expect(result.ok).toBe(true);
  });

  it("round-trips through JSON", () => {
    const backlog = makeBacklog();
    expect(BacklogSchema.parse(JSON.parse(JSON.stringify(backlog)))).toEqual(backlog);
  });

  it("rejects non-Fibonacci estimates with a readable path", () => {
    const backlog = makeBacklog({
      stories: [makeStory({ id: "ST-a1", estimate: { points: 4, rationale: "guess" } })],
      dependencies: [],
    });
    const result = validateBacklog(backlog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("stories.0.estimate.points");
      expect(result.issues[0]?.message).toMatch(/one of 1, 2, 3, 5, 8, 13, 21/);
    }
  });

  it("rejects malformed ids", () => {
    const result = validateBacklog(
      makeBacklog({ stories: [makeStory({ id: "STORY1" })], dependencies: [] }),
    );
    expect(result.ok).toBe(false);
  });

  it("reports dangling references and duplicates", () => {
    const backlog = makeBacklog({
      stories: [
        makeStory({ id: "ST-a1", requirementIds: ["REQ-zz"], epicId: "EP-missing" }),
        makeStory({ id: "ST-a1" }),
      ],
      dependencies: [{ from: "ST-a1", to: "ST-nope", kind: "explicit", reason: "x" }],
    });
    const result = validateBacklog(backlog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const messages = result.issues.map((i) => i.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          "duplicate id ST-a1",
          "unknown epic EP-missing",
          "unknown requirement REQ-zz",
          "unknown story ST-nope",
        ]),
      );
    }
  });

  it("flags self-dependencies", () => {
    const result = validateBacklog(
      makeBacklog({
        dependencies: [{ from: "ST-a1", to: "ST-a1", kind: "explicit", reason: "x" }],
      }),
    );
    expect(result.ok).toBe(false);
  });
});
