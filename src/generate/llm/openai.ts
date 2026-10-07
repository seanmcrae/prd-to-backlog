import type { CompletionRequest, ModelClient } from "./generator.js";
import { postJson, type FetchLike } from "./http.js";

export interface OpenAiOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/**
 * OpenAI Chat Completions with a JSON-schema response format. Strict mode is off because the
 * draft schema has optional fields; the zod validation and repair loop enforce the contract.
 */
export class OpenAiClient implements ModelClient {
  readonly provider = "openai";
  readonly model: string;

  constructor(private readonly options: OpenAiOptions) {
    this.model = options.model ?? "gpt-4.1";
  }

  async complete(request: CompletionRequest): Promise<string> {
    const data = (await postJson(
      this.options.fetchImpl ?? fetch,
      this.provider,
      `${this.options.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`,
      { authorization: `Bearer ${this.options.apiKey}` },
      {
        model: this.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, schema: request.schema, strict: false },
        },
      },
    )) as { choices?: { message?: { content?: string | null } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}
