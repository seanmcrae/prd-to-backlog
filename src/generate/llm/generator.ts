import { checkReferences, type Backlog, type ValidationIssue } from "../../model/schema.js";
import {
  backlogShell,
  type BacklogGenerator,
  type GenerateInput,
  type GenerateResult,
} from "../provider.js";
import { DraftSchema, draftJsonSchema } from "./draft.js";
import { buildPrompt, repairPrompt, type Prompt } from "./prompt.js";

export interface CompletionRequest extends Prompt {
  schema: Record<string, unknown>;
  schemaName: string;
}

/** Minimal surface a model provider must offer: one structured completion. */
export interface ModelClient {
  readonly provider: string;
  readonly model: string;
  complete(request: CompletionRequest): Promise<string>;
}

export class LlmOutputError extends Error {
  constructor(
    readonly attempts: number,
    readonly issues: ValidationIssue[],
  ) {
    super(
      `Model output still invalid after ${attempts} attempts: ${issues
        .slice(0, 3)
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "LlmOutputError";
  }
}

/** Pull the JSON object out of a reply that may be wrapped in prose or a code fence. */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)?.[1];
  const text = fenced ?? raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON object found in model output");
  return JSON.parse(text.slice(start, end + 1));
}

/** Rules that hold for model output but not for every backlog (e.g. hand-edited ones). */
function modelOutputIssues(backlog: Backlog): ValidationIssue[] {
  const issues = checkReferences(backlog);
  backlog.stories.forEach((s, i) => {
    if (s.requirementIds.length === 0) {
      issues.push({ path: `stories[${i}].requirementIds`, message: "must cite a requirement" });
    }
  });
  return issues;
}

/**
 * Provider-agnostic LLM generator: prompt, parse, validate against the zod schema and the
 * referential rules, and on failure re-prompt with the exact validation errors.
 */
export class LlmGenerator implements BacklogGenerator {
  readonly name: string;

  constructor(
    private readonly client: ModelClient,
    private readonly maxAttempts = 3,
  ) {
    this.name = client.provider;
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const base = buildPrompt(input.prd, input.markdown);
    const schema = draftJsonSchema();
    let prompt = base;
    let issues: ValidationIssue[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const raw = await this.client.complete({ ...prompt, schema, schemaName: "backlog_draft" });
      let parsed: unknown;
      try {
        parsed = extractJson(raw);
      } catch (error) {
        issues = [{ path: "(root)", message: `invalid JSON: ${(error as Error).message}` }];
        prompt = repairPrompt(base, raw, issues);
        continue;
      }
      const draft = DraftSchema.safeParse(parsed);
      if (!draft.success) {
        issues = draft.error.issues.map((i) => ({
          path: i.path.join(".") || "(root)",
          message: i.message,
        }));
        prompt = repairPrompt(base, raw, issues);
        continue;
      }
      const backlog: Backlog = {
        ...backlogShell(input, { name: this.name, model: this.client.model }),
        ...draft.data,
      };
      issues = modelOutputIssues(backlog);
      if (issues.length === 0) {
        const warnings = [...input.prd.warnings];
        if (attempt > 1) warnings.push(`Model output needed ${attempt - 1} repair round(s).`);
        return { backlog, warnings, attempts: attempt };
      }
      prompt = repairPrompt(base, raw, issues);
    }
    throw new LlmOutputError(this.maxAttempts, issues);
  }
}
