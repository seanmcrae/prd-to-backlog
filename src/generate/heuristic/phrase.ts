/**
 * Rewrites one requirement sentence as a user story. Pattern-based on purpose: the result is
 * predictable, and anything it cannot phrase well is left visible for the linter to flag.
 */
import type { Persona } from "../../prd/extract.js";
import { capitalize, contentTokens, lowerFirst, singularize, truncateWords } from "../../text.js";

export type SubjectKind = "persona" | "system" | "object" | "none";

export interface StoryPhrase {
  asA: string;
  iWant: string;
  title: string;
  /** Benefit stated in the requirement itself ("... so that X"), if any. */
  benefit?: string;
  /** Leading condition ("When connectivity returns, ...") without its keyword. */
  condition?: string;
  subjectKind: SubjectKind;
  /** Grammatical subject when it is neither a persona nor the system ("Invite links"). */
  subject?: string;
  /** Verb phrase after the modal, e.g. "revoke a pending invite". */
  action: string;
  /** The requirement as an outcome statement, without its leading condition. */
  outcome: string;
}

const SYSTEM_SUBJECT =
  /^(the |our )?(system|app|application|platform|product|service|api|backend|server|tool)$/i;
const MODAL_SPLIT =
  /^(.+?)\s+(must be able to|should be able to|will be able to|are able to|is able to|need to|needs to|can|could|may|must|shall|should|will)\s+(.+)$/i;
const ENABLE = /^(?:let|allow|enable|lets|allows|enables)\s+(.+?)\s+(?:to\s+)?(\w.+)$/i;

export function cleanRequirementText(text: string): string {
  return text
    .replace(/\s*\(?\bdepends on [A-Z]{1,6}-\d+(?:\s*(?:,|and)\s*[A-Z]{1,6}-\d+)*\)?\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:]+$/, "");
}

function normalizePersona(name: string): string {
  return singularize(
    name
      .toLowerCase()
      .replace(/^(the|all|any|a|an)\s+/, "")
      .trim(),
  );
}

/** Match a grammatical subject ("Inspectors", "Workspace admins") to a declared persona. */
export function matchPersona(subject: string, personas: Persona[]): string | undefined {
  const s = normalizePersona(subject);
  for (const p of personas) {
    const name = normalizePersona(p.name);
    if (s === name) return name;
  }
  for (const p of personas) {
    const name = normalizePersona(p.name);
    const head = name.split(" ").at(-1) ?? name;
    if (s === head || s.endsWith(` ${head}`)) return name;
  }
  return undefined;
}

/** First persona whose head noun appears anywhere in the text. */
export function mentionedPersona(text: string, personas: Persona[]): string | undefined {
  const tokens = new Set(contentTokens(text));
  for (const p of personas) {
    const name = normalizePersona(p.name);
    const head = contentTokens(name).at(-1);
    if (head && tokens.has(head)) return name;
  }
  return undefined;
}

export function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

/** Third-person singular of the first verb in a phrase: "resend a link" -> "resends a link". */
export function conjugate(phrase: string): string {
  const [verb = "", ...rest] = phrase.split(" ");
  let inflected: string;
  if (verb === "be") inflected = "is";
  else if (verb === "have") inflected = "has";
  else if (/(s|sh|ch|x|z|o)$/.test(verb)) inflected = `${verb}es`;
  else if (/[^aeiou]y$/.test(verb)) inflected = `${verb.slice(0, -1)}ies`;
  else inflected = `${verb}s`;
  return [inflected, ...rest].join(" ");
}

export function phraseRequirement(
  text: string,
  personas: Persona[],
  defaultPersona: string,
): StoryPhrase {
  let main = cleanRequirementText(text);
  let benefit: string | undefined;
  let condition: string | undefined;

  const cond = /^(when|if|once|after|before|while|whenever)\s+([^,]+),\s*(.+)$/i.exec(main);
  if (cond?.[2] && cond[3]) {
    condition = cond[2].trim();
    main = cond[3];
  }
  const so = /^(.*?),?\s+(?:so that|in order to|so)\s+(\w.+)$/i.exec(main);
  if (so?.[1] && so[2] && so[1].split(" ").length >= 3) {
    main = so[1];
    benefit = so[2];
  }
  const extras = {
    outcome: lowerFirst(cond?.[3] ?? cleanRequirementText(text)),
    ...(benefit ? { benefit } : {}),
    ...(condition ? { condition } : {}),
  };
  const fallback = mentionedPersona(main, personas) ?? defaultPersona;

  const asStory = /^as an? (.+?),\s*i (?:want|need|can|would like)(?: to)?\s+(.+)$/i.exec(main);
  if (asStory?.[1] && asStory[2]) {
    const action = asStory[2];
    return {
      asA: asStory[1].toLowerCase(),
      iWant: `to ${action}`,
      title: titleFrom(action),
      subjectKind: "persona",
      action,
      ...extras,
    };
  }

  const modal = MODAL_SPLIT.exec(main);
  if (modal?.[1] && modal[3]) {
    const subject = modal[1].trim();
    let action = modal[3].trim();
    const persona = matchPersona(subject, personas);
    if (persona) {
      return {
        asA: persona,
        iWant: `to ${action}`,
        title: titleFrom(action),
        subjectKind: "persona",
        action,
        ...extras,
      };
    }
    if (SYSTEM_SUBJECT.test(subject)) {
      const enable = ENABLE.exec(action);
      const enabled = enable?.[1] ? matchPersona(enable[1], personas) : undefined;
      if (enable?.[2] && enabled) {
        action = enable[2];
        return {
          asA: enabled,
          iWant: `to ${action}`,
          title: titleFrom(action),
          subjectKind: "persona",
          action,
          ...extras,
        };
      }
      return {
        asA: fallback,
        iWant: `the system to ${action}`,
        title: titleFrom(action),
        subjectKind: "system",
        action,
        ...extras,
      };
    }
    return {
      asA: fallback,
      iWant: `${lowerFirst(subject)} to ${action}`,
      title: titleFrom(main),
      subjectKind: "object",
      subject,
      action,
      ...extras,
    };
  }

  return {
    asA: fallback,
    iWant: lowerFirst(main),
    title: titleFrom(main),
    subjectKind: "none",
    action: lowerFirst(main),
    ...extras,
  };
}

function titleFrom(phrase: string): string {
  return truncateWords(capitalize(phrase), 80);
}
