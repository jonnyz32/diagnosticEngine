import { z } from "zod";
import { OTHER, posterior, restrictToRegions, scorableHypotheses } from "./bayes";
import { logicalFit } from "./logic";
import { RegionSchema, type Answer, type EvidenceDb, type Region } from "./schema";
import { isEligible, nextFinding, withImplied } from "./selection";
import { judgementRanking } from "./verdict";

/**
 * Accuracy check against published case reports (cases/cases.json). Each case holds only the
 * facts its report states, mapped to findings; anything unstated stays unanswered. Cases are
 * split into dev and holdout by a hash of the PMID, so nobody chooses which case lands where.
 * Holdout results are only ever reported in aggregate (see cases/README.md).
 */

export const CaseSchema = z.object({
  id: z.string(),
  pmid: z.string().regex(/^\d+$/),
  pmcid: z.string().optional(),
  doi: z.string().optional(),
  citation: z.string().min(10),
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // The hypothesis the report's final diagnosis corresponds to.
  diagnosis: z.string(),
  // "reference": surgery, nerve conduction/EMG, imaging or a diagnostic block.
  // "clinical": a clinician's diagnosis from history and examination only.
  confirmation: z.enum(["reference", "clinical"]),
  confirmedBy: z.string().min(3),
  age: z.number().int().positive().optional(),
  regions: z.array(RegionSchema).min(1),
  facts: z
    .array(
      z.object({
        finding: z.string(),
        answer: z.enum(["yes", "no"]),
        locator: z.string().min(3),
        // A clinician's examination mapped onto the matching self-test.
        clinician: z.boolean().default(false),
      }),
    )
    .min(3),
  notes: z.string().optional(),
});
export type Case = z.infer<typeof CaseSchema>;

// A case series contributes at most this many patients, so one paper can't dominate the score.
export const MAX_PER_PAPER = 10;

/** Cross-references the schema can't express. Returns error messages. */
export function checkCases(db: EvidenceDb, cases: Case[]): string[] {
  const errors: string[] = [];
  const sourcePmids = new Set(db.sources.map((s) => s.pmid));
  const seen = new Set<string>();
  const perPaper = new Map<string, number>();
  for (const c of cases) {
    // "c" + PMID for a single case report; "c" + PMID + "-" + patient number for a case series.
    if (c.id !== `c${c.pmid}` && !new RegExp(`^c${c.pmid}-\\d+$`).test(c.id)) errors.push(`${c.id}: id must be c<PMID> or c<PMID>-<n>`);
    if (seen.has(c.id)) errors.push(`${c.id}: duplicate id`);
    seen.add(c.id);
    perPaper.set(c.pmid, (perPaper.get(c.pmid) ?? 0) + 1);
    if (perPaper.get(c.pmid)! > MAX_PER_PAPER) errors.push(`${c.id}: more than ${MAX_PER_PAPER} patients from one paper`);
    // A case from a paper the evidence came from would test the evidence against itself.
    if (sourcePmids.has(c.pmid)) errors.push(`${c.id}: PMID is an evidence source`);
    if (!db.hypotheses.some((h) => h.id === c.diagnosis)) errors.push(`${c.id}: unknown diagnosis "${c.diagnosis}"`);
    const facts = new Set<string>();
    for (const f of c.facts) {
      if (!db.findings.some((x) => x.id === f.finding)) errors.push(`${c.id}: unknown finding "${f.finding}"`);
      if (facts.has(f.finding)) errors.push(`${c.id}: finding "${f.finding}" listed twice`);
      facts.add(f.finding);
    }
  }
  return errors;
}

// About 30% of cases are held out. Engineering constant, not clinical.
export const HOLDOUT_PER_TEN = 3;

/** FNV-1a hash of the PMID decides the split, so it can't be chosen by hand. */
export function splitOf(pmid: string): "dev" | "holdout" {
  let h = 0x811c9dc5;
  for (const ch of pmid) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h % 10 < HOLDOUT_PER_TEN ? "holdout" : "dev";
}

export interface CaseResult {
  id: string;
  diagnosis: string;
  confirmation: Case["confirmation"];
  // The territory gate kept the true diagnosis in play.
  inTerritory: boolean;
  // The true diagnosis has accuracy data, so it gets a probability.
  scorable: boolean;
  // Rank (1 = top) among all options including "other", using every stated fact.
  rankAll?: number;
  pAll?: number;
  // Same, after a simulated interview in which the case answers only what it states.
  rankInterview?: number;
  pInterview?: number;
  questionsAsked: number;
  // Rank in the logical fit (covers options without accuracy data).
  logicRank?: number;
  // Rank in the overall ranking behind the best guess (probability and logical fit combined),
  // after the simulated interview; 1 means the best guess names it.
  combinedRank?: number;
}

const rankOf = (ids: string[], id: string) => {
  const i = ids.indexOf(id);
  return i < 0 ? undefined : i + 1;
};

/** The case's facts that the app would actually ask, given its regions. */
export function caseAnswers(db: EvidenceDb, c: Case): Record<string, Answer> {
  const eligible = new Set(db.findings.filter((f) => isEligible(f, c.regions)).map((f) => f.id));
  return Object.fromEntries(c.facts.filter((f) => eligible.has(f.finding)).map((f) => [f.finding, f.answer]));
}

/** Runs the interview, answering from the case's facts and "unsure" otherwise. */
export function simulateInterview(db: EvidenceDb, c: Case, budget?: number): { answers: Record<string, Answer>; asked: number } {
  const facts = caseAnswers(db, c);
  const answers: Record<string, Answer> = {};
  let asked = 0;
  for (let i = 0; i < 100; i++) {
    const next = nextFinding(db, answers, c.regions, budget);
    if (next.done) break;
    answers[next.finding.id] = facts[next.finding.id] ?? "unsure";
    asked++;
  }
  return { answers, asked };
}

export function evaluateCase(db: EvidenceDb, c: Case, budget?: number): CaseResult {
  const regions: Region[] = c.regions;
  const view = restrictToRegions(db, regions);
  const inTerritory = view.hypotheses.some((h) => h.id === c.diagnosis);
  const scorable = scorableHypotheses(view).some((h) => h.id === c.diagnosis);
  const all = withImplied(db, caseAnswers(db, c), regions);
  const { answers, asked } = simulateInterview(db, c, budget);
  const interview = withImplied(db, answers, regions);
  const postAll = posterior(view, all);
  const postInt = posterior(view, interview);
  const fits = logicalFit(view, regions, all);
  return {
    id: c.id,
    diagnosis: c.diagnosis,
    confirmation: c.confirmation,
    inTerritory,
    scorable,
    rankAll: scorable ? rankOf(postAll.map((e) => e.id), c.diagnosis) : undefined,
    pAll: scorable ? postAll.find((e) => e.id === c.diagnosis)?.p : undefined,
    rankInterview: scorable ? rankOf(postInt.map((e) => e.id), c.diagnosis) : undefined,
    pInterview: scorable ? postInt.find((e) => e.id === c.diagnosis)?.p : undefined,
    questionsAsked: asked,
    logicRank: inTerritory ? rankOf(fits.map((f) => f.id), c.diagnosis) : undefined,
    combinedRank: inTerritory
      ? rankOf(judgementRanking(postInt, logicalFit(view, regions, interview)).map((o) => o.id), c.diagnosis)
      : undefined,
  };
}

export interface Summary {
  cases: number;
  outOfTerritory: number;
  scorable: number;
  top1All: number;
  top3All: number;
  top1Interview: number;
  top3Interview: number;
  // Mean probability given to the true diagnosis (scorable cases).
  meanPAll: number;
  // Cases where "something not covered" outranked the true diagnosis.
  otherAhead: number;
  // Logical-fit top 3, over every case inside the territory.
  logicTop3: number;
  // Overall-ranking top 1 and top 3 after the interview, over every case inside the territory.
  combinedTop1: number;
  combinedTop3: number;
  inTerritory: number;
}

export function summarise(db: EvidenceDb, cases: Case[], results: CaseResult[]): Summary {
  const s = results.filter((r) => r.scorable);
  const within = (k: number, r?: number) => r !== undefined && r <= k;
  const otherAhead = cases.filter((c, i) => {
    const r = results[i];
    if (!r.scorable) return false;
    const post = posterior(restrictToRegions(db, c.regions), withImplied(db, caseAnswers(db, c), c.regions));
    return post.findIndex((e) => e.id === OTHER) < post.findIndex((e) => e.id === c.diagnosis);
  }).length;
  return {
    cases: results.length,
    outOfTerritory: results.filter((r) => !r.inTerritory).length,
    scorable: s.length,
    top1All: s.filter((r) => within(1, r.rankAll)).length,
    top3All: s.filter((r) => within(3, r.rankAll)).length,
    top1Interview: s.filter((r) => within(1, r.rankInterview)).length,
    top3Interview: s.filter((r) => within(3, r.rankInterview)).length,
    meanPAll: s.length ? s.reduce((t, r) => t + (r.pAll ?? 0), 0) / s.length : 0,
    otherAhead,
    logicTop3: results.filter((r) => within(3, r.logicRank)).length,
    combinedTop1: results.filter((r) => within(1, r.combinedRank)).length,
    combinedTop3: results.filter((r) => within(3, r.combinedRank)).length,
    inTerritory: results.filter((r) => r.inTerritory).length,
  };
}
