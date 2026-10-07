import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";
import { makeBacklog } from "./fixtures.js";

const app = createApp({ env: {} });
const markdown = readFileSync(
  new URL("../examples/usage-based-billing.md", import.meta.url),
  "utf8",
);

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("HTTP API", () => {
  it("reports health", async () => {
    const res = await app.request("/health");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("generates a backlog with its lint report", async () => {
    const res = await post("/generate", { markdown, path: "billing.md" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      backlog: { stories: unknown[]; source: { path: string } };
      lint: { coverage: { percent: number } };
    };
    expect(body.backlog.stories).toHaveLength(11);
    expect(body.backlog.source.path).toBe("billing.md");
    expect(body.lint.coverage.percent).toBe(100);
  });

  it("validates request bodies", async () => {
    expect((await post("/generate", { markdown: "" })).status).toBe(400);
    expect((await post("/generate", "not json")).status).toBe(400);
    expect((await post("/generate", { markdown, provider: "gemini" })).status).toBe(400);
  });

  it("returns 500 with a message when a provider cannot be created", async () => {
    const res = await post("/generate", { markdown, provider: "openai" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain("OPENAI_API_KEY");
  });

  it("lints a posted backlog and rejects invalid ones with 422", async () => {
    const ok = await post("/lint", { backlog: makeBacklog() });
    expect(((await ok.json()) as { score: number }).score).toBe(100);
    const bad = await post("/lint", { backlog: { schemaVersion: "1" } });
    expect(bad.status).toBe(422);
  });

  it("exports a posted backlog", async () => {
    const res = await post("/export", { backlog: makeBacklog(), format: "mermaid" });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^graph LR/);
  });
});
