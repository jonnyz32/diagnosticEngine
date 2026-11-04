import { describe, expect, it } from "vitest";
import { OTHER } from "../../src/engine/bayes";
import type { LogicFit } from "../../src/engine/logic";
import { bestGuess } from "../../src/engine/verdict";

const fit = (id: string, f: number, against: number): LogicFit => ({
  id,
  checks: [],
  fit: f,
  against,
  unknown: 0,
  uncovered: [],
  unexplainedWeakness: [],
  unexplained: [],
});

describe("best guess", () => {
  it("names one option when it is at least twice as likely as the next", () => {
    const g = bestGuess([{ id: "A", p: 0.6 }, { id: "B", p: 0.3 }, { id: OTHER, p: 0.1 }], [fit("A", 1, 3)]);
    expect(g).toEqual({ kind: "leading", id: "A", p: 0.6, logicDisagrees: true });
  });

  it("names every option within the ratio of the top when it is close", () => {
    const g = bestGuess(
      [{ id: "A", p: 0.4 }, { id: "B", p: 0.35 }, { id: "C", p: 0.1 }, { id: OTHER, p: 0.15 }],
      [fit("A", 2, 0), fit("B", 2, 1)],
    );
    expect(g).toEqual({ kind: "close", ids: ["A", "B"], logicDisagrees: false });
  });

  it("says the tool doesn't cover it when 'other' beats every listed option", () => {
    const g = bestGuess([{ id: OTHER, p: 0.5 }, { id: "A", p: 0.3 }, { id: "B", p: 0.2 }], []);
    expect(g).toEqual({ kind: "other", p: 0.5, bestListed: "A" });
  });

  it("falls back to the logical fit when nothing has study data", () => {
    expect(bestGuess([], [fit("A", 3, 1), fit("B", 1, 0)])).toEqual({ kind: "logic-only", id: "A" });
    expect(bestGuess([], [fit("A", 1, 0), fit("B", 1, 0)])).toEqual({ kind: "none" });
  });
});
