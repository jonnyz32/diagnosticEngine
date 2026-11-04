import { appliedFindings, ownEvidence, pooled } from "./bayes";
import type { Answer, EvidenceDb, Finding, Hypothesis, Region } from "./schema";
import { unexplainedWeakness } from "./summary";

/**
 * Logical fit: a second view beside the probability, built from checks that are each
 * consistent, against, or not yet answered. It produces counts, never a probability, and
 * nothing here feeds bayes.ts. It covers hypotheses without accuracy data too. Reasoning
 * only rules out by absence: a feature the condition usually produces, answered "no". A
 * "supports" item (a trigger or relief the mechanism explains) fits on "yes" and is dropped on
 * "no", since other conditions share it.
 * Symptoms an option can't explain (unmarked territory, weakness for a sensory-only nerve,
 * "unexplained" logic items) are notes, not checks: several problems can coexist.
 */

export type Verdict = "fit" | "against" | "unknown";

export interface LogicCheck {
  basis: "evidence" | "criteria" | "reasoning";
  verdict: Verdict;
  finding: Finding;
  expect: "yes" | "no";
  // Criteria item text, or the reasoning behind an authored expectation.
  note?: string;
  // Absent only for uncited reasoning.
  sourceId?: string;
  locator?: string;
}

export interface LogicFit {
  id: string;
  checks: LogicCheck[];
  fit: number;
  against: number;
  unknown: number;
  // Symptoms this option can't explain. Shown as notes, never counted against it: a
  // second problem may explain them.
  uncovered: Region[];
  unexplainedWeakness: Finding[];
  // "Yes" answers this option doesn't explain: `logic` items of type "unexplained", and
  // studied findings whose "yes" is more common in other conditions.
  unexplained: Unexplained[];
}

interface Unexplained {
  finding: Finding;
  reason: string;
  sourceId?: string;
  locator?: string;
}

// "Usually presents with": more than half of the study's patients with the condition had it.
// A display rule for the logical-fit view, not a clinical value.
const USUAL = 0.5;

const verdictOf =(answer: Answer | undefined, expect: "yes" | "no"): Verdict =>
  !answer || answer === "unsure" ? "unknown" : answer === expect ? "fit" : "against";

/**
 * One check per finding, preferring cited directions: accuracy data, then a linked criteria
 * item, then authored reasoning. A studied finding counts only when its "yes" points toward
 * this option (LR+ above 1); one whose "yes" points away gives a note on "yes", nothing else.
 * Its "no" counts against only when the condition usually has the finding (sens > USUAL).
 */
function answerChecks(db: EvidenceDb, h: Hypothesis, answers: Record<string, Answer>): { checks: LogicCheck[]; notes: Unexplained[] } {
  const checks = new Map<string, LogicCheck>();
  const handled = new Set<string>();
  const notes: Unexplained[] = [];
  for (const f of db.findings) {
    const own = ownEvidence(f, h.id);
    if (!own.length) continue;
    const e = own[0]; // cited on the check; the direction uses all pooled studies
    handled.add(f.id);
    const { sens, spec } = pooled(own);
    if (sens < 1 - spec && answers[f.id] === "yes") {
      notes.push({ finding: f, reason: "In the cited study this was more common in other conditions.", sourceId: e.sourceId, locator: e.locator });
    }
    if (sens <= 1 - spec) continue;
    // A "no" rules out only a finding the condition usually has (and never a positive-only one,
    // as in the probability). A rarer finding still fits on "yes".
    const positiveOnly = f.scoreOn === "positive" || own.every((x) => x.scoreOn === "positive");
    if (answers[f.id] === "no" && (positiveOnly || sens <= USUAL)) continue;
    checks.set(f.id, { basis: "evidence", verdict: verdictOf(answers[f.id], "yes"), finding: f, expect: "yes", sourceId: e.sourceId, locator: e.locator });
  }
  for (const item of h.criteria?.items ?? []) {
    const f = item.linkedFinding ? db.findings.find((x) => x.id === item.linkedFinding) : undefined;
    if (!f || handled.has(f.id) || checks.has(f.id)) continue;
    checks.set(f.id, {
      basis: "criteria",
      verdict: verdictOf(answers[f.id], item.matchIf),
      finding: f,
      expect: item.matchIf,
      note: item.prompt,
      sourceId: item.sourceId ?? h.criteria!.sourceId,
      locator: item.locator ?? h.criteria!.locator,
    });
  }
  for (const l of h.logic) {
    const f = db.findings.find((x) => x.id === l.finding);
    if (!f || handled.has(f.id) || checks.has(f.id)) continue;
    if (l.type === "usual" || (l.type === "supports" && answers[f.id] !== "no")) {
      checks.set(f.id, { basis: "reasoning", verdict: verdictOf(answers[f.id], "yes"), finding: f, expect: "yes", note: l.reason, sourceId: l.sourceId, locator: l.locator });
    } else if (l.type === "unexplained" && answers[f.id] === "yes") {
      notes.push({ finding: f, reason: l.reason, sourceId: l.sourceId, locator: l.locator });
    }
  }
  return { checks: [...checks.values()], notes };
}

/**
 * Findings in a dependenceGroup measure the same thing, so each group gives one check:
 * the answered finding the probability uses, else any answered one, else the first.
 */
function collapseGroups(checks: LogicCheck[], applied: Set<string>): LogicCheck[] {
  const byGroup = new Map<string, LogicCheck[]>();
  const out: LogicCheck[] = [];
  for (const c of checks) {
    const g = c.finding.dependenceGroup;
    if (!g) out.push(c);
    else byGroup.set(g, [...(byGroup.get(g) ?? []), c]);
  }
  for (const group of byGroup.values()) {
    const decided = group.filter((c) => c.verdict !== "unknown");
    out.push(decided.find((c) => applied.has(c.finding.id)) ?? decided[0] ?? group[0]);
  }
  return out;
}

export function logicalFit(db: EvidenceDb, regions: Region[], answers: Record<string, Answer>): LogicFit[] {
  const applied = new Set(appliedFindings(db, answers).applied.map((f) => f.id));
  return db.hypotheses
    .map((h) => {
      const { checks: all, notes } = answerChecks(db, h, answers);
      const checks = collapseGroups(all, applied);
      const n = (v: Verdict) => checks.filter((c) => c.verdict === v).length;
      return {
        id: h.id,
        checks,
        fit: n("fit"),
        against: n("against"),
        unknown: n("unknown"),
        uncovered: regions.filter((r) => !h.regions.includes(r)),
        unexplainedWeakness: unexplainedWeakness(db, answers, h.id),
        unexplained: notes,
      };
    })
    .sort((a, b) => b.fit - b.against - (a.fit - a.against) || a.against - b.against || b.fit - a.fit);
}
