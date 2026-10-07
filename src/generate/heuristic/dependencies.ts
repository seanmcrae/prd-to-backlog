import type { Dependency, Requirement } from "../../model/schema.js";
import { contentTokens, stem } from "../../text.js";
import type { StoryPhrase } from "./phrase.js";

export interface DependencyCandidate {
  storyId: string;
  requirement: Requirement;
  phrase: StoryPhrase;
}

// Verbs that bring a thing into existence vs verbs that act on an existing one. A verb can be
// both: "aggregate" consumes raw events and produces totals.
const CREATES = new Set(
  (
    "create add invite send define configure record capture upload enable connect register " +
    "generate issue meter aggregate fill write set import"
  ).split(" "),
);
const CONSUMES = new Set(
  (
    "accept view edit update delete remove revoke resend cancel list export approve reject " +
    "sync download see pay retry track query aggregate review search filter share print"
  ).split(" "),
);
const NOISE = new Set(
  (
    "system app data new one more each every user all any current past pending monthly weekly " +
    "daily hourly assign"
  ).split(" "),
);
// Words that end the object noun phrase: "invoice [that itemises ...]", "usage [into ...]".
const PHRASE_BREAK =
  /\s(?:for|with|by|into|per|to|on|in|from|through|as|while|before|after|and|or|that|which|when|if|so)\s|[,(]/i;

const EXPLICIT = /depends on ((?:[A-Z]{1,6}-\d+)(?:\s*(?:,|and)\s*[A-Z]{1,6}-\d+)*)/gi;
const MAX_INFERRED_PER_STORY = 2;

function verbOf(phrase: StoryPhrase): string {
  return (phrase.action.split(" ")[0] ?? "").toLowerCase();
}

/** Content words of the verb's direct object: "revoke [a pending invite]". */
function objectTokens(phrase: StoryPhrase, personaTokens: Set<string>): Set<string> {
  const rest = ` ${phrase.action.split(" ").slice(1).join(" ")} `;
  const head = rest.split(PHRASE_BREAK)[0] ?? "";
  return new Set(contentTokens(head).filter((t) => !NOISE.has(t) && !personaTokens.has(t)));
}

/**
 * Explicit dependencies come from "Depends on FR-2" in the PRD. Inferred ones link a story that
 * acts on a thing ("revoke a pending invite") to the earlier story that creates it ("invite
 * teammates"). Only earlier functional stories can be prerequisites, so inference never
 * introduces a cycle on its own.
 */
export function inferDependencies(
  candidates: DependencyCandidate[],
  personaNames: string[],
): Dependency[] {
  const personaTokens = new Set(personaNames.flatMap((p) => contentTokens(p)));
  const bySourceId = new Map(
    candidates.filter((c) => c.requirement.sourceId).map((c) => [c.requirement.sourceId, c]),
  );
  const deps: Dependency[] = [];
  const seen = new Set<string>();
  const add = (dep: Dependency): void => {
    const key = `${dep.from}->${dep.to}`;
    if (dep.from === dep.to || seen.has(key)) return;
    seen.add(key);
    deps.push(dep);
  };

  for (const c of candidates) {
    const text = [c.requirement.text, ...c.requirement.details].join(" ");
    for (const match of text.matchAll(EXPLICIT)) {
      for (const ref of (match[1] ?? "").split(/\s*(?:,|and)\s*/)) {
        const target = bySourceId.get(ref.trim().toUpperCase());
        if (target) {
          add({
            from: target.storyId,
            to: c.storyId,
            kind: "explicit",
            reason: `PRD states ${c.requirement.sourceId ?? c.requirement.id} depends on ${ref.trim()}`,
          });
        }
      }
    }
  }

  const verbStems = candidates.map((c) => stem(verbOf(c.phrase)));
  const provides = candidates.map((c) => {
    const verb = verbOf(c.phrase);
    if (c.requirement.kind !== "functional" || c.phrase.subjectKind === "object") {
      return new Set<string>();
    }
    const tokens = CREATES.has(verb) ? objectTokens(c.phrase, personaTokens) : new Set<string>();
    tokens.add(stem(verb));
    return tokens;
  });

  candidates.forEach((c, index) => {
    const verb = verbOf(c.phrase);
    let needs: Set<string>;
    if (c.phrase.subjectKind === "object" && c.phrase.subject) {
      needs = new Set(
        contentTokens(c.phrase.subject.split(PHRASE_BREAK)[0] ?? "").filter((t) => !NOISE.has(t)),
      );
    } else if (CONSUMES.has(verb)) {
      needs = objectTokens(c.phrase, personaTokens);
    } else {
      return;
    }
    // Prefer the story whose verb names the thing ("invite teammates" for "revoke an invite")
    // over one that merely mentions it in its object; then prefer the nearest earlier story.
    const matches: { j: number; shared: string; strength: number }[] = [];
    for (let j = index - 1; j >= 0; j--) {
      const shared = [...needs].find((t) => provides[j]?.has(t));
      if (!shared) continue;
      matches.push({ j, shared, strength: verbStems[j] === shared ? 2 : 1 });
    }
    const strongest = Math.max(0, ...matches.map((m) => m.strength));
    for (const m of matches
      .filter((x) => x.strength === strongest)
      .slice(0, MAX_INFERRED_PER_STORY)) {
      const provider = candidates[m.j];
      if (!provider) continue;
      add({
        from: provider.storyId,
        to: c.storyId,
        kind: "inferred",
        reason: `acts on "${m.shared}", which ${provider.storyId} introduces`,
      });
    }
  });

  return deps;
}
