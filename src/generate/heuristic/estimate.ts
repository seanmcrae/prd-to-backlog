import type { Estimate } from "../../model/schema.js";

interface Signal {
  label: string;
  pattern: RegExp;
  weight: number;
}

const SIGNALS: Signal[] = [
  {
    label: "external integration",
    pattern:
      /\b(integrat\w*|third[- ]party|webhooks?|payments? provider|email provider|sso|oauth|api endpoint|import|pdf|csv)\b/i,
    weight: 2,
  },
  {
    label: "distributed-state complexity",
    pattern:
      /\b(sync\w*|offline|conflict\w*|real[- ]time|concurren\w*|idempoten\w*|aggregat\w*|background|queue\w*|resume|rate[- ]limit\w*)\b/i,
    weight: 2,
  },
  {
    label: "security or compliance",
    pattern: /\b(encrypt\w*|audit\w*|token\w*|entropy|keystore|permission\w*|reconcil\w*)\b/i,
    weight: 1,
  },
  {
    label: "measurable performance target",
    pattern:
      /\b(p9\d|latency|per second|within \d+\s*(ms|seconds?|minutes?)|\d[\d,]*\s*(events|requests))\b/i,
    weight: 1,
  },
  {
    label: "open uncertainty",
    pattern: /\b(tbd|unclear|investigate|spike|to be decided)\b|\?/i,
    weight: 1,
  },
];

const SCALE: [number, Estimate["points"]][] = [
  [1, 1],
  [2, 2],
  [3, 3],
  [5, 5],
  [7, 8],
  [9, 13],
];

/**
 * Relative sizing from observable signals in the requirement. The rationale lists every signal
 * so a team can disagree with a specific input rather than with an opaque number.
 */
export function estimateStory(text: string, criteriaCount: number): Estimate {
  let score = 1;
  const reasons = ["base 1"];
  const extraCriteria = Math.min(Math.max(criteriaCount - 1, 0), 3);
  if (extraCriteria > 0) {
    score += extraCriteria;
    reasons.push(`+${extraCriteria} for ${criteriaCount} acceptance criteria`);
  }
  for (const signal of SIGNALS) {
    const hits = [
      ...new Set((text.match(new RegExp(signal.pattern, "gi")) ?? []).map((m) => m.toLowerCase())),
    ];
    if (hits.length > 0) {
      score += signal.weight;
      reasons.push(`+${signal.weight} ${signal.label} (${hits.slice(0, 3).join(", ")})`);
    }
  }
  const points = SCALE.find(([max]) => score <= max)?.[1] ?? 13;
  return {
    points,
    rationale: `${reasons.join("; ")} = score ${score} -> ${points} ${points === 1 ? "pt" : "pts"}`,
  };
}
