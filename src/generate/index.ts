import { HeuristicGenerator } from "./heuristic/index.js";
import { AnthropicClient } from "./llm/anthropic.js";
import { LlmGenerator } from "./llm/generator.js";
import type { FetchLike } from "./llm/http.js";
import { OpenAiClient } from "./llm/openai.js";
import type { BacklogGenerator } from "./provider.js";

export const GENERATORS = ["heuristic", "anthropic", "openai"] as const;
export type GeneratorName = (typeof GENERATORS)[number];

export interface GeneratorOptions {
  model?: string;
  maxAttempts?: number;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
}

export class MissingApiKeyError extends Error {
  constructor(readonly variable: string) {
    super(`${variable} is not set; export it or use --provider heuristic (the offline default).`);
    this.name = "MissingApiKeyError";
  }
}

export function isGeneratorName(value: string): value is GeneratorName {
  return (GENERATORS as readonly string[]).includes(value);
}

/** Generators whose API key is present in the environment (heuristic is always available). */
export function availableGenerators(env: Record<string, string | undefined>): GeneratorName[] {
  return GENERATORS.filter(
    (g) =>
      g === "heuristic" ||
      (g === "anthropic" && env.ANTHROPIC_API_KEY) ||
      (g === "openai" && env.OPENAI_API_KEY),
  );
}

export function createGenerator(
  name: GeneratorName,
  options: GeneratorOptions = {},
): BacklogGenerator {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};
  switch (name) {
    case "heuristic":
      return new HeuristicGenerator();
    case "anthropic": {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new MissingApiKeyError("ANTHROPIC_API_KEY");
      const model = options.model ?? env.ANTHROPIC_MODEL;
      return new LlmGenerator(
        new AnthropicClient({ apiKey, ...(model ? { model } : {}), ...fetchImpl }),
        options.maxAttempts,
      );
    }
    case "openai": {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) throw new MissingApiKeyError("OPENAI_API_KEY");
      const model = options.model ?? env.OPENAI_MODEL;
      return new LlmGenerator(
        new OpenAiClient({ apiKey, ...(model ? { model } : {}), ...fetchImpl }),
        options.maxAttempts,
      );
    }
  }
}
