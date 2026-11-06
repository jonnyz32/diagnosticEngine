import { describe, expect, it } from "vitest";
import { computePriors, evidenceTrail, OTHER, posterior, restrictToRegions, toSensSpec, unscorableHypotheses } from "../../src/engine/bayes";
import { initialSession, reduce } from "../../src/engine/session";
import { expectedEliminated, expectedInformationGain, impliedAnswers, nextFinding } from "../../src/engine/selection";
import { evidenceSummary } from "../../src/engine/summary";
import { posteriorIntervals } from "../../src/engine/uncertainty";
import { fixture } from "./fixture";

const p = (answers: Record<string, "yes" | "no" | "unsure">) =>
  Object.fromEntries(posterior(fixture, answers).map((e) => [e.id, e.p]));

describe("priors", () => {
  it("uses cited priors and splits the remainder between uncited scorable hypotheses and other", () => {
    const pr = computePriors(fixture);
    expect(pr.get("A")).toEqual({ p: 0.3, cited: true });
    expect(pr.get("C")!.p).toBeCloseTo(0.25);
    expect(pr.get(OTHER)!.p).toBeCloseTo(0.25);
    expect(pr.has("D")).toBe(false);
  });

  it("lists hypotheses with no accuracy data as unscorable", () => {
    expect(unscorableHypotheses(fixture).map((h) => h.id)).toEqual(["D"]);
  });
});

describe("posterior", () => {
  it("matches a hand calculation for a single positive finding", () => {
    // A: .3*.8=.24, B: .2*.1=.02, C: .25*.1=.025, other: .25*.1=.025; total .31
    const r = p({ f1: "yes" });
    expect(r.A).toBeCloseTo(0.24 / 0.31, 6);
    expect(r.B).toBeCloseTo(0.02 / 0.31, 6);
    expect(r[OTHER]).toBeCloseTo(0.025 / 0.31, 6);
  });

  it("matches a hand calculation for a negative finding", () => {
    // A: .3*.2=.06, B: .2*.9=.18, C: .25*.9=.225, other .225; total .69
    expect(p({ f1: "no" }).A).toBeCloseTo(0.06 / 0.69, 6);
  });

  it("ignores unsure answers", () => {
    expect(p({ f1: "unsure" }).A).toBeCloseTo(0.3, 6);
  });

  it("applies only the strongest finding within a dependence group", () => {
    expect(p({ f1: "yes", f2: "yes" }).A).toBeCloseTo(p({ f1: "yes" }).A, 9);
    const trail = evidenceTrail(fixture, { f1: "yes", f2: "yes" }, "A");
    expect(trail.find((t) => t.finding.id === "f2")!.suppressedBy).toBe("f1");
  });

  it("ignores a negative answer on a positive-only finding but counts a positive one", () => {
    expect(p({ f6: "no" }).C).toBeCloseTo(p({}).C, 9);
    // C: .25*.9=.225; A: .3*.1=.03; B: .2*.1=.02; other: .25*.1=.025; total .30
    expect(p({ f6: "yes" }).C).toBeCloseTo(0.225 / 0.3, 6);
  });

  it("cross-study positive-only entries: borrowed rates don't vote, and a 'no' is uninformative for that hypothesis", () => {
    // yes: A .3*.6=.18, B .2*.3=.06 (non-target rate from the direct entry only), C .25*.995=.24875, other .25*.3=.075
    expect(p({ f7: "yes" }).C).toBeCloseTo(0.24875 / 0.56375, 5);
    // no: C falls back to the non-target rate (.7), exactly like B and other, so C:B is unchanged
    const no = p({ f7: "no" });
    const none = p({});
    expect(no.C / no.B).toBeCloseTo(none.C / none.B, 9);
  });

  it("derives sens/spec from likelihood ratios", () => {
    const s = toSensSpec({ hypothesis: "A", lrPos: 8, lrNeg: 0.2 / 0.9, sourceId: "s1", locator: "xyz", performedBy: "patient", adapted: false, population: "x" });
    expect(s.sens).toBeCloseTo(0.8, 6);
    expect(s.spec).toBeCloseTo(0.9, 6);
  });
});

describe("evidence summary", () => {
  it("measures each direct answer by leave-one-out and puts indirect effects in their own bucket", () => {
    const s = evidenceSummary(fixture, { f1: "yes" }, "A");
    // A goes from its prior .3 to .24/.31 when f1 = yes
    expect(s.supporting.map((i) => i.finding.id)).toEqual(["f1"]);
    expect(s.supporting[0].delta).toBeCloseTo(0.24 / 0.31 - 0.3, 6);
    expect(s.against).toEqual([]);
    expect(s.indirect).toBeCloseTo(0, 9);

    // f1 has no entry for B, so for B it is purely indirect
    const b = evidenceSummary(fixture, { f1: "yes" }, "B");
    expect(b.supporting).toEqual([]);
    expect(b.indirect).toBeCloseTo(0.02 / 0.31 - 0.2, 6);
  });
});

describe("selection", () => {
  it("prefers the informative question over an uninformative one", () => {
    expect(expectedInformationGain(fixture, {}, fixture.findings[2])).toBeCloseTo(0, 6);
    const next = nextFinding(fixture, {}, ["buttock"]);
    expect(next.done).toBe(false);
    if (!next.done) expect(next.finding.id).not.toBe("f3");
  });

  it("does not ask self-tests gated to regions the patient did not mark", () => {
    const next = nextFinding(fixture, { f1: "no", f2: "no", f3: "no", f5: "no" }, ["buttock"]);
    expect(next.done).toBe(true);
  });

  it("fills in an implied answer instead of asking it, following chains", () => {
    const rule = (finding: string, answer: "yes" | "no", implies: "yes" | "no") => [{ finding, answer, implies }];
    const db = {
      ...fixture,
      findings: fixture.findings.map((f) =>
        f.id === "f2" ? { ...f, impliedBy: rule("f1", "yes", "yes") } : f.id === "f3" ? { ...f, impliedBy: rule("f2", "yes", "no") } : f,
      ),
    };
    expect(impliedAnswers(db, { f1: "yes" }, ["buttock"])).toEqual({
      f2: { answer: "yes", from: "f1" },
      f3: { answer: "no", from: "f2" },
    });
    expect(impliedAnswers(db, { f1: "yes", f2: "no" }, ["buttock"])).toEqual({}); // explicit answer wins
    expect(impliedAnswers(db, { f1: "unsure" }, ["buttock"])).toEqual({});
    const next = nextFinding(db, { f1: "yes" }, ["buttock"]);
    if (!next.done) expect(["f2", "f3"]).not.toContain(next.finding.id);
  });

  it("asks the question expected to eliminate the most possibilities, whatever its kind", () => {
    const regions = ["buttock", "calf", "groin"] as const;
    const next = nextFinding(fixture, {}, [...regions]);
    expect(next.done).toBe(false);
    if (next.done) return;
    const view = restrictToRegions(fixture, [...regions]);
    const gains = view.findings
      .filter((f) => f.gateRegions.length === 0 || f.gateRegions.some((r) => (regions as readonly string[]).includes(r)))
      .map((f) => expectedEliminated(view, {}, [...regions], f));
    expect(next.gain).toBeCloseTo(Math.max(...gains), 9);
  });
});

describe("session", () => {
  it("starting goes straight to the body map (no red-flag screen)", () => {
    expect(reduce(fixture, initialSession, { type: "start" }).phase).toBe("regions");
  });
});

describe("uncertainty", () => {
  it("produces intervals that contain the point estimate and are reproducible", () => {
    const iv = posteriorIntervals(fixture, { f1: "yes" }, 300, 7);
    const a = iv.get("A")!;
    expect(a.lo).toBeLessThan(p({ f1: "yes" }).A);
    expect(a.hi).toBeGreaterThan(p({ f1: "yes" }).A);
    expect(posteriorIntervals(fixture, { f1: "yes" }, 300, 7).get("A")).toEqual(a);
  });
});
