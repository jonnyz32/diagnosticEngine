import { counts, entropy, likelihood, OTHER, posterior, restrictToRegions, scorableHypotheses } from "./bayes";
import { logicalFit } from "./logic";
import type { Answer, EvidenceDb, Finding, Region } from "./schema";
import { stressPatterns } from "./stress";

// Engineering stopping rules (not clinical values).
export const STOP_TOP_PROBABILITY = 0.85;
// Raised from 1e-6 ("ask every question that can still change anything") to shorten the interview
// (user request, 2026-11-04): on dev case reports, mean questions 22.8 -> 18.7 (leg regions
// 27.3 -> 21.4) with top-3 unchanged at 18/23; on synthetic patients 15.9 -> 11.0 for top-3
// 222 -> 215 of 252. Questions outside the territory or shadowed in a dependence group have zero gain.
export const MIN_INFORMATION_GAIN_BITS = 0.03;
// The early stop needs this many answered findings pointing toward the leader, so a single
// (possibly overstated) study can't end the interview on its own.
export const MIN_SUPPORTING_FINDINGS = 2;
// A scored option below this probability no longer decides which questions are asked after the scored ones.
export const IN_PLAY_P = 0.05;
// Raised from 25 (user decision, 2026-11-04): on dev case reports, 30 recovered 2 of the 3 cases
// lost to the limit for about 3 extra questions on average; higher limits gained 1 case for 7 more.
export const QUESTION_BUDGET = 30;

/** Answered findings whose answer is more likely under this hypothesis than under "other". */
export function supportingFindings(db: EvidenceDb, answers: Record<string, Answer>, hypId: string): Finding[] {
  return db.findings.filter((f) => {
    const a = answers[f.id];
    return a !== undefined && counts(f, a) && likelihood(f, a, hypId) > likelihood(f, a, OTHER);
  });
}

export function isEligible(f: Finding, regions: Region[]): boolean {
  return f.gateRegions.length === 0 || f.gateRegions.some((r) => regions.includes(r));
}

export interface Implied {
  answer: Answer;
  from: string; // the answered finding it follows from
}

/**
 * Answers that follow logically from answers already given (`impliedBy`), so the question
 * is never asked. Chains are followed; an explicit answer always wins.
 */
export function impliedAnswers(db: EvidenceDb, answers: Record<string, Answer>, regions: Region[]): Record<string, Implied> {
  const implied: Record<string, Implied> = {};
  const known = (id: string) => answers[id] ?? implied[id]?.answer;
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of db.findings) {
      if (f.id in answers || f.id in implied || !isEligible(f, regions)) continue;
      const rule = f.impliedBy.find((r) => known(r.finding) === r.answer);
      if (rule) {
        implied[f.id] = { answer: rule.implies, from: rule.finding };
        changed = true;
      }
    }
  }
  return implied;
}

/** Explicit answers plus the ones implied by them. */
export function withImplied(db: EvidenceDb, answers: Record<string, Answer>, regions: Region[]): Record<string, Answer> {
  const derived = Object.entries(impliedAnswers(db, answers, regions)).map(([id, i]) => [id, i.answer]);
  return { ...Object.fromEntries(derived), ...answers };
}

/**
 * Options an information-only finding would be a check for in the logical-fit view
 * ("usual", "supports" and criteria items; an "unexplained" item only adds a note).
 */
function checkedOptions(db: EvidenceDb, f: Finding): string[] {
  return db.hypotheses
    .filter(
      (h) =>
        h.logic.some((l) => l.finding === f.id && l.type !== "unexplained") ||
        (h.criteria?.items ?? []).some((i) => i.linkedFinding === f.id),
    )
    .map((h) => h.id);
}

/**
 * Options whose logical fit already has more "against" than "fit". Their information-only
 * questions are skipped: the answer could only add to the case against them. This only
 * steers which question comes next and never touches a probability.
 */
export function ruledOutOptions(db: EvidenceDb, answers: Record<string, Answer>, regions: Region[]): Set<string> {
  return new Set(logicalFit(db, regions, answers).filter((l) => l.against > l.fit).map((l) => l.id));
}

/** An information-only question whose every option has been ruled out (see `ruledOutOptions`). */
export function isRuledOut(db: EvidenceDb, f: Finding, ruledOut: Set<string>): boolean {
  if (f.evidence.length > 0) return false;
  const options = checkedOptions(db, f);
  return options.length > 0 && options.every((id) => ruledOut.has(id));
}

/** Expected reduction in posterior entropy (bits) from asking this finding. */
export function expectedInformationGain(db: EvidenceDb, answers: Record<string, Answer>, f: Finding): number {
  const current = posterior(db, answers);
  const pYes = current.reduce((s, e) => s + e.p * likelihood(f, "yes", e.id), 0);
  const hYes = entropy(posterior(db, { ...answers, [f.id]: "yes" }).map((e) => e.p));
  const hNo = entropy(posterior(db, { ...answers, [f.id]: "no" }).map((e) => e.p));
  return entropy(current.map((e) => e.p)) - (pYes * hYes + (1 - pYes) * hNo);
}

/**
 * The next question asked once the scored questions are done. It changes no probability (or not
 * for the option it is asked for) and is asked only when it can tell the options still in play
 * apart. In play means scored options at IN_PLAY_P or above, and unscored ones the logical fit
 * hasn't ruled out. First come logical-fit and criteria checks for an unscored option in play,
 * which no information gain would ever pick (e.g. the obturator nerve's inner-thigh check and
 * its Bradshaw pattern), then pain-description checks for any option in play. Then pain-description clues to a type of stress
 * that some but not all of the options in play involve and that the answers haven't settled. A
 * stress with a defining ("usual") clue is settled once that clue is answered, and only that clue
 * is asked; one without is settled by any clue that fits.
 */
export function nextAfterScored(
  db: EvidenceDb,
  answers: Record<string, Answer>,
  regions: Region[],
  ruledOut: Set<string>,
): Finding | undefined {
  const p = new Map(posterior(db, answers).map((e) => [e.id, e.p]));
  const scorable = new Set(scorableHypotheses(db).map((h) => h.id));
  const inPlay = new Set(
    db.hypotheses.filter((h) => (scorable.has(h.id) ? (p.get(h.id) ?? 0) >= IN_PLAY_P : !ruledOut.has(h.id))).map((h) => h.id),
  );
  const open = db.findings.filter(
    (f) =>
      !(f.id in answers) &&
      isEligible(f, regions) &&
      (!f.askIf || answers[f.askIf.finding] === f.askIf.answer) &&
      !isRuledOut(db, f, ruledOut),
  );
  const descriptions = open.filter((f) => f.kind === "profile");
  const check =
    open.find((f) => f.kind !== "profile" && checkedOptions(db, f).some((id) => inPlay.has(id) && !scorable.has(id))) ??
    descriptions.find((f) => checkedOptions(db, f).some((id) => inPlay.has(id)));
  if (check) return check;
  for (const pattern of stressPatterns(db, answers)) {
    const linked = pattern.type.conditions.filter((c) => inPlay.has(c.hypothesis)).length;
    if (linked === 0 || linked === inPlay.size) continue;
    const usual = pattern.checks.filter((c) => c.clue.type === "usual");
    if (usual.length ? usual.some((c) => c.verdict !== "unknown") : pattern.fit > 0) continue;
    const clueIds = (usual.length ? usual : pattern.checks).flatMap((c) => c.clue.anyOf);
    const f = descriptions.find((x) => clueIds.includes(x.id));
    if (f) return f;
  }
  return undefined;
}

export type NextStep = { done: false; finding: Finding; gain: number } | { done: true; reason: string };

/**
 * Highest-gain unanswered eligible finding. History questions are exhausted before
 * self-tests, since patient-reported items carry the most directly applicable evidence.
 */
export function nextFinding(
  fullDb: EvidenceDb,
  given: Record<string, Answer>,
  regions: Region[],
  budget = QUESTION_BUDGET,
): NextStep {
  const db = restrictToRegions(fullDb, regions);
  const answers = withImplied(db, given, regions);
  if (scorableHypotheses(db).length === 0) {
    return { done: true, reason: "no nerve for the areas you marked has published accuracy data to score" };
  }
  const ruledOut = ruledOutOptions(db, answers, regions);
  const finish = (reason: string): NextStep => {
    const d = nextAfterScored(db, answers, regions, ruledOut);
    return d ? { done: false, finding: d, gain: 0 } : { done: true, reason };
  };
  const core = db.findings.find(
    (f) =>
      !(f.id in answers) &&
      isEligible(f, regions) &&
      ((f.alwaysAsk && !f.askIf) || (f.askIf && answers[f.askIf.finding] === f.askIf.answer)) &&
      !isRuledOut(db, f, ruledOut),
  );
  if (core) return { done: false, finding: core, gain: expectedInformationGain(db, answers, core) };
  const current = new Map(posterior(db, answers).map((e) => [e.id, e.p]));
  const follow = db.findings.find(
    (f) =>
      f.followUp &&
      !(f.id in answers) &&
      isEligible(f, regions) &&
      (current.get(f.followUp.hypothesis) ?? 0) >= f.followUp.minP &&
      !isRuledOut(db, f, ruledOut),
  );
  if (follow) return { done: false, finding: follow, gain: 0 };
  // Pain-description questions don't use up the interview's question budget.
  const asked = Object.keys(given).filter((id) => fullDb.findings.find((f) => f.id === id)?.kind !== "profile").length;
  if (asked >= budget) return finish("question limit reached");
  const top = posterior(db, answers)[0];
  if (
    top.p >= STOP_TOP_PROBABILITY &&
    top.id !== OTHER &&
    supportingFindings(db, answers, top.id).length >= MIN_SUPPORTING_FINDINGS
  ) {
    return finish("one explanation is clearly leading");
  }

  for (const kind of ["history", "selftest"] as const) {
    let best: { finding: Finding; gain: number } | null = null;
    for (const f of db.findings) {
      if (f.kind !== kind || f.id in answers || !isEligible(f, regions)) continue;
      if (f.askIf && answers[f.askIf.finding] !== f.askIf.answer) continue;
      const gain = expectedInformationGain(db, answers, f);
      if (!best || gain > best.gain) best = { finding: f, gain };
    }
    if (best && best.gain >= MIN_INFORMATION_GAIN_BITS) return { done: false, ...best };
  }
  return finish("no remaining question would meaningfully change the result");
}
