import { Hono } from "hono";
import { z } from "zod";
import { EXPORT_FORMATS, exportBacklog } from "./export/index.js";
import { createGenerator, GENERATORS, type GeneratorOptions } from "./generate/index.js";
import { lintBacklog } from "./lint/index.js";
import { validateBacklog } from "./model/schema.js";
import { generateFromMarkdown } from "./pipeline.js";

const GenerateBody = z.object({
  markdown: z.string().min(1),
  provider: z.enum(GENERATORS).default("heuristic"),
  path: z.string().optional(),
});
const ExportBody = z.object({ backlog: z.unknown(), format: z.enum(EXPORT_FORMATS) });

/** Small JSON API over the same pipeline as the CLI. Stateless; nothing is stored. */
export function createApp(options: GeneratorOptions = {}): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/generate", async (c) => {
    const body = GenerateBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400);
    const { markdown, provider, path } = body.data;
    const result = await generateFromMarkdown(markdown, createGenerator(provider, options), path);
    return c.json({
      backlog: result.backlog,
      lint: lintBacklog(result.backlog),
      warnings: result.warnings,
    });
  });

  app.post("/lint", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { backlog?: unknown } | null;
    const checked = validateBacklog(body?.backlog);
    if (!checked.ok) return c.json({ error: "invalid backlog", issues: checked.issues }, 422);
    return c.json(lintBacklog(checked.backlog));
  });

  app.post("/export", async (c) => {
    const body = ExportBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400);
    const checked = validateBacklog(body.data.backlog);
    if (!checked.ok) return c.json({ error: "invalid backlog", issues: checked.issues }, 422);
    const type = body.data.format === "github" ? "application/json" : "text/plain";
    return c.body(exportBacklog(checked.backlog, body.data.format), 200, {
      "content-type": `${type}; charset=utf-8`,
    });
  });

  app.onError((error, c) => c.json({ error: error.message }, 500));
  return app;
}
