import type { Answer, EvidenceDb, StressType } from "./schema";
import type { Verdict } from "./logic";

/**
 * Type of stress: which kind of stress on a nerve (pressure, stretch, reduced blood supply...)
 * the patient's description fits, and which stresses each condition usually involves. A display
 * view like the logical fit: it produces counts, never a probability, and nothing here feeds
 * bayes.ts. Pain descriptions overlap and most problems involve several stresses at once, so a
 * clue that fits one type can fit another too.
 */

export interface ClueCheck {
  clue: StressType["clues"][number];
  verdict: Verdict;
}

export interface StressPattern {
  type: StressType;
  checks: ClueCheck[];
  fit: number;
  against: number;
  unknown: number;
  // More clues fit than count against, and a "usual" clue (the stress's defining feature), if it
  // has one, fits: weakness alone shouldn't suggest an immune attack.
  matches: boolean;
}

/** "yes" if any listed finding was answered yes, "no" if none was and one was answered no. */
function combined(anyOf: string[], answers: Record<string, Answer>): "yes" | "no" | undefined {
  if (anyOf.some((id) => answers[id] === "yes")) return "yes";
  if (anyOf.some((id) => answers[id] === "no")) return "no";
  return undefined;
}

function check(clue: ClueCheck["clue"], answers: Record<string, Answer>): Verdict {
  const a = combined(clue.anyOf, answers);
  if (a === undefined) return "unknown";
  if (a === clue.answer) return "fit";
  // Only a feature the stress usually produces counts against it when absent.
  return clue.type === "usual" ? "against" : "unknown";
}

export function stressPatterns(db: EvidenceDb, answers: Record<string, Answer>): StressPattern[] {
  return db.stress
    .map((type) => {
      const checks = type.clues.map((clue) => ({ clue, verdict: check(clue, answers) }));
      const n = (v: Verdict) => checks.filter((c) => c.verdict === v).length;
      const fit = n("fit");
      const against = n("against");
      const usual = checks.filter((c) => c.clue.type === "usual");
      const defining = usual.length === 0 || usual.some((c) => c.verdict === "fit");
      return { type, checks, fit, against, unknown: n("unknown"), matches: defining && fit > 0 && fit > against };
    })
    .sort((a, b) => b.fit - b.against - (a.fit - a.against) || a.against - b.against || b.fit - a.fit);
}

/** The stresses a condition usually involves, in the order of the stress list. */
export function stressesFor(db: EvidenceDb, hypId: string) {
  return db.stress.flatMap((type) => {
    const condition = type.conditions.find((c) => c.hypothesis === hypId);
    return condition ? [{ type, condition }] : [];
  });
}
