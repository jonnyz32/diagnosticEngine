import { EvidenceDbSchema, type EvidenceDb } from "../../src/engine/schema";

// Synthetic database for testing the math only. Not clinical data.
const src = (id: string) => ({
  id,
  citation: `Synthetic test source ${id}`,
  pmid: "1",
  design: "synthetic",
  population: "synthetic",
  verifiedOn: "2026-11-01",
});
const acc = (hypothesis: string, sens: number, spec: number, extra = {}) => ({
  hypothesis,
  sens,
  spec,
  sourceId: "s1",
  locator: "Table 1",
  performedBy: "patient" as const,
  adapted: false,
  population: "synthetic",
  ...extra,
});

export const fixture: EvidenceDb = EvidenceDbSchema.parse({
  sources: [src("s1")],
  hypotheses: [
    { id: "A", name: "A", shortName: "A", description: "a", regions: ["buttock"], prior: { value: 0.3, sourceId: "s1", locator: "page 1" } },
    { id: "B", name: "B", shortName: "B", description: "b", regions: ["calf"], prior: { value: 0.2, sourceId: "s1", locator: "page 1" } },
    { id: "C", name: "C", shortName: "C", description: "c", regions: ["groin"], prior: null },
    {
      id: "D",
      name: "D",
      shortName: "D",
      description: "no data",
      regions: ["groin"],
      prior: null,
      logic: [
        { finding: "f5", type: "unexplained", reason: "synthetic note" },
        { finding: "f3", type: "usual", reason: "synthetic reasoning" },
      ],
    },
  ],
  findings: [
    { id: "f1", kind: "history", prompt: "f1?", dependenceGroup: "g", evidence: [acc("A", 0.8, 0.9, { sensCI: [0.7, 0.9], specCI: [0.85, 0.95] })] },
    { id: "f2", kind: "history", prompt: "f2?", dependenceGroup: "g", evidence: [acc("A", 0.6, 0.7)] },
    { id: "f3", kind: "history", prompt: "f3?", evidence: [acc("A", 0.5, 0.5)] },
    { id: "f4", kind: "selftest", prompt: "f4?", gateRegions: ["calf"], evidence: [acc("B", 0.9, 0.95)] },
    { id: "f5", kind: "history", prompt: "f5?", evidence: [acc("C", 0.7, 0.8)] },
    { id: "f6", kind: "selftest", prompt: "f6?", scoreOn: "positive", gateRegions: ["groin"], evidence: [acc("C", 0.9, 0.9)] },
    {
      id: "f7",
      kind: "history",
      prompt: "f7?",
      gateRegions: ["groin"],
      evidence: [
        acc("A", 0.6, 0.7),
        acc("C", 1.0, 0.5, { specFrom: { sourceId: "s1", locator: "page 2" }, scoreOn: "positive" }),
      ],
    },
  ],
  redFlags: [{ id: "rf1", prompt: "saddle?", urgency: "emergency", message: "go", sourceId: "s1", locator: "page 1" }],
  confirmatory: [],
});
