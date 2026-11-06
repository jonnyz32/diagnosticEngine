import { counts, entropy, likelihood, OTHER, posterior, restrictToRegions, scorableHypotheses } from "./bayes";
import { logicalFit } from "./logic";
import type { Answer, EvidenceDb, Finding, Region } from "./schema";
import { stressPatterns } from "./stress";
import { bestGuess } from "./verdict";

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
// When the interview would end on a close call, up to this many more questions may be asked past
// the budget to separate the tied options (user request, 2026-11-06). Engineering constant.
export const CLOSE_CALL_EXTRA = 5;

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

// `Implied.from` for an answer read off the body map (`impliedByRegions`).
export const FROM_BODY_MAP = "body map";

export interface Implied {
  answer: Answer;
  from: string; // the answered finding it follows from, or FROM_BODY_MAP
}

/**
 * Answers that follow logically from answers already given (`impliedBy`) or from the areas
 * marked on the body map (`impliedByRegions`), so the question is never asked. Chains are
 * followed; an explicit answer always wins.
 */
export function impliedAnswers(db: EvidenceDb, answers: Record<string, Answer>, regions: Region[]): Record<string, Implied> {
  const implied: Record<string, Implied> = {};
  const known = (id: string) => answers[id] ?? implied[id]?.answer;
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of db.findings) {
      if (f.id in answers || f.id in implied || !isEligible(f, regions)) continue;
      if (f.impliedByRegions?.regions.some((r) => regions.includes(r))) {
        implied[f.id] = { answer: f.impliedByRegions.implies, from: FROM_BODY_MAP };
        changed = true;
        continue;
      }
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

/**
 * A question whose every option has been ruled out (see `ruledOutOptions`): the options it is a
 * logical-fit check for and, for a studied question, the options its studies measured. Like
 * asking about an eliminated suspect in Guess Who, it is skipped. Steering only.
 */
export function isRuledOut(db: EvidenceDb, f: Finding, ruledOut: Set<string>): boolean {
  const present = new Set(db.hypotheses.map((h) => h.id));
  const options = [...new Set([...checkedOptions(db, f), ...f.evidence.map((e) => e.hypothesis)])].filter((id) => present.has(id));
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

// For a question with no study data, the chance of "yes" from an option whose logical-fit check
// expects "yes" (or "no", mirrored), and from one with no check on it. Engineering constants for
// steering only: "usually" rather than "always", so no single answer is treated as certain.
const EXPECTED_P = 0.8;
const NO_CHECK_P = 0.5;

export interface Possibilities {
  // Every option still in play with its share: scored options by probability, and "other"
  // split evenly between the unscored options and a residual "not covered" share.
  shares: Map<string, number>;
  bits: number; // entropy of the shares: log2 of the effective number of possibilities left
  fits: ReturnType<typeof logicalFit>;
}

const RESIDUAL = "__not_covered";
// Each logical-fit check without study data (criteria or reasoning) that fits doubles an option's
// share of the possibilities, and each one against halves it. Engineering constant for steering
// only; it makes a confirming check worth asking, not just one that could rule an option out.
const CHECK_WEIGHT = 2;

// A ruled-out option (more against than fit in the logical fit) keeps this fraction of its share
// rather than vanishing, so an answer that brings it back is a finite change. Engineering
// constant for steering only.
const RULED_OUT_WEIGHT = 0.05;

/**
 * The possibilities still in play, the "Guess Who" view. Scored options keep their probability;
 * "other" (which holds the listed options with no study data) is split between the unscored
 * options and a residual share for causes not covered. Each share is then weighted by the
 * option's logical-fit checks that have no study data (CHECK_WEIGHT; studied findings already
 * moved the probability), and options the logical fit has ruled out shrink to RULED_OUT_WEIGHT.
 * Its entropy in bits is log2 of the effective number of possibilities: halving 8 equal
 * candidates takes it from 3 to 2 bits. This only steers which question comes next; it never
 * changes a probability.
 */
export function possibilities(db: EvidenceDb, answers: Record<string, Answer>, regions: Region[]): Possibilities {
  const fits = logicalFit(db, regions, answers);
  const weight = new Map(
    fits.map((l) => {
      const own = l.checks.filter((c) => c.basis !== "evidence");
      const net = own.filter((c) => c.verdict === "fit").length - own.filter((c) => c.verdict === "against").length;
      return [l.id, CHECK_WEIGHT ** net * (l.against > l.fit ? RULED_OUT_WEIGHT : 1)];
    }),
  );
  const scorable = new Set(scorableHypotheses(db).map((h) => h.id));
  const unscored = db.hypotheses.filter((h) => !scorable.has(h.id)).map((h) => h.id);
  const unscoredTotal = unscored.reduce((s, id) => s + weight.get(id)!, 1);
  const shares = new Map<string, number>();
  for (const e of posterior(db, answers)) {
    if (e.id === OTHER) {
      shares.set(RESIDUAL, e.p / unscoredTotal);
      for (const id of unscored) shares.set(id, (e.p * weight.get(id)!) / unscoredTotal);
    } else shares.set(e.id, e.p * weight.get(e.id)!);
  }
  const total = [...shares.values()].reduce((a, b) => a + b, 0);
  for (const [id, p] of shares) shares.set(id, p / total);
  return { shares, bits: entropy([...shares.values()]), fits };
}

// Guards the divergence against a share that underflows to zero. Engineering constant.
const SHARE_FLOOR = 1e-12;

/** How far an answer moves the possibilities, in bits (Kullback-Leibler divergence). */
function divergence(after: Possibilities, now: Possibilities): number {
  let d = 0;
  for (const [id, q] of after.shares) if (q > 0) d += q * Math.log2(q / Math.max(now.shares.get(id) ?? 0, SHARE_FLOOR));
  return d;
}

/**
 * Expected number of possibilities this question eliminates, in bits (1 bit = half of them,
 * like "is it a man?" in Guess Who): the expected divergence of the possibilities after the
 * answer from those now. Unlike a drop in entropy it is never negative, which matters because
 * the logical-fit weights aren't a Bayesian update.
 * For a question with study data the chance of "yes" comes from the probabilities; for one
 * without, from the options in play that expect "yes".
 */
export function expectedEliminated(
  db: EvidenceDb,
  answers: Record<string, Answer>,
  regions: Region[],
  f: Finding,
  now: Possibilities = possibilities(db, answers, regions),
): number {
  const yes = possibilities(db, withImplied(db, { ...answers, [f.id]: "yes" }, regions), regions);
  const no = possibilities(db, withImplied(db, { ...answers, [f.id]: "no" }, regions), regions);
  let pYes: number;
  if (f.evidence.length > 0) {
    pYes = posterior(db, answers).reduce((s, e) => s + e.p * likelihood(f, "yes", e.id), 0);
  } else {
    pYes = 0;
    for (const [id, share] of now.shares) {
      const check = yes.fits.find((l) => l.id === id)?.checks.find((c) => c.finding.id === f.id);
      const p = !check || check.verdict === "unknown" ? NO_CHECK_P : check.verdict === "fit" ? EXPECTED_P : 1 - EXPECTED_P;
      pYes += share * p;
    }
  }
  return pYes * divergence(yes, now) + (1 - pYes) * divergence(no, now);
}

/**
 * Asked once no question eliminates enough possibilities: first the remaining published-checklist
 * questions for an unscored option still in play, then (within the question budget) its
 * logical-fit checks, best first, then pain-description clues to a type of
 * stress that some but not all of the options in play involve and that the answers haven't
 * settled. In play means scored options at IN_PLAY_P or above, and unscored ones the logical fit
 * hasn't ruled out. A stress with a defining ("usual") clue is settled once that clue is
 * answered, and only that clue is asked; one without is settled by any clue that fits.
 */
export function nextAfterScored(
  db: EvidenceDb,
  answers: Record<string, Answer>,
  regions: Region[],
  ruledOut: Set<string>,
  withinBudget = true,
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
  // Published checklist items for an unscored option still in play are all asked, even once the
  // option looks settled (user decision, 2026-11-04: "if an option is still in play we should ask
  // about it"), so the checklist on the results page is filled in.
  const checklistIds = new Set(
    db.hypotheses
      .filter((h) => !scorable.has(h.id) && inPlay.has(h.id))
      .flatMap((h) => (h.criteria?.items ?? []).map((i) => i.linkedFinding)),
  );
  // The question that opens an unanswered checklist item (its `askIf`) counts as part of the
  // checklist, so a gated checklist (PMR's opens on "several places on both sides?") is reached.
  const opensChecklist = (f: Finding) =>
    db.findings.some((g) => checklistIds.has(g.id) && !(g.id in answers) && g.askIf?.finding === f.id);
  const checklist = open.find((f) => checklistIds.has(f.id) || opensChecklist(f));
  if (checklist) return checklist;
  // Then the logical-fit checks ("usual" or "supports") for an unscored option still in play,
  // most possibilities eliminated first, while the question budget lasts (user decision,
  // 2026-11-06). Among many options a check on one of them never clears MIN_INFORMATION_GAIN_BITS,
  // so without this an option with no study data was never asked about (axial SpA among the
  // low-back options). Steering only.
  if (withinBudget) {
    const now = possibilities(db, answers, regions);
    let best: { finding: Finding; gain: number } | undefined;
    for (const f of open) {
      const checks = db.hypotheses.some(
        (h) => !scorable.has(h.id) && inPlay.has(h.id) && h.logic.some((l) => l.finding === f.id && l.type !== "unexplained"),
      );
      if (!checks) continue;
      const gain = expectedEliminated(db, answers, regions, f, now);
      if (gain > 0 && (!best || gain > best.gain)) best = { finding: f, gain };
    }
    if (best) return best.finding;
  }
  const descriptions = open.filter((f) => f.kind === "profile");
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

/**
 * The interview would end with a close call (verdict.ts `bestGuess`): the open question bearing
 * on the tied options (a study measured it for one of them, or it is one of their logical-fit
 * checks) that eliminates the most possibilities. Asked even past the question budget, up to
 * CLOSE_CALL_EXTRA more (user request, 2026-11-06: Caleb's hip impingement, pubic bone stress and
 * obturator nerve stayed tied because "is the pain over the pubic bone?" and "is the worst pain
 * on the inner thigh?" were never reached). Steering only.
 */
function closeCallQuestion(db: EvidenceDb, answers: Record<string, Answer>, regions: Region[], open: Finding[], allowed: boolean): Finding | undefined {
  if (!allowed) return undefined;
  const guess = bestGuess(posterior(db, answers), logicalFit(db, regions, answers));
  if (guess.kind !== "close") return undefined;
  const tied = new Set(guess.ids);
  const pool = open.filter(
    (f) => !isContextOnly(db, f) && (f.evidence.some((e) => tied.has(e.hypothesis)) || checkedOptions(db, f).some((id) => tied.has(id))),
  );
  const now = possibilities(db, answers, regions);
  let best: { finding: Finding; gain: number } | undefined;
  for (const f of pool) {
    const gain = expectedEliminated(db, answers, regions, f, now);
    if (gain > 0 && (!best || gain > best.gain)) best = { finding: f, gain };
  }
  return best?.finding;
}

// `gain` is the expected possibilities the question eliminates, in bits (0 for a stress clue or a
// context question asked at the end).
export type NextStep = { done: false; finding: Finding; gain: number } | { done: true; reason: string };

/** A question that feeds no probability and no logical-fit check (e.g. recent surgery, shown as context). */
function isContextOnly(db: EvidenceDb, f: Finding): boolean {
  return f.evidence.length === 0 && checkedOptions(db, f).length === 0;
}

/**
 * The "Guess Who" rule: the next question is the one expected to eliminate the most possibilities
 * (in bits; see `possibilities`), whatever its kind. `askIf` and `followUp` are gates (the question makes
 * sense only after that answer, or once that option is likely enough), not a place in the queue.
 * Two exceptions: a body-map follow-up (`impliedByRegions`, e.g. "symptoms anywhere higher up
 * than the foot?") comes first, since it completes where the symptoms are; and a context-only
 * `askIf` detail ("which operation?") is asked straight after the answer that opens it, since it
 * scores nothing and the conversation would jump otherwise.
 * After the question budget or the early stop, only questions with no study data can still be
 * asked, to settle options that have no probability. Then come stress clues (`nextAfterScored`)
 * and context-only `alwaysAsk` questions.
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
  const current = new Map(posterior(db, answers).map((e) => [e.id, e.p]));
  const open = db.findings.filter(
    (f) =>
      !(f.id in answers) &&
      isEligible(f, regions) &&
      (!f.askIf || answers[f.askIf.finding] === f.askIf.answer) &&
      (!f.followUp || (current.get(f.followUp.hypothesis) ?? 0) >= f.followUp.minP) &&
      !isRuledOut(db, f, ruledOut),
  );
  // A body-map screen ("symptoms anywhere higher up?") completes where the symptoms are, so it
  // comes before any clinical question. A studied location question that the body map can fill
  // in (groin pain, Khan 2004) is not a screen: unanswered, it competes like any other.
  const bodyMap = open.find((f) => f.impliedByRegions && f.evidence.length === 0);
  if (bodyMap) return { done: false, finding: bodyMap, gain: expectedEliminated(db, answers, regions, bodyMap) };
  // A context-only follow-up ("which operation?") comes straight after the answer that opens it.
  const detail = open.find((f) => f.askIf && isContextOnly(db, f));
  if (detail) return { done: false, finding: detail, gain: 0 };
  const finish = (reason: string): NextStep => {
    // `alwaysAsk` questions without study data come last: context-only ones, and logical-fit
    // checks too small to clear the information threshold (e.g. tennis elbow's gripping question,
    // an option without study data among many).
    const d =
      nextAfterScored(db, answers, regions, ruledOut, asked < budget) ??
      closeCallQuestion(db, answers, regions, open, asked < budget + CLOSE_CALL_EXTRA) ??
      open.find((f) => f.alwaysAsk && f.evidence.length === 0);
    return d ? { done: false, finding: d, gain: 0 } : { done: true, reason };
  };

  // Pain-description questions don't use up the interview's question budget.
  const asked = Object.keys(given).filter((id) => fullDb.findings.find((f) => f.id === id)?.kind !== "profile").length;
  const top = posterior(db, answers)[0];
  const leading =
    top.p >= STOP_TOP_PROBABILITY && top.id !== OTHER && supportingFindings(db, answers, top.id).length >= MIN_SUPPORTING_FINDINGS;
  const limited = asked >= budget || leading;
  const pool = open.filter((f) => (limited ? f.evidence.length === 0 : true) && !isContextOnly(db, f));

  const now = possibilities(db, answers, regions);
  let best: { finding: Finding; gain: number } | null = null;
  for (const f of pool) {
    const gain = expectedEliminated(db, answers, regions, f, now);
    if (!best || gain > best.gain) best = { finding: f, gain };
  }
  if (best && best.gain >= MIN_INFORMATION_GAIN_BITS) return { done: false, ...best };
  if (asked >= budget) return finish("question limit reached");
  if (leading) return finish("one explanation is clearly leading");
  return finish("no remaining question would meaningfully change the result");
}
