import { readFile } from "node:fs/promises";
import { validateBacklog, type Backlog, type ValidationIssue } from "./model/schema.js";

export class BacklogFileError extends Error {
  constructor(
    readonly file: string,
    readonly issues: ValidationIssue[],
  ) {
    super(
      `${file} is not a valid backlog:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`,
    );
    this.name = "BacklogFileError";
  }
}

export async function readBacklog(file: string): Promise<Backlog> {
  const text = await readFile(file, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new BacklogFileError(file, [{ path: "(json)", message: (error as Error).message }]);
  }
  const result = validateBacklog(data);
  if (!result.ok) throw new BacklogFileError(file, result.issues);
  return result.backlog;
}
