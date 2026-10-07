import type { CompletionRequest, ModelClient } from "./generator.js";
import { postJson, type FetchLike } from "./http.js";

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

interface ContentBlock {
  type: string;
  input?: unknown;
  text?: string;
}

/**
 * Anthropic Messages API. Structured output is obtained by forcing a single tool call whose
 * input schema is the backlog draft schema.
 */
export class AnthropicClient implements ModelClient {
  readonly provider = "anthropic";
  readonly model: string;

  constructor(private readonly options: AnthropicOptions) {
    this.model = options.model ?? "claude-sonnet-4-5";
  }

  async complete(request: CompletionRequest): Promise<string> {
    const data = (await postJson(
      this.options.fetchImpl ?? fetch,
      this.provider,
      `${this.options.baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
      { "x-api-key": this.options.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: this.options.maxTokens ?? 16000,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        tools: [
          {
            name: request.schemaName,
            description: "Emit the backlog draft.",
            input_schema: request.schema,
          },
        ],
        tool_choice: { type: "tool", name: request.schemaName },
      },
    )) as { content?: ContentBlock[] };
    const blocks = data.content ?? [];
    const tool = blocks.find((b) => b.type === "tool_use");
    if (tool?.input !== undefined) return JSON.stringify(tool.input);
    return blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }
}
