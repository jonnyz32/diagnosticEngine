import { z } from "zod";

// Every number in the evidence database must be traceable to a Source.
// Values are entered exactly as reported in the paper; `locator` says where.

export const SourceSchema = z
  .object({
    id: z.string().min(1),
    citation: z.string().min(10),
    pmid: z.string().regex(/^\d+$/).optional(),
    doi: z.string().regex(/^10\.\S+\/\S+$/).optional(),
    design: z.string().min(3),
    population: z.string().min(3),
    referenceStandard: z.string().optional(),
    notes: z.string().optional(),
    // A doctoral thesis without a PMID or DOI, cited by its university repository record (user
    // decision, 2026-11-04). Not peer-reviewed: the validator warns and the UI labels it.
    thesis: z.object({ institution: z.string().min(3), url: z.string().url() }).optional(),
    verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((s) => s.pmid || s.doi || s.thesis, { message: "source needs a PMID, a DOI or (for a thesis) a repository URL" });
export type Source = z.infer<typeof SourceSchema>;

const Prob = z.number().min(0).max(1);
const CI = z.tuple([Prob, Prob]);

export const RegionSchema = z.enum([
  "low_back",
  "buttock",
  "posterior_thigh",
  "anterior_thigh",
  "lateral_thigh",
  "medial_thigh",
  "groin",
  "perineum",
  // The knee, split by side (added 2026-11-04; before that the front of the knee was part of shin_anterior).
  "knee_front",
  "knee_medial",
  "knee_lateral",
  "knee_back",
  "shin_anterior",
  "calf",
  // Ankle and heel (added 2026-11-04; before that the heel was part of foot_sole_lateral).
  "ankle_lateral",
  "ankle_medial",
  "achilles",
  "heel",
  "foot_dorsum",
  "foot_sole_lateral",
  // Ball of the foot and the gaps between the toes.
  "forefoot",
  // Front and side of the belly (added 2026-11-04).
  "abdomen",
  // Head, face and jaw (added 2026-11-04).
  "head_back",
  "temple",
  "face",
  "jaw",
  // Upper limb (either side).
  "neck",
  "scapula",
  "shoulder",
  "upper_arm_lateral",
  "upper_arm_medial",
  "elbow_lateral",
  "elbow_medial",
  "forearm_lateral",
  "forearm_medial",
  "forearm_anterior",
  "forearm_dorsal",
  "wrist_radial",
  "wrist_ulnar",
  "hand_median",
  "hand_ulnar",
  "hand_dorsal_radial",
  // Chest and upper back (either side).
  "chest_front",
  "chest_side",
  "upper_back",
  "mid_back",
]);
export type Region = z.infer<typeof RegionSchema>;

export const PriorSchema = z.object({
  value: Prob,
  sourceId: z.string(),
  locator: z.string().min(3),
  note: z.string().optional(),
});

export const HypothesisSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  description: z.string(),
  // "mimic" = a common non-nerve cause of the same symptoms, modelled so it doesn't hide in "other".
  category: z.enum(["nerve", "mimic"]).default("nerve"),
  regions: z.array(RegionSchema).min(1),
  // null = no cited prevalence; engine splits leftover mass and flags it.
  prior: PriorSchema.nullable(),
  // Cited background facts shown to the patient; never used in scoring.
  context: z.array(z.object({ text: z.string(), sourceId: z.string(), locator: z.string().min(3) })).default([]),
  // How the nerve is compressed or irritated (or, for mimics, what the pain comes from). Display only.
  mechanism: z.object({ text: z.string(), sourceId: z.string(), locator: z.string().min(3) }).optional(),
  // A purely sensory nerve cannot cause weakness: if a motor finding is positive, the results say so
  // (an anatomical rule shown as a note, never converted into a probability).
  sensoryOnly: z.object({ sourceId: z.string(), locator: z.string().min(3) }).optional(),
  // Cited context shown when the patient gave a particular answer (e.g. a recent operation known
  // to injure this nerve). Display only: incidence after surgery is not a likelihood ratio.
  contextFlags: z
    .array(
      z.object({
        finding: z.string(),
        answer: z.enum(["yes", "no"]),
        text: z.string(),
        sourceId: z.string(),
        locator: z.string().min(3),
      }),
    )
    .default([]),
  // Published diagnostic criteria the patient can check against. Shown as a match count, never scored.
  criteria: z
    .object({
      title: z.string(),
      sourceId: z.string(),
      locator: z.string().min(3),
      items: z
        .array(
          z.object({
            id: z.string(),
            prompt: z.string(),
            matchIf: z.enum(["yes", "no"]),
            // Pre-filled from the answer to this scored finding, when the patient gave one.
            linkedFinding: z.string().optional(),
            // Item-level citation when it comes from a different source than the checklist as a whole.
            sourceId: z.string().optional(),
            locator: z.string().optional(),
            // A prerequisite: the checklist can't be met without it, and on its own it counts for
            // nothing in the best guess (PMR's "aged 50 or older").
            required: z.boolean().optional(),
            // Its points, for a `points` rule.
            points: z.number().int().positive().optional(),
          }),
        )
        .min(1),
      clinicianOnly: z.array(z.string()).default([]),
      // How the source says the checklist is met, taken from the cited source (verdict.ts and
      // logic.ts `checklistResult`; display and best guess only, never a probability). Absent: a
      // pattern or list of risk factors with no rule, so an unmet item says nothing.
      // `atLeast.of`: the item ids the count is over (default: all). `points.clinicianPoints`:
      // points only a clinician can add (e.g. blood tests), so the checklist stays open for them.
      rule: z
        .discriminatedUnion("type", [
          z.object({ type: z.literal("all") }),
          z.object({ type: z.literal("any") }),
          z.object({ type: z.literal("atLeast"), n: z.number().int().positive(), of: z.array(z.string()).optional() }),
          z.object({ type: z.literal("points"), threshold: z.number().int().positive(), clinicianPoints: z.number().int().nonnegative().default(0) }),
        ])
        .optional(),
    })
    .optional(),
  // Reasoning for the logical-fit view (src/engine/logic.ts), which sits beside the
  // probability and never feeds it. Unlike every other clinical field, a source is optional:
  // an uncited item is clinical reasoning and the UI labels it so. Only for findings without
  // accuracy data or a criteria link for this hypothesis (those already give a direction).
  // "usual": the condition usually produces a "yes", so "yes" fits and "no" counts against.
  // "supports": the condition's mechanism explains a "yes" (e.g. warmth easing tight muscle), so
  // "yes" fits; a "no" says nothing, because the same relief or trigger occurs in other conditions.
  // "unexplained": the condition can't produce a "yes"; shown as a note, never counted against
  // it, because another problem may be the cause.
  logic: z
    .array(
      z
        .object({
          finding: z.string(),
          type: z.enum(["usual", "supports", "unexplained"]),
          reason: z.string().min(3),
          sourceId: z.string().optional(),
          locator: z.string().min(3).optional(),
        })
        .refine((l) => !l.sourceId === !l.locator, { message: "logic item needs both sourceId and locator, or neither" }),
    )
    .default([]),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

// Accuracy of one finding for one target hypothesis (target vs. not-target).
// Either sens/spec or LR+/LR- must be given as reported by the source.
export const AccuracySchema = z
  .object({
    hypothesis: z.string(),
    sens: Prob.optional(),
    spec: Prob.optional(),
    sensCI: CI.optional(),
    specCI: CI.optional(),
    lrPos: z.number().positive().optional(),
    lrNeg: z.number().positive().optional(),
    sourceId: z.string(),
    locator: z.string().min(3),
    performedBy: z.enum(["patient", "clinician"]),
    // true when the patient does a self/helper version of a clinician-studied test
    adapted: z.boolean(),
    population: z.string(),
    // Cross-study, low-certainty entry: sens comes from `sourceId` (cases only) and the
    // comparison rate (spec) is borrowed from a different study's patients without the condition.
    specFrom: z.object({ sourceId: z.string(), locator: z.string().min(3) }).optional(),
    // "positive": a "no" answer doesn't count for this hypothesis (it is treated like any
    // condition without data for this finding).
    scoreOn: z.enum(["both", "positive"]).optional(),
  })
  .refine((a) => (a.sens !== undefined && a.spec !== undefined) || (a.lrPos !== undefined && a.lrNeg !== undefined), {
    message: "need sens+spec or lrPos+lrNeg",
  })
  .refine((a) => !a.sensCI || a.sens === undefined || (a.sensCI[0] <= a.sens && a.sens <= a.sensCI[1]), {
    message: "sensCI must contain sens",
  })
  .refine((a) => !a.specCI || a.spec === undefined || (a.specCI[0] <= a.spec && a.spec <= a.specCI[1]), {
    message: "specCI must contain spec",
  });
export type Accuracy = z.infer<typeof AccuracySchema>;

export const FindingSchema = z.object({
  id: z.string(),
  // "profile": describes the pain (feel, pattern, what eases it). Asked only after the scored
  // questions, when it can tell the remaining options apart (selection.ts `nextAfterScored`),
  // and not counted toward the question budget.
  kind: z.enum(["history", "selftest", "profile"]),
  // Which kind of description a profile question is (shown as its heading). "behaviour": what
  // eases or worsens it (warmth, movement, lying down, bending).
  profileGroup: z.enum(["sensation", "pattern", "behaviour"]).optional(),
  prompt: z.string(),
  // Short plain-language phrases for the evidence summary, per answer.
  summary: z.object({ yes: z.string(), no: z.string() }).optional(),
  help: z.string().optional(),
  instructions: z.array(z.string()).optional(),
  safety: z.string().optional(),
  needsHelper: z.boolean().default(false),
  // Only asked when the patient marked at least one of these regions (empty = always eligible).
  gateRegions: z.array(RegionSchema).default([]),
  // Findings in the same group measure the same thing; only the strongest LR applies.
  dependenceGroup: z.string().optional(),
  // "positive": a "no" answer is ignored like "unsure". Used when only the sensitivity is
  // unreliable (e.g. likely incorporation bias), so a negative result can't rule anything out.
  scoreOn: z.enum(["both", "positive"]).default("both"),
  // Eligible whenever its regions are marked. It no longer jumps the queue: like every question it
  // is asked when it eliminates the most possibilities. One that feeds nothing scored or checked
  // (context for the clinician summary, e.g. recent surgery) is asked at the end.
  alwaysAsk: z.boolean().default(false),
  // A positive answer means muscle weakness (used by the sensory-only nerve rule).
  motor: z.boolean().default(false),
  // Eligible only once this hypothesis reaches `minP` (a gate, not a place in the queue).
  followUp: z.object({ hypothesis: z.string(), minP: z.number().min(0).max(1) }).optional(),
  // Eligible only after another finding received this answer. A context-only one ("which
  // operation?") is asked straight after it; others compete by possibilities eliminated.
  askIf: z.object({ finding: z.string(), answer: z.enum(["yes", "no"]) }).optional(),
  // Logical implications only (not clinical associations): when `finding` got `answer`, this
  // question's answer is already known to be `implies`, so it is filled in instead of asked.
  impliedBy: z
    .array(z.object({ finding: z.string(), answer: z.enum(["yes", "no"]), implies: z.enum(["yes", "no"]) }))
    .default([]),
  // Answered from the body map instead of asked: when any of these regions is marked, the answer
  // is `implies` (e.g. "symptoms higher up than the foot?" is yes once the calf is marked).
  impliedByRegions: z.object({ regions: z.array(RegionSchema).min(1), implies: z.enum(["yes", "no"]) }).optional(),
  // Empty evidence = information-only: the answer feeds checklists, the logical fit and the
  // clinician summary but never changes a probability. Such a finding must be a followUp, askIf,
  // alwaysAsk or profile question, or a check that a criteria or logic item links to (db.ts).
  evidence: z.array(AccuracySchema).default([]),
})
  .refine((f) => (f.kind === "profile") === (f.profileGroup !== undefined), {
    message: "profileGroup is required on profile questions and only allowed there",
  });
export type Finding = z.infer<typeof FindingSchema>;

// A kind of stress on a nerve (compression, stretch, reduced blood supply...), or tissue overload
// where the nerve only carries the pain. Display only (src/engine/stress.ts): like `logic`, the
// clues and condition links may be uncited clinical reasoning, are labelled so, never carry a
// number and never feed a probability.
const CitedOptional = {
  sourceId: z.string().optional(),
  locator: z.string().min(3).optional(),
};
const bothOrNeither = (x: { sourceId?: string; locator?: string }) => !x.sourceId === !x.locator;

export const StressTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // Answers that fit this stress. The clue's answer is "yes" if any listed finding was answered
  // "yes", "no" if none was and at least one was answered "no".
  // "usual": this stress usually produces the clue, so the opposite answer counts against it.
  // "supports": the clue fits when present; its absence says nothing.
  clues: z
    .array(
      z
        .object({
          anyOf: z.array(z.string()).min(1),
          answer: z.enum(["yes", "no"]),
          type: z.enum(["usual", "supports"]),
          reason: z.string().min(3),
          ...CitedOptional,
        })
        .refine(bothOrNeither, { message: "clue needs both sourceId and locator, or neither" }),
    )
    .min(1),
  // Conditions in which this stress usually acts.
  conditions: z
    .array(
      z
        .object({ hypothesis: z.string(), reason: z.string().min(3).optional(), ...CitedOptional })
        .refine(bothOrNeither, { message: "condition needs both sourceId and locator, or neither" }),
    )
    .default([]),
});
export type StressType = z.infer<typeof StressTypeSchema>;

export const RedFlagSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  urgency: z.enum(["emergency", "urgent"]),
  message: z.string(),
  sourceId: z.string(),
  locator: z.string(),
});
export type RedFlag = z.infer<typeof RedFlagSchema>;

export const ConfirmatoryAccuracySchema = z.object({
  sens: Prob.optional(),
  spec: Prob.optional(),
  sensCI: CI.optional(),
  specCI: CI.optional(),
  sourceId: z.string(),
  locator: z.string(),
  population: z.string(),
});

export const ConfirmatoryTestSchema = z.object({
  id: z.string(),
  name: z.string(),
  hypotheses: z.array(z.string()).min(1),
  description: z.string(),
  // Where the recommendation to use this test comes from.
  recommendation: z.object({ sourceId: z.string(), locator: z.string() }),
  accuracy: z.array(ConfirmatoryAccuracySchema).default([]),
});
export type ConfirmatoryTest = z.infer<typeof ConfirmatoryTestSchema>;

export const EvidenceDbSchema = z.object({
  sources: z.array(SourceSchema),
  hypotheses: z.array(HypothesisSchema),
  findings: z.array(FindingSchema),
  redFlags: z.array(RedFlagSchema),
  confirmatory: z.array(ConfirmatoryTestSchema),
  stress: z.array(StressTypeSchema).default([]),
});
export type EvidenceDb = z.infer<typeof EvidenceDbSchema>;

export type Answer = "yes" | "no" | "unsure";
