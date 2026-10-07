import { checkReferences, type Backlog, type Story } from "../model/schema.js";
import { contentTokens, jaccard } from "../text.js";
import { findCycles } from "./graph.js";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  severity: Severity;
  /** Story, requirement or criterion ID; "backlog" for whole-backlog findings. */
  target: string;
  message: string;
}

export interface Rule {
  id: string;
  description: string;
  check(backlog: Backlog): Finding[];
}

const VAGUE_TERMS = [
  "fast",
  "faster",
  "quick",
  "quickly",
  "easy",
  "easily",
  "simple",
  "simply",
  "user-friendly",
  "user friendly",
  "intuitive",
  "seamless",
  "seamlessly",
  "robust",
  "scalable",
  "efficient",
  "efficiently",
  "flexible",
  "modern",
  "etc",
  "and so on",
  "as needed",
  "as appropriate",
  "appropriate",
  "reasonable",
  "several",
  "various",
  "optimal",
  "improved",
  "enhanced",
  "better",
  "tbd",
  "and/or",
  "clear",
];
const VAGUE = new RegExp(
  `(?<![\\w-])(${VAGUE_TERMS.map((t) => t.replace(/[/-]/g, "\\$&")).join("|")})(?![\\w-])`,
  "gi",
);
// Outcomes that cannot be checked by an observer or a test.
const UNVERIFIABLE =
  /\b(works? (?:well|fine)|properly|correctly|as expected|appropriately|gracefully|handled|is supported|good|nice|smooth(ly)?)\b/i;
const IMPLEMENTATION =
  /\b(database|db table|sql|column|react|redux|kafka|redis|lambda|microservices?|cron|css|dropdown|stored procedure|orm)\b/i;

const MAX_POINTS_WARNING = 8;
const MAX_POINTS_ERROR = 13;
const MAX_CRITERIA = 7;
const MAX_BLOCKERS = 3;

export function vagueTerms(text: string): string[] {
  return [...new Set((text.match(VAGUE) ?? []).map((t) => t.toLowerCase()))];
}

function storyText(story: Story): string {
  return [
    story.title,
    story.iWant,
    story.soThat,
    ...story.acceptanceCriteria.flatMap((c) => [c.given, c.when, c.then]),
  ].join(" \n ");
}

function perStory(
  id: string,
  description: string,
  fn: (story: Story, backlog: Backlog) => Omit<Finding, "rule" | "target">[],
): Rule {
  return {
    id,
    description,
    check: (backlog) =>
      backlog.stories.flatMap((story) =>
        fn(story, backlog).map((f) => ({ ...f, rule: id, target: story.id })),
      ),
  };
}

export const RULES: Rule[] = [
  perStory("story-format", "Story has a persona and a want clause", (story) => {
    const out: Omit<Finding, "rule" | "target">[] = [];
    if (!story.asA.trim() || !story.iWant.trim()) {
      out.push({ severity: "error", message: "Story is missing its 'As a' or 'I want' clause." });
    } else if (/^(user|users|customer)$/i.test(story.asA.trim())) {
      out.push({
        severity: "info",
        message: `Generic persona "${story.asA}"; name the actual role if the PRD has one.`,
      });
    }
    return out;
  }),

  perStory("missing-acceptance-criteria", "Every story has acceptance criteria", (story) =>
    story.acceptanceCriteria.length === 0
      ? [{ severity: "error", message: "Story has no acceptance criteria (INVEST: Testable)." }]
      : [],
  ),

  {
    id: "untestable-criterion",
    description: "Criteria describe an observable, checkable outcome",
    check: (backlog) =>
      backlog.stories.flatMap((story) =>
        story.acceptanceCriteria.flatMap((c): Finding[] => {
          const vague = vagueTerms(c.then);
          const unverifiable = UNVERIFIABLE.exec(c.then)?.[0];
          const tooShort = c.then.trim().split(/\s+/).length < 3;
          if (vague.length === 0 && !unverifiable && !tooShort) return [];
          const why = vague.length
            ? `uses subjective terms (${vague.join(", ")})`
            : unverifiable
              ? `"${unverifiable}" is not observable`
              : "is too short to verify";
          return [
            {
              rule: "untestable-criterion",
              severity: "warning",
              target: c.id,
              message: `Then-clause ${why}: "${c.then}". State a measurable or visible result.`,
            },
          ];
        }),
      ),
  },

  perStory("inferred-criterion", "Criteria come from the PRD, not the generator", (story) => {
    const inferred = story.acceptanceCriteria.filter((c) => c.origin === "inferred").length;
    if (inferred === 0) return [];
    // With no PRD-backed criterion the story has no agreed definition of done yet.
    const onlyInferred = inferred === story.acceptanceCriteria.length;
    return [
      {
        severity: onlyInferred ? "warning" : "info",
        message: onlyInferred
          ? "All criteria were inferred; the PRD gives no testable detail for this story."
          : `${inferred} criteria were inferred; confirm or replace them.`,
      },
    ];
  }),

  perStory("vague-language", "Story avoids vague, unmeasurable wording", (story) => {
    const terms = vagueTerms(storyText(story));
    return terms.length
      ? [
          {
            severity: "warning",
            message: `Vague wording: ${terms.map((t) => `"${t}"`).join(", ")}. Replace with a measurable target.`,
          },
        ]
      : [];
  }),

  perStory("invest-independent", "Story is not blocked by many others", (story, backlog) => {
    const blockers = backlog.dependencies.filter((d) => d.to === story.id).length;
    return blockers >= MAX_BLOCKERS
      ? [
          {
            severity: "warning",
            message: `Blocked by ${blockers} stories; consider re-slicing to reduce coupling.`,
          },
        ]
      : [];
  }),

  perStory("invest-negotiable", "Story states intent, not implementation", (story) => {
    const term = IMPLEMENTATION.exec(`${story.title} ${story.iWant}`)?.[0];
    return term
      ? [
          {
            severity: "info",
            message: `Mentions implementation detail "${term}"; keep the how negotiable.`,
          },
        ]
      : [];
  }),

  perStory("invest-valuable", "Story states the value it delivers", (story) => {
    if (!story.soThat.trim()) {
      return [{ severity: "warning", message: "Missing 'so that' benefit (INVEST: Valuable)." }];
    }
    if (jaccard(contentTokens(story.soThat), contentTokens(story.iWant)) > 0.7) {
      return [{ severity: "warning", message: "'So that' restates the 'I want' clause." }];
    }
    if (story.labels.includes("benefit-inferred")) {
      return [
        {
          severity: "info",
          message: "Benefit was linked to a PRD goal by the generator; confirm it.",
        },
      ];
    }
    return [];
  }),

  perStory("invest-estimable", "Story carries an estimate with rationale", (story) =>
    story.estimate ? [] : [{ severity: "warning", message: "Story has no estimate." }],
  ),

  perStory("invest-small", "Story fits comfortably in a sprint", (story) => {
    const out: Omit<Finding, "rule" | "target">[] = [];
    const points = story.estimate?.points ?? 0;
    if (points >= MAX_POINTS_ERROR) {
      out.push({ severity: "error", message: `Estimated at ${points} points; split it.` });
    } else if (points >= MAX_POINTS_WARNING) {
      out.push({
        severity: "warning",
        message: `Estimated at ${points} points; consider splitting.`,
      });
    }
    if (story.acceptanceCriteria.length > MAX_CRITERIA) {
      out.push({
        severity: "warning",
        message: `${story.acceptanceCriteria.length} acceptance criteria suggests more than one story.`,
      });
    }
    return out;
  }),

  {
    id: "orphan-requirement",
    description: "Every requirement is covered by at least one story",
    check: (backlog) => {
      const covered = new Set(backlog.stories.flatMap((s) => s.requirementIds));
      return backlog.requirements
        .filter((r) => !covered.has(r.id))
        .map((r): Finding => ({
          rule: "orphan-requirement",
          severity: r.priority === "must" ? "error" : "warning",
          target: r.id,
          message: `No story covers ${r.sourceId ?? r.id} (line ${r.source.line}): "${r.text}"`,
        }));
    },
  },

  perStory("untraced-story", "Every story traces to a PRD requirement", (story) =>
    story.requirementIds.length === 0
      ? [
          {
            severity: "error",
            message: "Story traces to no requirement; it may be scope the PRD never asked for.",
          },
        ]
      : [],
  ),

  perStory("out-of-scope-overlap", "Stories do not reintroduce scope the PRD cut", (story, b) => {
    const tokens = new Set(contentTokens(storyText(story)));
    return b.outOfScope.flatMap((item) => {
      const cut = [...new Set(contentTokens(item.text))];
      const hits = cut.filter((t) => tokens.has(t)).length;
      return cut.length >= 2 && hits / cut.length >= 0.75
        ? [
            {
              severity: "warning" as const,
              message: `Resembles out-of-scope item (line ${item.source.line}): "${item.text}"`,
            },
          ]
        : [];
    });
  }),

  {
    id: "duplicate-story",
    description: "No two stories say the same thing",
    check: (backlog) => {
      const out: Finding[] = [];
      const tokens = backlog.stories.map((s) => contentTokens(`${s.title} ${s.iWant}`));
      backlog.stories.forEach((a, i) => {
        for (let j = i + 1; j < backlog.stories.length; j++) {
          const b = backlog.stories[j];
          if (b && jaccard(tokens[i] ?? [], tokens[j] ?? []) >= 0.8) {
            out.push({
              rule: "duplicate-story",
              severity: "warning",
              target: b.id,
              message: `Near-duplicate of ${a.id} ("${a.title}").`,
            });
          }
        }
      });
      return out;
    },
  },

  {
    id: "dependency-cycle",
    description: "Story dependencies form no cycles",
    check: (backlog) =>
      findCycles(
        backlog.stories.map((s) => s.id),
        backlog.dependencies,
      ).map((cycle): Finding => ({
        rule: "dependency-cycle",
        severity: "error",
        target: cycle[0] ?? "backlog",
        message: `Dependency cycle among ${cycle.join(", ")}; no valid build order exists.`,
      })),
  },

  {
    id: "invalid-reference",
    description: "IDs are unique and references resolve",
    check: (backlog) =>
      checkReferences(backlog).map((issue): Finding => ({
        rule: "invalid-reference",
        severity: "error",
        target: "backlog",
        message: `${issue.path}: ${issue.message}`,
      })),
  },
];
