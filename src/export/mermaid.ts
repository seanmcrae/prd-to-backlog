import type { Backlog } from "../model/schema.js";
import { findCycles } from "../lint/graph.js";
import { formatPoints } from "./common.js";

function nodeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function label(text: string): string {
  return text.replace(/"/g, "#quot;").replace(/[<>]/g, "");
}

/** Story dependency graph, one subgraph per epic; stories in a cycle are highlighted. */
export function toMermaid(backlog: Backlog): string {
  const lines = ["graph LR"];
  for (const epic of backlog.epics) {
    const stories = backlog.stories.filter((s) => s.epicId === epic.id);
    if (stories.length === 0) continue;
    lines.push(`  subgraph ${nodeId(epic.id)}["${label(epic.title)}"]`);
    for (const s of stories) {
      const points = s.estimate ? ` (${formatPoints(s.estimate.points)})` : "";
      lines.push(`    ${nodeId(s.id)}["${label(`${s.id}: ${s.title}${points}`)}"]`);
    }
    lines.push("  end");
  }
  for (const d of backlog.dependencies) {
    const arrow = d.kind === "explicit" ? "-->" : "-.->";
    lines.push(`  ${nodeId(d.from)} ${arrow} ${nodeId(d.to)}`);
  }
  const cyclic = findCycles(
    backlog.stories.map((s) => s.id),
    backlog.dependencies,
  ).flat();
  if (cyclic.length > 0) {
    lines.push("  classDef cycle fill:#fde2e1,stroke:#c0392b,stroke-width:2px");
    lines.push(`  class ${cyclic.map(nodeId).join(",")} cycle`);
  }
  return `${lines.join("\n")}\n`;
}
