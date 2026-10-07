import type { BacklogGenerator, GenerateResult } from "./generate/provider.js";
import { validateBacklog } from "./model/schema.js";
import { extractPrd } from "./prd/extract.js";

export class InvalidBacklogError extends Error {
  constructor(
    readonly generator: string,
    readonly issues: { path: string; message: string }[],
  ) {
    super(
      `${generator} produced an invalid backlog: ${issues
        .slice(0, 5)
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "InvalidBacklogError";
  }
}

/** PRD markdown in, schema-validated backlog out. */
export async function generateFromMarkdown(
  markdown: string,
  generator: BacklogGenerator,
  path?: string,
): Promise<GenerateResult> {
  const prd = extractPrd(markdown);
  const result = await generator.generate({ markdown, prd, ...(path ? { path } : {}) });
  const checked = validateBacklog(result.backlog);
  if (!checked.ok) throw new InvalidBacklogError(generator.name, checked.issues);
  return { ...result, backlog: checked.backlog };
}
