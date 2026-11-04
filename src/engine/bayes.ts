import type { Accuracy, Answer, EvidenceDb, Finding, Hypothesis, Region } from "./schema";

export const OTHER = "other";

export interface SensSpec {
  sens: number;
  spec: number;
  derivedFromLR: boolean;
}

// Sens/spec as reported, or derived from LR+/LR- (sens = LR+(1-spec), spec = (LR+-1)/(LR+-LR-)).
export function toSensSpec(a: Accuracy): SensSpec {
  if (a.sens !== undefined && a.spec !== undefined) return { sens: a.sens, spec: a.spec, derivedFromLR: false };
  const lrPos = a.lrPos!;
  const lrNeg = a.lrNeg!;
  const spec = (lrPos - 1) / (lrPos - lrNeg);
  return { sens: lrPos * (1 - spec), spec, derivedFromLR: true };
}

// Lets the uncertainty module substitute sampled values for an accuracy entry.
export type AccuracyResolver = (a: Accuracy) => SensSpec;
const pointEstimate: AccuracyResolver = toSensSpec;

/**
 * Beta(α, β) matched to a point estimate and its 95% CI (sd ≈ width / 3.92).
 * Returns null when the CI is missing or too wide to fit a unimodal Beta.
 */
export function betaFromCI(mean: number, ci: [number, number] | undefined): [number, number] | null {
  if (!ci || mean <= 0 || mean >= 1) return null;
  const sd = (ci[1] - ci[0]) / 3.92;
  if (sd <= 0) return null;
  const k = (mean * (1 - mean)) / (sd * sd) - 1;
  if (k <= 0) return null;
  return [mean * k, (1 - mean) * k];
}

/** Effective sample sizes (α + β of the CI-matched Beta), or equal weights if any study lacks a usable CI. */
function weights(entries: Accuracy[], pick: (s: SensSpec, a: Accuracy) => [number, [number, number] | undefined]): number[] {
  const n = entries.map((a) => {
    const [mean, ci] = pick(toSensSpec(a), a);
    const b = betaFromCI(mean, ci);
    return b ? b[0] + b[1] : null;
  });
  return n.every((x) => x !== null) ? (n as number[]) : entries.map(() => 1);
}

/**
 * Several studies of one finding for one hypothesis are pooled (fixed effect): sens and spec
 * are each a weighted mean, weighted by each study's effective sample size. Weights come from
 * the reported CIs, so resampled values (uncertainty.ts) are pooled with the same weights.
 */
export function pooled(entries: Accuracy[], resolve: AccuracyResolver = pointEstimate): SensSpec {
  if (entries.length === 1) return resolve(entries[0]);
  const ws = weights(entries, (s, a) => [s.sens, a.sensCI]);
  const wp = weights(entries, (s, a) => [s.spec, a.specCI]);
  const vals = entries.map(resolve);
  const mean = (w: number[], get: (s: SensSpec) => number) =>
    vals.reduce((sum, v, i) => sum + w[i] * get(v), 0) / w.reduce((x, y) => x + y, 0);
  return { sens: mean(ws, (v) => v.sens), spec: mean(wp, (v) => v.spec), derivedFromLR: vals.some((v) => v.derivedFromLR) };
}

/** Pooled studies disagree when any two have non-overlapping sensitivity or specificity CIs. */
export function studiesDisagree(entries: Accuracy[]): boolean {
  const apart = (a?: [number, number], b?: [number, number]) => !!a && !!b && (a[1] < b[0] || b[1] < a[0]);
  return entries.some((a, i) => entries.slice(i + 1).some((b) => apart(a.sensCI, b.sensCI) || apart(a.specCI, b.specCI)));
}

export interface PriorInfo {
  p: number;
  cited: boolean;
}

/**
 * Anatomical territory gate: a nerve is only considered when the patient marked at
 * least one region it supplies. This is a deterministic rule (like red flags), not a
 * probability. With no regions marked, nothing is excluded.
 */
export function restrictToRegions(db: EvidenceDb, regions: Region[]): EvidenceDb {
  if (regions.length === 0) return db;
  return { ...db, hypotheses: db.hypotheses.filter((h) => h.regions.some((r) => regions.includes(r))) };
}

/** A hypothesis can only be scored if at least one finding carries accuracy data for it. */
export function scorableHypotheses(db: EvidenceDb): Hypothesis[] {
  const withData = new Set(db.findings.flatMap((f) => f.evidence.map((e) => e.hypothesis)));
  return db.hypotheses.filter((h) => withData.has(h.id));
}

export function unscorableHypotheses(db: EvidenceDb): Hypothesis[] {
  const scorable = new Set(scorableHypotheses(db).map((h) => h.id));
  return db.hypotheses.filter((h) => !scorable.has(h.id));
}

/**
 * Cited priors are used as reported. The remaining mass is split equally between
 * uncited scorable hypotheses and the "other / not in model" bucket.
 */
export function computePriors(db: EvidenceDb): Map<string, PriorInfo> {
  const hyps = scorableHypotheses(db);
  const cited = hyps.filter((h) => h.prior);
  const citedSum = cited.reduce((s, h) => s + h.prior!.value, 0);
  if (citedSum >= 1) throw new Error(`cited priors sum to ${citedSum.toFixed(3)}; must be < 1 to leave room for "other"`);
  const uncitedCount = hyps.length - cited.length + 1; // +1 for OTHER
  const share = (1 - citedSum) / uncitedCount;
  const priors = new Map<string, PriorInfo>();
  for (const h of hyps) priors.set(h.id, h.prior ? { p: h.prior.value, cited: true } : { p: share, cited: false });
  priors.set(OTHER, { p: share, cited: false });
  return priors;
}

/**
 * P(answer | hypothesis). For the study's target hypothesis we use sens; for every
 * other hypothesis (incl. OTHER) we use the mean false-positive rate (1 - spec) of the
 * entries on this finding — the one-vs-rest approximation.
 */
/** All studies of this finding for this hypothesis (pooled when there are several). */
export function ownEvidence(finding: Finding, hypId: string): Accuracy[] {
  return finding.evidence.filter((e) => e.hypothesis === hypId);
}

/** Whether this answer updates the posterior at all. */
export function counts(finding: Finding, answer: Answer | undefined): boolean {
  if (!answer || answer === "unsure" || finding.evidence.length === 0) return false;
  return !(finding.scoreOn === "positive" && answer === "no");
}

export function likelihood(finding: Finding, answer: Answer, hypId: string, resolve: AccuracyResolver = pointEstimate): number {
  if (!counts(finding, answer)) return 1;
  // A positive-only entry gives no information on a "no": fall back to the non-target rate.
  const own = ownEvidence(finding, hypId).filter((e) => !(e.scoreOn === "positive" && answer === "no"));
  let pYes: number;
  if (own.length) {
    pYes = pooled(own, resolve).sens;
  } else {
    // Borrowed comparison rates duplicate another study's data, so they don't vote here.
    // Studies are pooled per hypothesis first, so one well-studied hypothesis doesn't dominate.
    const direct = finding.evidence.filter((e) => !e.specFrom);
    const byHyp = new Map<string, Accuracy[]>();
    for (const e of direct.length ? direct : finding.evidence) byHyp.set(e.hypothesis, [...(byHyp.get(e.hypothesis) ?? []), e]);
    const fprs = [...byHyp.values()].map((es) => 1 - pooled(es, resolve).spec);
    pYes = fprs.reduce((s, x) => s + x, 0) / fprs.length;
  }
  // Clamp away from 0/1 so a single reported 100% doesn't zero a hypothesis forever.
  pYes = Math.min(Math.max(pYes, 0.005), 0.995);
  return answer === "yes" ? pYes : 1 - pYes;
}

/** Largest |log LR| this answer produces against the non-target rate, across hypotheses. */
function strength(finding: Finding, answer: Answer, hypIds: string[], resolve: AccuracyResolver): number {
  if (!counts(finding, answer)) return 0;
  const base = likelihood(finding, answer, OTHER, resolve);
  return Math.max(...hypIds.map((h) => Math.abs(Math.log(likelihood(finding, answer, h, resolve) / base))));
}

/**
 * Of the answered findings, which ones actually update the posterior: within each
 * dependenceGroup only the strongest answered finding counts.
 */
export function appliedFindings(
  db: EvidenceDb,
  answers: Record<string, Answer>,
  resolve: AccuracyResolver = pointEstimate,
): { applied: Finding[]; suppressed: { finding: Finding; by: string }[] } {
  const hypIds = [...computePriors(db).keys()];
  const answered = db.findings.filter((f) => counts(f, answers[f.id]));
  const best = new Map<string, Finding>();
  for (const f of answered) {
    if (!f.dependenceGroup) continue;
    const cur = best.get(f.dependenceGroup);
    if (!cur || strength(f, answers[f.id], hypIds, resolve) > strength(cur, answers[cur.id], hypIds, resolve)) {
      best.set(f.dependenceGroup, f);
    }
  }
  const applied: Finding[] = [];
  const suppressed: { finding: Finding; by: string }[] = [];
  for (const f of answered) {
    if (!f.dependenceGroup || best.get(f.dependenceGroup) === f) applied.push(f);
    else suppressed.push({ finding: f, by: best.get(f.dependenceGroup)!.id });
  }
  return { applied, suppressed };
}

export interface PosteriorEntry {
  id: string;
  p: number;
  priorCited: boolean;
}

export function posterior(
  db: EvidenceDb,
  answers: Record<string, Answer>,
  resolve: AccuracyResolver = pointEstimate,
): PosteriorEntry[] {
  const priors = computePriors(db);
  const { applied } = appliedFindings(db, answers, resolve);
  const logs = new Map<string, number>();
  for (const [id, { p }] of priors) {
    let lp = Math.log(p);
    for (const f of applied) lp += Math.log(likelihood(f, answers[f.id], id, resolve));
    logs.set(id, lp);
  }
  const max = Math.max(...logs.values());
  let z = 0;
  for (const lp of logs.values()) z += Math.exp(lp - max);
  return [...logs]
    .map(([id, lp]) => ({ id, p: Math.exp(lp - max) / z, priorCited: priors.get(id)!.cited }))
    .sort((a, b) => b.p - a.p);
}

export function entropy(ps: number[]): number {
  return -ps.reduce((s, p) => (p > 0 ? s + p * Math.log2(p) : s), 0);
}

export interface TrailStep {
  finding: Finding;
  answer: Answer;
  likelihoodRatio: number; // P(answer | h) / P(answer | not-target)
  evidence: Accuracy[]; // studies pooled for h; empty when h uses the non-target rate
  suppressedBy?: string;
}

/** The chain of evidence behind one hypothesis' probability, for display. */
export function evidenceTrail(db: EvidenceDb, answers: Record<string, Answer>, hypId: string): TrailStep[] {
  const { applied, suppressed } = appliedFindings(db, answers);
  const step = (f: Finding, suppressedBy?: string): TrailStep => ({
    finding: f,
    answer: answers[f.id],
    likelihoodRatio: likelihood(f, answers[f.id], hypId) / likelihood(f, answers[f.id], OTHER),
    evidence: ownEvidence(f, hypId),
    suppressedBy,
  });
  return [...applied.map((f) => step(f)), ...suppressed.map((s) => step(s.finding, s.by))];
}
