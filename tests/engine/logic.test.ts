import { describe, expect, it } from "vitest";
import { checklistResult, logicalFit } from "../../src/engine/logic";
import { FindingSchema, type Hypothesis } from "../../src/engine/schema";
import { fixture } from "./fixture";

const answers = { f1: "no", f2: "yes", f5: "yes", f6: "no" } as const;
const fits = logicalFit(fixture, ["groin"], answers);
const of = (id: string) => fits.find((f) => f.id === id)!;

describe("logical fit", () => {
  it("notes unmarked territory without counting it against the option", () => {
    expect(of("C").uncovered).toEqual([]);
    expect(of("A").uncovered).toEqual(["groin"]);
    expect(of("A").checks).toHaveLength(2);
  });

  it("takes the direction of studied answers from which side of 1 the LR falls", () => {
    const f5 = of("C").checks.find((c) => c.finding.id === "f5");
    expect(f5).toMatchObject({ basis: "evidence", expect: "yes", verdict: "fit", sourceId: "s1" });
    // sens 0.5 / spec 0.5 points nowhere, so it isn't a check
    expect(of("A").checks.some((c) => c.finding.id === "f3")).toBe(false);
  });

  it("turns a studied yes that points away from an option into a note", () => {
    const f8 = FindingSchema.parse({
      id: "f8",
      kind: "history",
      prompt: "f8?",
      evidence: [{ hypothesis: "A", sens: 0.2, spec: 0.5, sourceId: "s1", locator: "Table 1", performedBy: "patient", adapted: false, population: "synthetic" }],
    });
    const db = { ...fixture, findings: [...fixture.findings, f8] };
    const A = (a: Record<string, "yes" | "no">) => logicalFit(db, [], a).find((f) => f.id === "A")!;
    expect(A({ f8: "yes" }).checks.some((c) => c.finding.id === "f8")).toBe(false);
    expect(A({ f8: "yes" }).unexplained).toMatchObject([{ finding: { id: "f8" }, sourceId: "s1" }]);
    expect(A({ f8: "no" })).toMatchObject({ fit: 0, against: 0, unexplained: [] });
  });

  it("counts a 'no' against only when the condition usually has the finding", () => {
    const f9 = FindingSchema.parse({
      id: "f9",
      kind: "history",
      prompt: "f9?",
      evidence: [{ hypothesis: "A", sens: 0.3, spec: 0.9, sourceId: "s1", locator: "Table 1", performedBy: "patient", adapted: false, population: "synthetic" }],
    });
    const db = { ...fixture, findings: [...fixture.findings, f9] };
    const A = (a: Record<string, "yes" | "no">) => logicalFit(db, [], a).find((f) => f.id === "A")!;
    expect(A({ f9: "no" }).checks.some((c) => c.finding.id === "f9")).toBe(false);
    expect(A({ f9: "yes" })).toMatchObject({ fit: 1, against: 0 });
    // f1 (sens 0.8) is usual, so its "no" still counts
    expect(A({ f1: "no" })).toMatchObject({ fit: 0, against: 1 });
  });

  it("ignores a 'no' on a positive-only finding", () => {
    expect(of("C").checks.some((c) => c.finding.id === "f6")).toBe(false);
  });

  it("gives one check per dependence group, from the answer the probability uses", () => {
    const group = of("A").checks.filter((c) => c.finding.dependenceGroup === "g");
    expect(group).toHaveLength(1);
    expect(group[0]).toMatchObject({ verdict: "against" });
    expect("finding" in group[0] && group[0].finding.id).toBe("f1");
  });

  it("scores a usual feature for an option with no study data, expecting yes", () => {
    const f3 = of("D").checks.find((c) => c.finding.id === "f3");
    expect(f3).toMatchObject({ basis: "reasoning", expect: "yes", verdict: "unknown", note: "synthetic reasoning" });
    expect(f3?.sourceId).toBeUndefined();
    expect(logicalFit(fixture, [], { f3: "no" }).find((f) => f.id === "D")).toMatchObject({ against: 1 });
  });

  it("fits a 'supports' item on yes and drops it on no, since other conditions share it", () => {
    const D = { ...fixture.hypotheses.find((h) => h.id === "D")!, logic: [{ finding: "f4", type: "supports" as const, reason: "synthetic relief" }] };
    const db = { ...fixture, hypotheses: [...fixture.hypotheses.filter((h) => h.id !== "D"), D] };
    const fitD = (a: Record<string, "yes" | "no">) => logicalFit(db, [], a).find((f) => f.id === "D")!;
    expect(fitD({})).toMatchObject({ fit: 0, against: 0, unknown: 1 });
    expect(fitD({ f4: "yes" })).toMatchObject({ fit: 1, against: 0, unknown: 0 });
    expect(fitD({ f4: "no" })).toMatchObject({ fit: 0, against: 0, unknown: 0, checks: [] });
  });

  it("shows a yes the option can't produce as a note, never against it", () => {
    expect(of("D").checks.some((c) => c.finding.id === "f5")).toBe(false);
    expect(of("D").unexplained.map((u) => [u.finding.id, u.reason])).toEqual([["f5", "synthetic note"]]);
    expect(logicalFit(fixture, [], { f5: "no" }).find((f) => f.id === "D")!.unexplained).toEqual([]);
  });

  it("counts unanswered checks as unknown and ranks by fit minus against", () => {
    expect(of("C")).toMatchObject({ fit: 1, against: 0, unknown: 1 });
    expect(of("A")).toMatchObject({ fit: 0, against: 1, unknown: 1 });
    expect(fits.map((f) => f.id)).toEqual(["C", "B", "D", "A"]);
  });
});

describe("published checklist judged by its rule", () => {
  // a: met (f2 yes), b: not met (f1 no), c: unanswered (f4), d: met (f5 yes). Option Z has no
  // study data, so every met item counts.
  const items = [
    { id: "a", prompt: "a", matchIf: "yes", linkedFinding: "f2" },
    { id: "b", prompt: "b", matchIf: "yes", linkedFinding: "f1" },
    { id: "c", prompt: "c", matchIf: "yes", linkedFinding: "f4" },
    { id: "d", prompt: "d", matchIf: "yes", linkedFinding: "f5" },
  ];
  const result = (rule: unknown, extra: Record<string, object> = {}) =>
    checklistResult(
      fixture,
      { id: "Z", criteria: { title: "t", sourceId: "s1", locator: "Table 1", clinicianOnly: [], rule, items: items.map((i) => ({ ...i, ...extra[i.id] })) } } as unknown as Hypothesis,
      answers,
    );

  it("all: one unmet item rules it out, counted once against", () => {
    expect(result({ type: "all" })).toEqual({ status: "impossible", met: 2, unmet: 1, counted: -1 });
  });

  it("any: one met item meets it", () => {
    expect(result({ type: "any" })).toMatchObject({ status: "met", counted: 2 });
  });

  it("at least n: open while unanswered items could still reach n", () => {
    expect(result({ type: "atLeast", n: 2 })).toMatchObject({ status: "met", counted: 2 });
    expect(result({ type: "atLeast", n: 3 })).toMatchObject({ status: "open", counted: 2 });
    expect(result({ type: "atLeast", n: 3, of: ["a", "b", "c"] })).toMatchObject({ status: "impossible", counted: -1 });
  });

  it("points: a prerequisite counts only once the checklist is met; clinician points keep it open", () => {
    const pts = { a: { required: true }, b: { points: 1 }, c: { points: 2 }, d: { points: 2 } };
    expect(result({ type: "points", threshold: 4, clinicianPoints: 0 }, pts)).toMatchObject({ status: "open", counted: 1 });
    expect(result({ type: "points", threshold: 2, clinicianPoints: 0 }, pts)).toMatchObject({ status: "met", counted: 2 });
    expect(result({ type: "points", threshold: 5, clinicianPoints: 0 }, pts)).toMatchObject({ status: "impossible", counted: -1 });
    expect(result({ type: "points", threshold: 5, clinicianPoints: 2 }, pts)).toMatchObject({ status: "open" });
    expect(result({ type: "points", threshold: 2, clinicianPoints: 0 }, { ...pts, a: { points: 1 }, b: { required: true } })).toMatchObject({ status: "impossible" });
  });

  it("no rule (a pattern or risk factors): met items count, unmet ones say nothing", () => {
    expect(result(undefined)).toEqual({ status: "pattern", met: 2, unmet: 1, counted: 2 });
  });
});
