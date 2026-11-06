import { describe, expect, it } from "vitest";
import { OTHER } from "../../src/engine/bayes";
import type { LogicCheck, LogicFit } from "../../src/engine/logic";
import type { Finding } from "../../src/engine/schema";
import { bestGuess, judgementRanking } from "../../src/engine/verdict";

const check = (basis: LogicCheck["basis"], verdict: "fit" | "against"): LogicCheck => ({
  basis,
  verdict,
  finding: { id: "x" } as Finding,
  expect: "yes",
});

// `f` checks that fit and `against` that count against; uncited reasoning unless `basis` says
// they come from studies (which already moved the probability, so they don't move the score).
const fit = (id: string, f: number, against: number, basis: LogicCheck["basis"] = "reasoning"): LogicFit => ({
  id,
  checks: [...Array<LogicCheck>(f).fill(check(basis, "fit")), ...Array<LogicCheck>(against).fill(check(basis, "against"))],
  fit: f,
  against,
  unknown: 0,
  uncovered: [],
  unexplainedWeakness: [],
  unexplained: [],
});

describe("best guess: probability and logical fit combined", () => {
  it("names one option at least twice as far ahead as the next; studied checks don't count twice", () => {
    const post = [{ id: "A", p: 0.6 }, { id: "B", p: 0.3 }, { id: OTHER, p: 0.1 }];
    expect(bestGuess(post, [])).toEqual({ kind: "leading", id: "A", p: 0.6, logicDisagrees: false });
    // Studied checks against A leave its score alone but are flagged.
    expect(bestGuess(post, [fit("A", 1, 3, "evidence")])).toEqual({ kind: "leading", id: "A", p: 0.6, logicDisagrees: true });
  });

  it("each uncited check that fits doubles an option's score, each against halves it", () => {
    const post = [{ id: "A", p: 0.4 }, { id: "B", p: 0.35 }, { id: "C", p: 0.1 }, { id: OTHER, p: 0.15 }];
    // One check: B 0.7 vs A 0.4, too close, and B fits more.
    expect(bestGuess(post, [fit("B", 1, 0)])).toEqual({ kind: "logic-lead", id: "B", scored: true, rivals: ["A"] });
    // Two: B 1.4, clearly ahead.
    expect(bestGuess(post, [fit("B", 2, 0)])).toEqual({ kind: "leading", id: "B", p: 0.35, logicDisagrees: false });
    // A check against A (0.2) leaves B (0.35) alone in front.
    expect(bestGuess(post, [fit("A", 0, 1)])).toMatchObject({ kind: "logic-lead", id: "B" });
  });

  it("a published checklist counts as a whole, by its rule", () => {
    const post = [{ id: "A", p: 0.45 }, { id: "B", p: 0.2 }, { id: OTHER, p: 0.1 }];
    const withList = (id: string, checklist: LogicFit["checklist"], criteriaAgainst = 0) => ({ ...fit(id, 0, criteriaAgainst, "criteria"), checklist });
    // An unmet item of a checklist that is still open counts for nothing: A is neither halved nor set aside.
    expect(bestGuess(post, [withList("A", { status: "open", met: 0, unmet: 1, counted: 0 }, 1)])).toEqual({ kind: "leading", id: "A", p: 0.45, logicDisagrees: false });
    // A checklist that can no longer be met counts once against: A (0.225) is level with B.
    expect(bestGuess(post, [withList("A", { status: "impossible", met: 0, unmet: 1, counted: -1 }, 1)])).toMatchObject({ kind: "logic-lead", id: "B" });
    // Met items count for: B doubles to 0.4, level with A, and fits more.
    expect(bestGuess(post, [withList("B", { status: "met", met: 1, unmet: 0, counted: 1 })])).toMatchObject({ kind: "logic-lead", id: "B" });
  });

  it("a probability lead yields to enough uncited fit", () => {
    const post = [{ id: "A", p: 0.6 }, { id: "B", p: 0.2 }, { id: OTHER, p: 0.2 }];
    expect(bestGuess(post, [fit("B", 1, 0)])).toEqual({ kind: "logic-lead", id: "B", scored: true, rivals: ["A"] });
    expect(bestGuess(post, [fit("B", 3, 0)])).toMatchObject({ kind: "leading", id: "B" });
  });

  it("an option without study data starts where 'other' does", () => {
    const post = [{ id: "A", p: 0.4 }, { id: "B", p: 0.25 }, { id: OTHER, p: 0.35 }];
    // D: 0.35 × 2 = 0.7, level with A (0.4), and fits more.
    expect(bestGuess(post, [fit("D", 1, 0)])).toEqual({ kind: "logic-lead", id: "D", scored: false, rivals: ["A"] });
    // D: 1.4, clearly ahead; no probability to report.
    expect(bestGuess(post, [fit("D", 2, 0)])).toEqual({ kind: "leading", id: "D", logicDisagrees: false });
  });

  it("says the tool may not cover it when 'not covered' is level with the best listed option", () => {
    // Level: a listed option with nothing fitting doesn't beat "not covered".
    expect(bestGuess([{ id: "A", p: 0.38 }, { id: "B", p: 0.24 }, { id: OTHER, p: 0.38 }], [])).toEqual({ kind: "other", p: 0.38, bestListed: "A" });
    // Ahead; the closest listed option skips one the logical fit rules out.
    expect(bestGuess([{ id: OTHER, p: 0.5 }, { id: "A", p: 0.3 }, { id: "B", p: 0.2 }], [fit("A", 0, 1, "evidence")])).toEqual({
      kind: "other",
      p: 0.5,
      bestListed: "B",
    });
  });

  it("lists close options, setting aside those the logical fit rules out", () => {
    const post = [{ id: "A", p: 0.45 }, { id: "B", p: 0.4 }, { id: "C", p: 0.3 }, { id: OTHER, p: 0.1 }];
    expect(bestGuess(post, [])).toEqual({ kind: "close", ids: ["A", "B", "C"], setAside: [] });
    expect(bestGuess(post, [fit("C", 0, 1, "evidence")])).toEqual({ kind: "close", ids: ["A", "B"], setAside: ["C"] });
    expect(bestGuess(post, ["A", "B", "C"].map((id) => fit(id, 0, 1, "evidence")))).toEqual({ kind: "close", ids: ["A", "B", "C"], setAside: [] });
  });

  it("with nothing scorable, every option starts level", () => {
    expect(bestGuess([], [fit("A", 3, 1), fit("B", 1, 0)])).toEqual({ kind: "leading", id: "A", logicDisagrees: false });
    expect(bestGuess([], [fit("A", 1, 0), fit("B", 1, 0)])).toEqual({ kind: "close", ids: ["A", "B"], setAside: [] });
    expect(bestGuess([], [])).toEqual({ kind: "none" });
  });
});

describe("overall ranking", () => {
  const ids = (r: ReturnType<typeof judgementRanking>) => r.map((o) => `${o.band}:${o.id}`);

  it("bands by combined score and orders each band by logical fit", () => {
    const post = [{ id: "A", p: 0.6 }, { id: "B", p: 0.15 }, { id: "C", p: 0.12 }, { id: OTHER, p: 0.13 }];
    const r = judgementRanking(post, [fit("A", 0, 1, "evidence"), fit("C", 1, 0), fit("D", 1, 0), fit("E", 0, 1)]);
    // A 0.6 alone; D 0.26, C 0.24 and B 0.15 within a factor of two of D (D before C on score
    // at equal fit); E 0.065.
    expect(ids(r)).toEqual(["1:A", "2:D", "2:C", "2:B", "3:E"]);
    expect(r[0].ruledOut).toBe(true);
    expect(r.find((o) => o.id === "D")!.p).toBeUndefined();
  });

  it("puts first whichever option the best guess names (random cases)", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 2000; n++) {
      const scored = ["A", "B", "C", "D"].slice(0, Math.floor(rand() * 5));
      const raw = [...scored, OTHER].map((id) => ({ id, p: rand() }));
      const total = raw.reduce((t, e) => t + e.p, 0);
      const post = raw.map((e) => ({ id: e.id, p: e.p / total }));
      const fits = [...scored, "U", "V"]
        .filter(() => rand() < 0.8)
        .map((id) => fit(id, Math.floor(rand() * 4), Math.floor(rand() * 3), rand() < 0.5 ? "evidence" : "reasoning"));
      const g = bestGuess(post, fits);
      if ("id" in g) expect(judgementRanking(post, fits)[0].id, JSON.stringify({ post, fits, g })).toBe(g.id);
    }
  });
});
