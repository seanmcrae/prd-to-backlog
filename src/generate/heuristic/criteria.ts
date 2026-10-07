import type { AcceptanceCriterion } from "../../model/schema.js";
import { lowerFirst } from "../../text.js";
import { article, conjugate, type StoryPhrase } from "./phrase.js";

const GWT = /^given\s+(.+?),\s*when\s+(.+?),\s*then\s+(.+)$/i;
const CONDITIONAL = /^(?:when|if|once|after|whenever)\s+(.+?),\s*(?:then\s+)?(.+)$/i;

function tidy(text: string): string {
  return lowerFirst(text.trim().replace(/[.;]+$/, ""));
}

/** The "when" step implied by the story itself, used when a detail has no condition. */
function defaultWhen(phrase: StoryPhrase): string {
  if (phrase.condition) return tidy(phrase.condition);
  switch (phrase.subjectKind) {
    case "persona":
      return `the ${phrase.asA} ${conjugate(phrase.action)}`;
    case "system":
      return `the system ${conjugate(phrase.action)}`;
    case "object":
    case "none":
      return "the behaviour is exercised";
  }
}

function defaultGiven(phrase: StoryPhrase): string {
  return `${article(phrase.asA)} ${phrase.asA}`;
}

/**
 * Builds Given/When/Then criteria from the requirement's detail lines. Details already in
 * GWT or "When X, then Y" form are mapped directly; plain statements become the "then" of the
 * story's main action. With no details, one criterion restating the requirement is inferred.
 */
export function buildCriteria(
  storyKey: string,
  details: string[],
  phrase: StoryPhrase,
): AcceptanceCriterion[] {
  const given = defaultGiven(phrase);
  const criteria = details.map((detail, i): AcceptanceCriterion => {
    const id = `AC-${storyKey}-${i + 1}`;
    const gwt = GWT.exec(detail.trim());
    if (gwt?.[1] && gwt[2] && gwt[3]) {
      return { id, given: tidy(gwt[1]), when: tidy(gwt[2]), then: tidy(gwt[3]), origin: "prd" };
    }
    const conditional = CONDITIONAL.exec(detail.trim());
    if (conditional?.[1] && conditional[2]) {
      return {
        id,
        given,
        when: tidy(conditional[1]),
        then: tidy(conditional[2]),
        origin: "prd",
      };
    }
    return { id, given, when: defaultWhen(phrase), then: tidy(detail), origin: "prd" };
  });
  if (criteria.length > 0) return criteria;
  return [
    {
      id: `AC-${storyKey}-1`,
      given,
      when: defaultWhen(phrase),
      then: tidy(phrase.outcome),
      origin: "inferred",
    },
  ];
}
