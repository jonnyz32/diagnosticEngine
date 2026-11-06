import { OTHER } from "./bayes";
import type { LogicFit } from "./logic";

// The "best guess" headline and the overall ranking behind it combine the two views (user
// decision, 2026-11-06): each option starts at its probability, and each logical-fit check
// without study data (criteria or reasoning) that fits multiplies that by CHECK_FACTOR, each
// against divides by it. The result is an order, never shown or used as a probability; it reads
// the probabilities and the logical fit and changes neither, and nothing here feeds bayes.ts.
//
// An option without study data starts at the probability of "other": in bayes.ts every finding
// gives such an option the same background rate as "other", so that is the probability it would
// have if it were listed on its own. "Not covered by this tool" starts there too, with no checks,
// so an option has to fit something to beat it.
//
// Display constants, not clinical numbers. CHECK_FACTOR matches the question picker's
// CHECK_WEIGHT (selection.ts); on the twenty described patients factors 2, 3 and 4 gave the
// same best guesses.
export const CLEAR_LEAD_RATIO = 2;
export const CHECK_FACTOR = 2;
const MAX_NAMED = 3;

export type BestGuess =
  // One option scores at least CLEAR_LEAD_RATIO times the next and "not covered". `p` is absent
  // for an option without study data.
  | { kind: "leading"; id: string; p?: number; logicDisagrees: boolean }
  // Several options score within CLEAR_LEAD_RATIO of each other, and this one fits strictly more
  // of the answers (net logical fit, studied findings included) than every other of them.
  | { kind: "logic-lead"; id: string; scored: boolean; rivals: string[] }
  // As close, and the logical fit doesn't prefer one. `setAside`: close options it rules out
  // (more against than fit), left unnamed unless all are.
  | { kind: "close"; ids: string[]; setAside: string[] }
  // "Not covered by this tool" scores within CLEAR_LEAD_RATIO of the best listed option, or above
  // it. `bestListed` skips options the logical fit rules out, unless all of them are.
  | { kind: "other"; p: number; bestListed?: string }
  | { kind: "none" };

export interface RankedOption {
  id: string;
  p?: number; // absent: no study data, so no probability
  fit: number;
  against: number;
  // 1 = the top band: options scoring within CLEAR_LEAD_RATIO of the band's best, which the
  // logical fit then orders.
  band: number;
  // Net logical fit as the verdict counts it (`counted`): orders a band.
  net: number;
  // More checks against than fit, as the verdict counts them.
  ruledOut: boolean;
  // The combined score: an ordering value, not a probability.
  score: number;
}

// The checks the verdict counts. A published checklist counts as a whole by its own rule
// (logic.ts `checklistResult`): one against if an answer rules it out, otherwise its met items,
// prerequisites only once it is met. So an unmet item of a checklist that needs only some items,
// or of a list of risk factors (meralgia: tight clothing, pregnancy, diabetes), isn't evidence
// against, and "aged 50 or older" alone doesn't count for PMR. The logical-fit view still shows
// each item. `uncited`: leave out studied findings, which already moved the probability.
function counted(f: LogicFit | undefined, uncited: boolean): number {
  if (!f) return 0;
  const own = f.checks.filter((c) => c.basis === "reasoning" || (!uncited && c.basis === "evidence"));
  return own.filter((c) => c.verdict === "fit").length - own.filter((c) => c.verdict === "against").length + (f.checklist?.counted ?? 0);
}

// Where "not covered", and every option without study data, starts. With no posterior at all
// (nothing scorable), every option starts level.
function startOfUnscored(post: { id: string; p: number }[]): number {
  const other = post.find((e) => e.id === OTHER);
  return other ? other.p : 1;
}

/**
 * The overall ranking: every option by combined score, in bands where no option is
 * CLEAR_LEAD_RATIO times the next band's best; within a band, by net logical fit, then score.
 * Its first entry is the option `bestGuess` names whenever it names one.
 */
export function judgementRanking(post: { id: string; p: number }[], fits: LogicFit[]): RankedOption[] {
  const probability = new Map(post.filter((e) => e.id !== OTHER).map((e) => [e.id, e.p]));
  const start = startOfUnscored(post);
  const ids = [...new Set([...probability.keys(), ...fits.map((f) => f.id)])];
  const options: RankedOption[] = ids.map((id) => {
    const f = fits.find((x) => x.id === id);
    const p = probability.get(id);
    return {
      id,
      p,
      fit: f?.fit ?? 0,
      against: f?.against ?? 0,
      band: 0,
      net: counted(f, false),
      ruledOut: counted(f, false) < 0,
      score: (p ?? start) * CHECK_FACTOR ** counted(f, true),
    };
  });
  options.sort((a, b) => b.score - a.score);
  const ranked: RankedOption[] = [];
  let rest = options;
  for (let band = 1; rest.length; band++) {
    const head = rest[0];
    const members = rest.filter((o) => o === head || o.score * CLEAR_LEAD_RATIO > head.score);
    ranked.push(...members.map((o) => ({ ...o, band })).sort((a, b) => b.net - a.net || b.score - a.score));
    rest = rest.filter((o) => !members.includes(o));
  }
  return ranked;
}

export function bestGuess(post: { id: string; p: number }[], fits: LogicFit[]): BestGuess {
  const ranking = judgementRanking(post, fits);
  if (ranking.length === 0) return { kind: "none" };
  const band = ranking.filter((o) => o.band === 1);
  const best = Math.max(...band.map((o) => o.score));
  const notCovered = startOfUnscored(post);
  if (post.some((e) => e.id === OTHER) && notCovered * CLEAR_LEAD_RATIO > best) {
    const p = post.find((e) => e.id === OTHER)!.p;
    return { kind: "other", p, bestListed: (ranking.find((o) => !o.ruledOut) ?? ranking[0]).id };
  }
  const [first, second] = band;
  if (!second) {
    return first.p === undefined
      ? { kind: "leading", id: first.id, logicDisagrees: first.ruledOut }
      : { kind: "leading", id: first.id, p: first.p, logicDisagrees: first.ruledOut };
  }
  // The band is ordered by net logical fit, so the first fits strictly more than every other
  // member exactly when it fits more than the second.
  if (!first.ruledOut && first.net > second.net) {
    return { kind: "logic-lead", id: first.id, scored: first.p !== undefined, rivals: band.slice(1, 1 + MAX_NAMED).map((o) => o.id) };
  }
  const kept = band.filter((o) => !o.ruledOut);
  if (kept.length === 0) return { kind: "close", ids: band.slice(0, MAX_NAMED).map((o) => o.id), setAside: [] };
  return { kind: "close", ids: kept.slice(0, MAX_NAMED).map((o) => o.id), setAside: band.filter((o) => o.ruledOut).map((o) => o.id) };
}
