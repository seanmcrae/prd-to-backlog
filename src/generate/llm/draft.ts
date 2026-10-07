import { z } from "zod";
import { BacklogSchema } from "../../model/schema.js";

/**
 * What a model is asked to produce. Requirements, scope cuts and source metadata are never
 * model output: they come from the parser, so a model cannot invent or reword them.
 */
export const DraftSchema = BacklogSchema.pick({
  epics: true,
  stories: true,
  dependencies: true,
  risks: true,
});

export type Draft = z.infer<typeof DraftSchema>;

/** JSON Schema handed to providers for structured output. */
export function draftJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DraftSchema, { io: "input", unrepresentable: "any" });
}
