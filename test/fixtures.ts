import type { Backlog, Story } from "../src/model/schema.js";

const source = (line: number) => ({ line, endLine: line, section: ["Requirements"] });

export function makeStory(overrides: Partial<Story> & Pick<Story, "id">): Story {
  return {
    epicId: "EP-core",
    title: "Invite teammates by email",
    asA: "workspace admin",
    iWant: "to invite teammates by email",
    soThat: "my team can collaborate in one workspace",
    acceptanceCriteria: [
      {
        id: `AC-${overrides.id.slice(3)}-1`,
        given: "a workspace admin on the members page",
        when: "they submit a valid email address",
        then: "an invite email is sent and the invite shows as pending",
        origin: "prd",
      },
    ],
    requirementIds: ["REQ-a1"],
    estimate: { points: 3, rationale: "Base 1; +2 for email delivery" },
    priority: "must",
    labels: [],
    ...overrides,
  };
}

/** Small hand-built backlog used across unit tests. */
export function makeBacklog(overrides: Partial<Backlog> = {}): Backlog {
  return {
    schemaVersion: "1",
    source: { title: "Fixture PRD", sha256: "0".repeat(64) },
    generator: { name: "fixture" },
    requirements: [
      {
        id: "REQ-a1",
        text: "Admins can invite teammates by email",
        kind: "functional",
        priority: "must",
        details: [],
        source: source(10),
      },
      {
        id: "REQ-b2",
        text: "Invitees can accept an invite",
        kind: "functional",
        priority: "must",
        details: [],
        source: source(11),
      },
    ],
    outOfScope: [],
    epics: [
      { id: "EP-core", title: "Invites", description: "", requirementIds: ["REQ-a1", "REQ-b2"] },
    ],
    stories: [
      makeStory({ id: "ST-a1" }),
      makeStory({
        id: "ST-b2",
        title: "Accept an invite",
        asA: "invitee",
        iWant: "to accept an invite from the email link",
        soThat: "I can join the workspace",
        requirementIds: ["REQ-b2"],
      }),
    ],
    dependencies: [{ from: "ST-a1", to: "ST-b2", kind: "inferred", reason: "acts on invite" }],
    risks: [],
    ...overrides,
  };
}
