/**
 * Backlog domain model. Every generator, the linter and the exporters speak these types, and
 * any backlog read from disk or produced by an LLM is validated against them.
 */
import { z } from "zod";

export const SCHEMA_VERSION = "1";

export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13, 21] as const;

const id = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}-[A-Za-z0-9._-]+$`), `must look like ${prefix}-<id>`)
    .describe(`Identifier with the ${prefix}- prefix`);

export const PrioritySchema = z.enum(["must", "should", "could"]);

export const SourceRefSchema = z.object({
  line: z.number().int().positive(),
  endLine: z.number().int().positive(),
  section: z.array(z.string()).describe("Heading path the text was found under"),
});

export const RequirementSchema = z.object({
  id: id("REQ"),
  /** ID written in the PRD itself (e.g. "FR-3"), when there was one. */
  sourceId: z.string().optional(),
  text: z.string().min(1),
  kind: z.enum(["functional", "non-functional"]),
  priority: PrioritySchema,
  details: z.array(z.string()).default([]),
  source: SourceRefSchema,
});

export const ScopeItemSchema = z.object({
  text: z.string().min(1),
  source: SourceRefSchema,
});

export const AcceptanceCriterionSchema = z.object({
  id: id("AC"),
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
  /** "prd" when derived from PRD text; "inferred" when the generator had to fill a gap. */
  origin: z.enum(["prd", "inferred"]),
});

export const EstimateSchema = z.object({
  points: z
    .number()
    .int()
    .refine((p) => (FIBONACCI_POINTS as readonly number[]).includes(p), {
      message: `points must be one of ${FIBONACCI_POINTS.join(", ")}`,
    }),
  rationale: z.string().min(1),
});

export const StorySchema = z.object({
  id: id("ST"),
  epicId: id("EP"),
  title: z.string().min(1).max(120),
  asA: z.string().min(1),
  iWant: z.string().min(1),
  soThat: z.string(),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  requirementIds: z.array(id("REQ")),
  estimate: EstimateSchema.optional(),
  priority: PrioritySchema,
  labels: z.array(z.string()).default([]),
});

export const EpicSchema = z.object({
  id: id("EP"),
  title: z.string().min(1),
  description: z.string(),
  requirementIds: z.array(id("REQ")),
});

export const DependencySchema = z.object({
  from: id("ST").describe("Story that must be done first"),
  to: id("ST").describe("Story that is blocked"),
  kind: z.enum(["explicit", "inferred"]),
  reason: z.string().min(1),
});

export const LevelSchema = z.enum(["low", "medium", "high"]);

export const RiskSchema = z.object({
  id: id("RISK"),
  description: z.string().min(1),
  likelihood: LevelSchema,
  impact: LevelSchema,
  mitigation: z.string(),
  relatedIds: z.array(z.string()).default([]),
  origin: z.enum(["prd", "derived"]),
});

export const BacklogSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  source: z.object({
    title: z.string(),
    path: z.string().optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  generator: z.object({ name: z.string(), model: z.string().optional() }),
  requirements: z.array(RequirementSchema),
  outOfScope: z.array(ScopeItemSchema).default([]),
  epics: z.array(EpicSchema),
  stories: z.array(StorySchema),
  dependencies: z.array(DependencySchema),
  risks: z.array(RiskSchema),
});

export type Priority = z.infer<typeof PrioritySchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type ScopeItem = z.infer<typeof ScopeItemSchema>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export type Estimate = z.infer<typeof EstimateSchema>;
export type Story = z.infer<typeof StorySchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Backlog = z.infer<typeof BacklogSchema>;

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Referential checks zod cannot express: unique IDs and references that resolve. Returned as
 * issues rather than thrown so LLM repair loops can feed them back verbatim.
 */
export function checkReferences(backlog: Backlog): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dupes = (kind: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const value of ids) {
      if (seen.has(value)) issues.push({ path: kind, message: `duplicate id ${value}` });
      seen.add(value);
    }
  };
  dupes(
    "requirements",
    backlog.requirements.map((r) => r.id),
  );
  dupes(
    "epics",
    backlog.epics.map((e) => e.id),
  );
  dupes(
    "stories",
    backlog.stories.map((s) => s.id),
  );
  dupes(
    "risks",
    backlog.risks.map((r) => r.id),
  );

  const reqIds = new Set(backlog.requirements.map((r) => r.id));
  const epicIds = new Set(backlog.epics.map((e) => e.id));
  const storyIds = new Set(backlog.stories.map((s) => s.id));

  backlog.epics.forEach((epic, i) => {
    for (const r of epic.requirementIds) {
      if (!reqIds.has(r))
        issues.push({ path: `epics[${i}].requirementIds`, message: `unknown requirement ${r}` });
    }
  });
  backlog.stories.forEach((story, i) => {
    if (!epicIds.has(story.epicId))
      issues.push({ path: `stories[${i}].epicId`, message: `unknown epic ${story.epicId}` });
    for (const r of story.requirementIds) {
      if (!reqIds.has(r))
        issues.push({ path: `stories[${i}].requirementIds`, message: `unknown requirement ${r}` });
    }
  });
  backlog.dependencies.forEach((dep, i) => {
    for (const end of [dep.from, dep.to]) {
      if (!storyIds.has(end))
        issues.push({ path: `dependencies[${i}]`, message: `unknown story ${end}` });
    }
    if (dep.from === dep.to)
      issues.push({ path: `dependencies[${i}]`, message: `story ${dep.from} depends on itself` });
  });
  return issues;
}

export type ParseResult = { ok: true; backlog: Backlog } | { ok: false; issues: ValidationIssue[] };

/** Schema validation followed by referential checks. */
export function validateBacklog(input: unknown): ParseResult {
  const parsed = BacklogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    };
  }
  const issues = checkReferences(parsed.data);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, backlog: parsed.data };
}
