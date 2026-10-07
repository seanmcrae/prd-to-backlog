import { describe, expect, it } from "vitest";
import {
  cleanRequirementText,
  conjugate,
  matchPersona,
  phraseRequirement,
} from "../src/generate/heuristic/phrase.js";

const personas = [
  { name: "Workspace admin", description: "" },
  { name: "Field inspector", description: "" },
  { name: "Invitee", description: "" },
];

describe("phraseRequirement", () => {
  it("maps a persona subject to as-a / I-want", () => {
    const p = phraseRequirement("Workspace admins can revoke a pending invite.", personas, "user");
    expect(p).toMatchObject({
      asA: "workspace admin",
      iWant: "to revoke a pending invite",
      title: "Revoke a pending invite",
      subjectKind: "persona",
    });
  });

  it("matches a persona by head noun", () => {
    expect(matchPersona("Inspectors", personas)).toBe("field inspector");
    expect(matchPersona("Developers", personas)).toBeUndefined();
  });

  it("unwraps 'the app must let <persona> ...'", () => {
    const p = phraseRequirement(
      "The app must let inspectors fill in checklists while offline.",
      personas,
      "user",
    );
    expect(p.asA).toBe("field inspector");
    expect(p.iWant).toBe("to fill in checklists while offline");
  });

  it("phrases system requirements for the default persona", () => {
    const p = phraseRequirement("The system must rate-limit invites.", personas, "workspace admin");
    expect(p).toMatchObject({
      asA: "workspace admin",
      iWant: "the system to rate-limit invites",
      subjectKind: "system",
    });
  });

  it("keeps a non-persona subject in the want clause", () => {
    const p = phraseRequirement(
      "Invite links must expire after 7 days.",
      personas,
      "workspace admin",
    );
    expect(p.iWant).toBe("invite links to expire after 7 days");
    expect(p.subject).toBe("Invite links");
  });

  it("splits off a leading condition and a benefit clause", () => {
    const p = phraseRequirement(
      "When connectivity returns, inspectors can sync notes so that nothing is lost.",
      personas,
      "user",
    );
    expect(p.condition).toBe("connectivity returns");
    expect(p.benefit).toBe("nothing is lost");
    expect(p.outcome).toBe("inspectors can sync notes so that nothing is lost");
  });

  it("passes through explicit user stories", () => {
    const p = phraseRequirement("As an invitee, I want to join with one click", personas, "user");
    expect(p).toMatchObject({ asA: "invitee", iWant: "to join with one click" });
  });

  it("strips dependency notes from the text", () => {
    expect(cleanRequirementText("Admins can export CSV. Depends on FR-2 and FR-3.")).toBe(
      "Admins can export CSV",
    );
  });

  it("conjugates the leading verb", () => {
    expect(conjugate("resend a link")).toBe("resends a link");
    expect(conjugate("query usage")).toBe("queries usage");
    expect(conjugate("push changes")).toBe("pushes changes");
    expect(conjugate("be encrypted")).toBe("is encrypted");
  });
});
