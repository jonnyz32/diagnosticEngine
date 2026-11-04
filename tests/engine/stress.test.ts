import { describe, expect, it } from "vitest";
import { StressTypeSchema } from "../../src/engine/schema";
import { stressesFor, stressPatterns } from "../../src/engine/stress";
import { fixture } from "./fixture";

// Synthetic stress types over the fixture's findings. Not clinical data.
const db = {
  ...fixture,
  stress: [
    StressTypeSchema.parse({
      id: "S1",
      name: "S1",
      description: "s1",
      clues: [
        { anyOf: ["f1", "f2"], answer: "yes", type: "usual", reason: "synthetic" },
        { anyOf: ["f3"], answer: "yes", type: "supports", reason: "synthetic" },
      ],
      conditions: [{ hypothesis: "A", reason: "synthetic" }],
    }),
    StressTypeSchema.parse({
      id: "S2",
      name: "S2",
      description: "s2",
      clues: [{ anyOf: ["f5"], answer: "no", type: "supports", reason: "synthetic" }],
      conditions: [{ hypothesis: "A" }, { hypothesis: "C" }],
    }),
  ],
};
const of = (answers: Parameters<typeof stressPatterns>[1], id: string) => stressPatterns(db, answers).find((p) => p.type.id === id)!;

describe("type of stress", () => {
  it("a clue over several findings fits when any of them is yes", () => {
    expect(of({ f1: "no", f2: "yes" }, "S1").checks[0].verdict).toBe("fit");
  });

  it("only a usual clue counts against when answered the other way", () => {
    expect(of({ f1: "no", f3: "no" }, "S1")).toMatchObject({ fit: 0, against: 1, matches: false });
    expect(of({ f5: "yes" }, "S2")).toMatchObject({ fit: 0, against: 0 });
  });

  it("doesn't match on supporting clues while the defining (usual) clue is unanswered", () => {
    expect(of({ f3: "yes" }, "S1")).toMatchObject({ fit: 1, matches: false });
    expect(of({ f3: "yes", f1: "yes" }, "S1").matches).toBe(true);
  });

  it("unsure and unanswered clues stay unknown", () => {
    expect(of({ f1: "unsure" }, "S1")).toMatchObject({ fit: 0, against: 0, unknown: 2 });
  });

  it("ranks the matching patterns first", () => {
    expect(stressPatterns(db, { f5: "no" }).map((p) => p.type.id)).toEqual(["S2", "S1"]);
  });

  it("lists the stresses linked to a condition", () => {
    expect(stressesFor(db, "A").map((s) => s.type.id)).toEqual(["S1", "S2"]);
    expect(stressesFor(db, "B")).toEqual([]);
  });
});
