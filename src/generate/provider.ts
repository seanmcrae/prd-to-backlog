import type { Backlog } from "../model/schema.js";
import type { ExtractedPrd } from "../prd/extract.js";

export interface GenerateInput {
  markdown: string;
  prd: ExtractedPrd;
  /** Path recorded in the backlog's source block, when the PRD came from a file. */
  path?: string;
}

export interface GenerateResult {
  backlog: Backlog;
  warnings: string[];
  /** Model calls made; 0 for offline generators. */
  attempts: number;
}

/** Anything that can turn an extracted PRD into a schema-valid backlog. */
export interface BacklogGenerator {
  readonly name: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** Fields every generator copies straight from the PRD rather than generating. */
export function backlogShell(
  input: GenerateInput,
  generator: Backlog["generator"],
): Pick<Backlog, "schemaVersion" | "source" | "generator" | "requirements" | "outOfScope"> {
  return {
    schemaVersion: "1",
    source: {
      title: input.prd.title,
      ...(input.path ? { path: input.path } : {}),
      sha256: input.prd.sha256,
    },
    generator,
    requirements: input.prd.requirements,
    outOfScope: input.prd.outOfScope,
  };
}
