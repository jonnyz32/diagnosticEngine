import { OTHER } from "./bayes";
import type { LogicFit } from "./logic";

// The one-line "we think it is this" headline. It only reads the probabilities and the
// logical fit already computed elsewhere; it never changes either. The ratio is a display
// rule (when to name one option rather than several), not a clinical number.
export const CLEAR_LEAD_RATIO = 2;
const MAX_NAMED = 3;

export type BestGuess =
  // One option is at least CLEAR_LEAD_RATIO times as likely as the next.
  | { kind: "leading"; id: string; p: number; logicDisagrees: boolean }
  // The top options are within CLEAR_LEAD_RATIO of each other.
  | { kind: "close"; ids: string[]; logicDisagrees: boolean }
  // "Something not covered by this tool" beats every listed option.
  | { kind: "other"; p: number; bestListed?: string }
  // No option has study data; the logical fit alone points to one.
  | { kind: "logic-only"; id: string }
  | { kind: "none" };

export function bestGuess(post: { id: string; p: number }[], fits: LogicFit[]): BestGuess {
  const scored = post.filter((e) => e.id !== OTHER).sort((a, b) => b.p - a.p);
  const other = post.find((e) => e.id === OTHER)?.p ?? 0;
  const net = (f: LogicFit) => f.fit - f.against;
  const disagrees = (id: string) => {
    const f = fits.find((x) => x.id === id);
    return f !== undefined && f.against > f.fit;
  };

  if (scored.length === 0) {
    const [a, b] = [...fits].sort((x, y) => net(y) - net(x));
    if (a && net(a) > 0 && (!b || net(a) > net(b))) return { kind: "logic-only", id: a.id };
    return { kind: "none" };
  }
  const [top, second] = scored;
  if (other > top.p) return { kind: "other", p: other, bestListed: top.id };
  if (!second || top.p >= CLEAR_LEAD_RATIO * second.p) {
    return { kind: "leading", id: top.id, p: top.p, logicDisagrees: disagrees(top.id) };
  }
  const ids = scored.filter((e) => e.p * CLEAR_LEAD_RATIO > top.p).slice(0, MAX_NAMED).map((e) => e.id);
  return { kind: "close", ids, logicDisagrees: ids.some(disagrees) };
}
