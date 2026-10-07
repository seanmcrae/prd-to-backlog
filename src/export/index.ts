import type { Backlog } from "../model/schema.js";
import { toGithubIssues } from "./github.js";
import { toJiraCsv } from "./jira.js";
import { toLinearCsv } from "./linear.js";
import { toMarkdown } from "./markdown.js";
import { toMermaid } from "./mermaid.js";

export const EXPORT_FORMATS = ["github", "jira", "linear", "markdown", "mermaid"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXTENSIONS: Record<ExportFormat, string> = {
  github: "github-issues.json",
  jira: "jira.csv",
  linear: "linear.csv",
  markdown: "md",
  mermaid: "mmd",
};

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function exportBacklog(backlog: Backlog, format: ExportFormat): string {
  switch (format) {
    case "github":
      return `${JSON.stringify(toGithubIssues(backlog), null, 2)}\n`;
    case "jira":
      return toJiraCsv(backlog);
    case "linear":
      return toLinearCsv(backlog);
    case "markdown":
      return toMarkdown(backlog);
    case "mermaid":
      return toMermaid(backlog);
  }
}
