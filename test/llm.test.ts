import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGenerators, createGenerator, MissingApiKeyError } from "../src/generate/index.js";
import { HeuristicGenerator } from "../src/generate/heuristic/index.js";
import { extractJson, LlmOutputError } from "../src/generate/llm/generator.js";
import { ProviderError, type FetchLike } from "../src/generate/llm/http.js";
import { extractPrd } from "../src/prd/extract.js";
import { generateFromMarkdown } from "../src/pipeline.js";

const markdown = readFileSync(new URL("../examples/team-invites.md", import.meta.url), "utf8");

/** A valid draft: the heuristic backlog minus the parser-owned fields. */
async function validDraft() {
  const { backlog } = await new HeuristicGenerator().generate({
    markdown,
    prd: extractPrd(markdown),
  });
  const { epics, stories, dependencies, risks } = backlog;
  return { epics, stories, dependencies, risks };
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(replies: (string | { status: number; body: string })[]): {
  fetchImpl: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    const next = replies.shift() ?? "";
    const reply = typeof next === "string" ? { status: 200, body: next } : next;
    return Promise.resolve(new Response(reply.body, { status: reply.status }));
  };
  return { fetchImpl, calls };
}

const openAiReply = (content: string) => JSON.stringify({ choices: [{ message: { content } }] });
const anthropicReply = (input: unknown) =>
  JSON.stringify({ content: [{ type: "tool_use", name: "backlog_draft", input }] });

describe("LLM generators (no network: fetch is faked)", () => {
  it("anthropic: forces a tool call and keeps parser-owned requirements", async () => {
    const { fetchImpl, calls } = fakeFetch([anthropicReply(await validDraft())]);
    const generator = createGenerator("anthropic", {
      env: { ANTHROPIC_API_KEY: "test-key" },
      model: "claude-test",
      fetchImpl,
    });
    const result = await generateFromMarkdown(markdown, generator);

    expect(result.attempts).toBe(1);
    expect(result.backlog.generator).toEqual({ name: "anthropic", model: "claude-test" });
    expect(result.backlog.requirements).toEqual(extractPrd(markdown).requirements);
    const [call] = calls;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.headers["x-api-key"]).toBe("test-key");
    expect(call?.body.tool_choice).toEqual({ type: "tool", name: "backlog_draft" });
    expect(JSON.stringify(call?.body.messages)).toContain("REQ-456a6d");
  });

  it("openai: repairs invalid output by feeding validation errors back", async () => {
    const draft = await validDraft();
    const broken = structuredClone(draft);
    const first = broken.stories[0];
    if (!first?.estimate) throw new Error("fixture");
    first.estimate.points = 4;
    first.requirementIds = ["REQ-invented"];

    const { fetchImpl, calls } = fakeFetch([
      openAiReply(JSON.stringify(broken)),
      openAiReply(JSON.stringify(draft)),
    ]);
    const generator = createGenerator("openai", { env: { OPENAI_API_KEY: "k" }, fetchImpl });
    const result = await generateFromMarkdown(markdown, generator);

    expect(result.attempts).toBe(2);
    expect(result.warnings).toContain("Model output needed 1 repair round(s).");
    const repair = JSON.stringify(calls[1]?.body.messages);
    expect(repair).toContain("Validation errors");
    expect(repair).toContain("stories.0.estimate.points");
    expect(calls[0]?.headers.authorization).toBe("Bearer k");
    expect(calls[0]?.body.response_format).toMatchObject({ type: "json_schema" });
  });

  it("repairs referential errors that the schema alone accepts", async () => {
    const draft = await validDraft();
    const untraced = structuredClone(draft);
    if (untraced.stories[1]) untraced.stories[1].requirementIds = [];
    const { fetchImpl, calls } = fakeFetch([
      openAiReply(JSON.stringify(untraced)),
      openAiReply(JSON.stringify(draft)),
    ]);
    const generator = createGenerator("openai", { env: { OPENAI_API_KEY: "k" }, fetchImpl });
    await generateFromMarkdown(markdown, generator);
    expect(JSON.stringify(calls[1]?.body.messages)).toContain("must cite a requirement");
  });

  it("gives up after maxAttempts with the last issues", async () => {
    const { fetchImpl, calls } = fakeFetch(["not json", "still not", "nope"].map(openAiReply));
    const generator = createGenerator("openai", { env: { OPENAI_API_KEY: "k" }, fetchImpl });
    await expect(generateFromMarkdown(markdown, generator)).rejects.toBeInstanceOf(LlmOutputError);
    expect(calls).toHaveLength(3);
  });

  it("surfaces provider HTTP errors", async () => {
    const { fetchImpl } = fakeFetch([{ status: 401, body: '{"error":"bad key"}' }]);
    const generator = createGenerator("anthropic", { env: { ANTHROPIC_API_KEY: "x" }, fetchImpl });
    await expect(generateFromMarkdown(markdown, generator)).rejects.toThrow(ProviderError);
  });

  it("requires API keys only for LLM providers", () => {
    expect(() => createGenerator("openai", { env: {} })).toThrow(MissingApiKeyError);
    expect(createGenerator("heuristic", { env: {} }).name).toBe("heuristic");
    expect(availableGenerators({})).toEqual(["heuristic"]);
    expect(availableGenerators({ OPENAI_API_KEY: "k" })).toEqual(["heuristic", "openai"]);
  });
});

describe("extractJson", () => {
  it("reads fenced or prose-wrapped JSON", () => {
    expect(extractJson('Here you go:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a": {"b": 2}} Hope that helps.')).toEqual({ a: { b: 2 } });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("no braces")).toThrow(SyntaxError);
  });
});
