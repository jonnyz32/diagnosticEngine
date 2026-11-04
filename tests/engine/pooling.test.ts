import { describe, expect, it } from "vitest";
import { betaFromCI, likelihood, OTHER, pooled, studiesDisagree } from "../../src/engine/bayes";
import { EvidenceDbSchema } from "../../src/engine/schema";

// Synthetic studies for testing the pooling math only. Not clinical data.
const acc = (sourceId: string, hypothesis: string, sens: number, spec: number, extra = {}) => ({
  hypothesis,
  sens,
  spec,
  sourceId,
  locator: "Table 1",
  performedBy: "patient" as const,
  adapted: false,
  population: "synthetic",
  ...extra,
});
const big = acc("s1", "A", 0.8, 0.6, { sensCI: [0.75, 0.85], specCI: [0.55, 0.65] });
const small = acc("s2", "A", 0.4, 0.9, { sensCI: [0.2, 0.6], specCI: [0.75, 0.97] });

const db = EvidenceDbSchema.parse({
  sources: ["s1", "s2", "s3"].map((id) => ({ id, citation: `Synthetic test source ${id}`, pmid: "1", design: "synthetic", population: "synthetic", verifiedOn: "2026-11-02" })),
  hypotheses: ["A", "B"].map((id) => ({ id, name: id, shortName: id, description: id, regions: ["buttock"], prior: null })),
  findings: [{ id: "f", kind: "history", prompt: "f?", evidence: [big, small, acc("s3", "B", 0.5, 0.7)] }],
  redFlags: [],
  confirmatory: [],
});
const f = db.findings[0];

describe("pooling several studies of one finding", () => {
  it("returns a single study unchanged", () => {
    expect(pooled([f.evidence[2]])).toEqual({ sens: 0.5, spec: 0.7, derivedFromLR: false });
  });

  it("weights each study by its effective sample size from the CI", () => {
    const n = (m: number, ci: [number, number]) => betaFromCI(m, ci)!.reduce((a, b) => a + b);
    const [n1, n2] = [n(0.8, [0.75, 0.85]), n(0.4, [0.2, 0.6])];
    const p = pooled(f.evidence.slice(0, 2));
    expect(p.sens).toBeCloseTo((n1 * 0.8 + n2 * 0.4) / (n1 + n2), 9);
    // the larger study dominates
    expect(p.sens).toBeGreaterThan(0.75);
  });

  it("weights studies equally when any lacks a CI", () => {
    const p = pooled([acc("s1", "A", 0.8, 0.6, { sensCI: [0.75, 0.85], specCI: [0.55, 0.65] }), acc("s2", "A", 0.4, 0.9)] as never);
    expect(p.sens).toBeCloseTo(0.6, 9);
    expect(p.spec).toBeCloseTo(0.75, 9);
  });

  it("uses the pooled sensitivity for the hypothesis", () => {
    expect(likelihood(f, "yes", "A")).toBeCloseTo(pooled(f.evidence.slice(0, 2)).sens, 9);
  });

  it("pools per hypothesis before averaging the non-target rate", () => {
    // A's studies count once (pooled spec), not twice
    const fprA = 1 - pooled(f.evidence.slice(0, 2)).spec;
    expect(likelihood(f, "yes", OTHER)).toBeCloseTo((fprA + 0.3) / 2, 9);
  });

  it("flags studies whose CIs don't overlap", () => {
    expect(studiesDisagree(f.evidence.slice(0, 2))).toBe(true);
    expect(studiesDisagree([big, acc("s2", "A", 0.78, 0.62, { sensCI: [0.7, 0.86], specCI: [0.5, 0.7] })] as never)).toBe(false);
  });
});
