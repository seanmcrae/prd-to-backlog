/**
 * Turns a parsed PRD into structured inputs for backlog generation: requirements with stable
 * IDs and source spans, plus the context around them (personas, goals, scope cuts, risks).
 */
import { createHash } from "node:crypto";
import type { Priority, Requirement, ScopeItem, SourceRef } from "../model/schema.js";
import { contentTokens, jaccard, stripInlineMarkdown } from "../text.js";
import {
  parseMarkdown,
  type Block,
  type ListItemBlock,
  type Section,
  type TableBlock,
} from "./markdown.js";

export type SectionRole =
  | "requirements"
  | "nonFunctional"
  | "acceptance"
  | "outOfScope"
  | "goals"
  | "personas"
  | "risks"
  | "openQuestions"
  | "dependencies"
  | "context"
  | "other";

export interface Persona {
  name: string;
  description: string;
}

export interface NoteItem {
  text: string;
  source: SourceRef;
}

export interface SectionInfo {
  path: string[];
  role: SectionRole;
  summary: string;
  line: number;
  endLine: number;
}

export interface ExtractedPrd {
  title: string;
  sha256: string;
  problem: string;
  requirements: Requirement[];
  personas: Persona[];
  goals: string[];
  outOfScope: ScopeItem[];
  risks: NoteItem[];
  openQuestions: NoteItem[];
  externalDependencies: NoteItem[];
  sections: SectionInfo[];
  warnings: string[];
}

// Order matters: the first matching role wins ("Non-functional requirements" is not
// "requirements"; "Out of scope" is not "scope").
const ROLE_PATTERNS: [SectionRole, RegExp][] = [
  ["outOfScope", /\b(out[- ]of[- ]scope|non[- ]?goals?|not in scope|won'?t have|exclusions?)\b/i],
  [
    "nonFunctional",
    /\b(non[- ]?functional|nfrs?|performance|security|reliability|scalability|accessibility|compliance|privacy|quality attributes?|constraints?)\b/i,
  ],
  ["acceptance", /\bacceptance\b/i],
  [
    "requirements",
    /\b(requirements?|functional|features?|capabilit(y|ies)|scope|user stories|stories|must[- ]have|should[- ]have|could[- ]have|nice[- ]to[- ]have|specifications?|functionality)\b/i,
  ],
  ["openQuestions", /\b(open questions?|questions|unknowns|tbd)\b/i],
  ["risks", /\b(risks?|assumptions?|concerns?|mitigations?)\b/i],
  ["dependencies", /\bdependenc(y|ies)\b/i],
  ["goals", /\b(goals?|objectives?|success|metrics|kpis?|outcomes?)\b/i],
  ["personas", /\b(users?|personas?|audiences?|customers?|stakeholders?|actors?|roles)\b/i],
  ["context", /\b(problem|background|overview|context|summary|motivation|introduction)\b/i],
];

export function classifySection(title: string): SectionRole {
  for (const [role, pattern] of ROLE_PATTERNS) if (pattern.test(title)) return role;
  return "other";
}

function sectionPriority(title: string): Priority | undefined {
  if (/\bmust[- ]have\b/i.test(title)) return "must";
  if (/\bshould[- ]have\b/i.test(title)) return "should";
  if (/\b(nice[- ]to[- ]have|could[- ]have|stretch)\b/i.test(title)) return "could";
  return undefined;
}

const EXPLICIT_ID = /^\[?([A-Z]{1,6}-\d+(?:\.\d+)?)\]?\s*[:.)\u2013\u2014-]?\s+/;
const MODAL = /\b(must|shall|should|needs? to|is required to|are required to|can|could|may)\b/i;
const SENTENCE = /(?<=[.!?])\s+(?=[A-Z])/;

function tagPriority(text: string): Priority | undefined {
  const tag = /\b(P[0-3])\b/.exec(text)?.[1];
  if (tag === "P0") return "must";
  if (tag === "P1") return "should";
  return tag ? "could" : undefined;
}

function modalPriority(text: string): Priority | undefined {
  if (/\b(must|shall|is required to|are required to)\b/i.test(text)) return "must";
  if (/\bshould\b/i.test(text)) return "should";
  if (/\b(could|nice to have)\b/i.test(text)) return "could";
  return undefined;
}

/** Explicit tag beats the section's bucket ("Must have"), which beats the sentence's modal verb. */
function resolvePriority(text: string, hint: Priority | undefined): Priority {
  return tagPriority(text) ?? hint ?? modalPriority(text) ?? "should";
}

function parsePriorityCell(cell: string): Priority | undefined {
  const value = cell.trim().toLowerCase();
  if (/^(p0|must|high|critical)/.test(value)) return "must";
  if (/^(p1|should|medium)/.test(value)) return "should";
  if (/^(p[23]|could|low|nice)/.test(value)) return "could";
  return undefined;
}

function normalizeForId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Content-addressed ID: survives reordering and edits elsewhere in the document. */
export function requirementId(text: string, sourceId?: string): string {
  if (sourceId) return `REQ-${sourceId}`;
  return `REQ-${createHash("sha1").update(normalizeForId(text)).digest("hex").slice(0, 6)}`;
}

function flattenChildren(item: ListItemBlock): string[] {
  return item.children.flatMap((c) => [c.text, ...flattenChildren(c)]);
}

function splitExplicitId(text: string): { sourceId?: string; text: string } {
  const m = EXPLICIT_ID.exec(text);
  return m?.[1] ? { sourceId: m[1], text: text.slice(m[0].length) } : { text };
}

function firstParagraph(section: Section): string {
  const p = section.blocks.find((b) => b.kind === "paragraph" && !b.quote);
  return p && "text" in p ? p.text : "";
}

function itemTexts(section: Section): NoteItem[] {
  const source = (b: { line: number; endLine: number }): SourceRef => ({
    line: b.line,
    endLine: b.endLine,
    section: section.path,
  });
  return section.blocks.flatMap((b: Block): NoteItem[] => {
    if (b.kind === "listItem") return [{ text: b.text, source: source(b) }];
    if (b.kind === "paragraph" && !b.quote) return [{ text: b.text, source: source(b) }];
    return [];
  });
}

function parsePersona(text: string): Persona {
  const m = /^(.{2,40}?)\s*(?::|\s[-\u2013\u2014]\s)\s*(.+)$/.exec(text);
  return m?.[1] && m[2]
    ? { name: m[1].trim(), description: m[2].trim() }
    : { name: text, description: "" };
}

interface Draft {
  sourceId?: string;
  text: string;
  details: string[];
  kind: Requirement["kind"];
  priority: Priority;
  source: SourceRef;
}

function tableRequirements(
  table: TableBlock,
  section: Section,
  kind: Requirement["kind"],
  hint: Priority | undefined,
): Draft[] {
  const col = (pattern: RegExp): number => table.header.findIndex((h) => pattern.test(h));
  const textCol = col(/requirement|description|story|feature|capabilit/i);
  if (textCol < 0) return [];
  const idCol = col(/^(id|#|ref|key)$/i);
  const priorityCol = col(/priority|moscow|^pri/i);
  return table.rows
    .filter((row) => (row.cells[textCol] ?? "").length > 0)
    .map((row) => {
      const text = row.cells[textCol] ?? "";
      const sourceId = idCol >= 0 ? row.cells[idCol] : undefined;
      const priority =
        (priorityCol >= 0 ? parsePriorityCell(row.cells[priorityCol] ?? "") : undefined) ??
        resolvePriority(text, hint);
      return {
        ...(sourceId ? { sourceId } : {}),
        text,
        details: [],
        kind,
        priority,
        source: { line: row.line, endLine: row.line, section: section.path },
      };
    });
}

function blockRequirements(
  section: Section,
  kind: Requirement["kind"],
  hint: Priority | undefined,
): Draft[] {
  const drafts: Draft[] = [];
  for (const block of section.blocks) {
    if (block.kind === "table") {
      drafts.push(...tableRequirements(block, section, kind, hint));
    } else if (block.kind === "listItem") {
      const { sourceId, text } = splitExplicitId(block.text);
      drafts.push({
        ...(sourceId ? { sourceId } : {}),
        text,
        details: flattenChildren(block),
        kind,
        priority: resolvePriority(text, hint),
        source: { line: block.line, endLine: block.endLine, section: section.path },
      });
    } else if (!block.quote) {
      // Prose: each modal sentence opens a requirement; the plain sentences that follow it
      // elaborate on it. Plain sentences before the first modal one are framing text.
      let open: Draft | undefined;
      for (const sentence of block.text.split(SENTENCE)) {
        if (MODAL.test(sentence)) {
          const { sourceId, text } = splitExplicitId(sentence);
          open = {
            ...(sourceId ? { sourceId } : {}),
            text,
            details: [],
            kind,
            priority: resolvePriority(sentence, hint),
            source: { line: block.line, endLine: block.endLine, section: section.path },
          };
          drafts.push(open);
        } else if (open) {
          open.details.push(sentence);
        }
      }
    }
  }
  return drafts;
}

function withRoles(root: Section): { section: Section; role: SectionRole; hint?: Priority }[] {
  const out: { section: Section; role: SectionRole; hint?: Priority }[] = [];
  const visit = (section: Section, inherited: SectionRole, inheritedHint?: Priority): void => {
    const own = classifySection(section.title);
    const hint = sectionPriority(section.title) ?? inheritedHint;
    // A heading that only names a priority bucket ("Must have") stays inside its parent's role.
    const role =
      own === "other" || (own === "requirements" && inherited === "nonFunctional")
        ? inherited
        : own;
    out.push({ section, role, ...(hint ? { hint } : {}) });
    for (const child of section.children) visit(child, role, hint);
  };
  for (const child of root.children) visit(child, "other");
  return out;
}

export function extractPrd(markdown: string): ExtractedPrd {
  const doc = parseMarkdown(markdown);
  const sha256 = createHash("sha256").update(markdown).digest("hex");
  const warnings: string[] = [];
  const drafts: Draft[] = [];
  const personas: Persona[] = [];
  const goals: string[] = [];
  const outOfScope: ScopeItem[] = [];
  const risks: NoteItem[] = [];
  const openQuestions: NoteItem[] = [];
  const externalDependencies: NoteItem[] = [];
  const acceptanceNotes: NoteItem[] = [];
  const sections: SectionInfo[] = [];
  let problem = "";

  for (const { section, role, hint } of withRoles(doc.root)) {
    sections.push({
      path: section.path,
      role,
      summary: firstParagraph(section),
      line: section.line,
      endLine: section.endLine,
    });
    switch (role) {
      case "requirements":
        drafts.push(...blockRequirements(section, "functional", hint));
        break;
      case "nonFunctional":
        drafts.push(...blockRequirements(section, "non-functional", hint));
        break;
      case "acceptance":
        acceptanceNotes.push(...itemTexts(section));
        break;
      case "outOfScope":
        outOfScope.push(...itemTexts(section));
        break;
      case "goals":
        goals.push(...itemTexts(section).map((n) => n.text));
        break;
      case "personas":
        personas.push(
          ...section.blocks
            .filter((b): b is ListItemBlock => b.kind === "listItem")
            .map((b) => parsePersona(b.text)),
        );
        break;
      case "risks":
        risks.push(...itemTexts(section));
        break;
      case "openQuestions":
        openQuestions.push(...itemTexts(section));
        break;
      case "dependencies":
        externalDependencies.push(...itemTexts(section));
        break;
      case "context":
        problem ||= firstParagraph(section);
        break;
      case "other":
        break;
    }
  }

  attachAcceptanceNotes(drafts, acceptanceNotes, warnings);

  const used = new Map<string, number>();
  const requirements: Requirement[] = drafts.map((d) => {
    const text = stripInlineMarkdown(d.text);
    let reqId = requirementId(text, d.sourceId);
    const seen = used.get(reqId) ?? 0;
    used.set(reqId, seen + 1);
    if (seen > 0) {
      warnings.push(`Duplicate requirement text at line ${d.source.line}; suffixed its ID.`);
      reqId = `${reqId}-${seen + 1}`;
    }
    return {
      id: reqId,
      ...(d.sourceId ? { sourceId: d.sourceId } : {}),
      text,
      kind: d.kind,
      priority: d.priority,
      details: d.details,
      source: d.source,
    };
  });

  if (requirements.length === 0) {
    warnings.push(
      "No requirements found. Put them as bullets, a table, or modal sentences ('must', " +
        "'should', 'can') under a heading such as 'Requirements' or 'Scope'.",
    );
  }

  return {
    title: doc.title,
    sha256,
    problem,
    requirements,
    personas,
    goals,
    outOfScope,
    risks,
    openQuestions,
    externalDependencies,
    sections,
    warnings,
  };
}

/** Acceptance notes name their requirement ("FR-2: ...") or are matched by wording. */
function attachAcceptanceNotes(drafts: Draft[], notes: NoteItem[], warnings: string[]): void {
  for (const note of notes) {
    const { sourceId, text } = splitExplicitId(note.text);
    let target = sourceId ? drafts.find((d) => d.sourceId === sourceId) : undefined;
    if (!target) {
      const tokens = contentTokens(text);
      let best = 0;
      for (const d of drafts) {
        const score = jaccard(tokens, contentTokens(d.text));
        if (score > best) {
          best = score;
          target = d;
        }
      }
      if (best < 0.15) target = undefined;
    }
    if (target) target.details.push(text);
    else warnings.push(`Acceptance note at line ${note.source.line} matches no requirement.`);
  }
}
