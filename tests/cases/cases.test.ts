import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadEvidence } from "../../src/engine/db";
import { CaseSchema, checkCases, evaluateCase, splitOf, summarise } from "../../src/engine/evaluate";

// Published case reports as tests. Only the dev split is evaluated here; holdout cases are
// scored only in aggregate by `npm run eval-cases` (see cases/README.md).
const db = loadEvidence();
const cases = z.array(CaseSchema).parse(JSON.parse(readFileSync("cases/cases.json", "utf8")));
const baseline = JSON.parse(readFileSync("cases/baseline.json", "utf8")).dev;
const dev = cases.filter((c) => splitOf(c.pmid) === "dev");

describe("case reports", () => {
  it("every case refers to real findings and diagnoses, and none is an evidence source", () => {
    expect(checkCases(db, cases)).toEqual([]);
  });

  it("the split is fixed by the PMID and holds out roughly a third", () => {
    expect(splitOf("42793488")).toBe(splitOf("42793488"));
    const share = cases.filter((c) => splitOf(c.pmid) === "holdout").length / cases.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.5);
  });

  it("dev accuracy doesn't fall below the recorded baseline", () => {
    const s = summarise(db, dev, dev.map((c) => evaluateCase(db, c)));
    expect(s.top1All).toBeGreaterThanOrEqual(baseline.top1All);
    expect(s.top3All).toBeGreaterThanOrEqual(baseline.top3All);
    expect(s.top3Interview).toBeGreaterThanOrEqual(baseline.top3Interview);
    expect(s.logicTop3).toBeGreaterThanOrEqual(baseline.logicTop3);
    expect(s.outOfTerritory).toBeLessThanOrEqual(baseline.outOfTerritory);
  });
});
