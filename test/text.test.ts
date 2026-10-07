import { describe, expect, it } from "vitest";
import {
  contentTokens,
  jaccard,
  singularize,
  stem,
  stripInlineMarkdown,
  truncateWords,
} from "../src/text.js";

describe("text utilities", () => {
  it("strips inline markdown but keeps visible text", () => {
    expect(stripInlineMarkdown("**Admins** can use `invite` via [the page](http://x) _now_")).toBe(
      "Admins can use invite via the page now",
    );
  });

  it("does not treat snake_case as emphasis", () => {
    expect(stripInlineMarkdown("set max_seats_per_plan")).toBe("set max_seats_per_plan");
  });

  it("stems common suffixes", () => {
    expect(stem("invites")).toBe("invit");
    expect(stem("invite")).toBe("invit");
    expect(stem("policies")).toBe("policy");
    expect(stem("syncing")).toBe("sync");
  });

  it("computes token overlap", () => {
    const a = contentTokens("Admins can invite teammates by email");
    const b = contentTokens("Invite a teammate using their email address");
    expect(jaccard(a, b)).toBeGreaterThan(0.3);
    expect(jaccard([], b)).toBe(0);
  });

  it("singularizes trailing plurals only", () => {
    expect(singularize("workspace admins")).toBe("workspace admin");
    expect(singularize("finance team")).toBe("finance team");
    expect(singularize("access")).toBe("access");
  });

  it("truncates on word boundaries", () => {
    expect(truncateWords("one two three four five", 12)).toBe("one two...");
    expect(truncateWords("short", 12)).toBe("short");
  });
});
