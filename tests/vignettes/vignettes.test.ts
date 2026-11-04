import { describe, expect, it } from "vitest";
import { posterior, restrictToRegions, scorableHypotheses, unscorableHypotheses } from "../../src/engine/bayes";
import { loadEvidence } from "../../src/engine/db";
import { logicalFit } from "../../src/engine/logic";
import { hasDiagram } from "../../src/ui/TestDiagram";
import type { Answer, Finding, Region } from "../../src/engine/schema";
import { initialSession, reduce } from "../../src/engine/session";
import { evidenceSummary, unexplainedWeakness } from "../../src/engine/summary";
import {
  expectedInformationGain,
  isEligible,
  MIN_INFORMATION_GAIN_BITS,
  nextFinding,
  withImplied,
} from "../../src/engine/selection";

const db = loadEvidence();
const top = (regions: Region[], answers: Record<string, Answer>) => posterior(restrictToRegions(db, regions), answers);

describe("evidence database", () => {
  it("loads and passes integrity checks", () => {
    expect(scorableHypotheses(db).map((h) => h.id).sort()).toEqual(
      [
        "chest_wall",
        "cts",
        "cubital",
        "de_quervain",
        "deep_gluteal",
        "disc_pain",
        "gtps",
        "hip_oa",
        "ifi",
        "lfcn",
        "morton",
        "pfcn",
        "proximal_hamstring",
        "root_cervical",
        "root_low",
        "root_mid",
        "rotator_cuff",
        "sij",
        "stenosis",
        "tfcc",
        "thumb_cmc_oa",
        "vertebral_fracture",
      ],
    );
  });
});

describe("textbook vignettes rank the expected nerve first", () => {
  it("lumbar spinal stenosis", () => {
    const r = top(["low_back", "buttock", "calf"], {
      h_age_over_65: "yes",
      h_walking_claudication: "yes",
      h_bend_forward: "yes",
      h_no_pain_seated: "yes",
      h_bilateral: "yes",
      st_slr_helper: "no",
    });
    expect(r[0].id).toBe("stenosis");
  });

  it("L5/S1 radiculopathy", () => {
    const r = top(["buttock", "posterior_thigh", "calf", "foot_sole_lateral"], {
      h_walking_claudication: "no",
      h_bend_forward: "no",
      h_no_pain_seated: "no",
      h_bilateral: "no",
      h_age_over_65: "no",
      st_slr_helper: "yes",
      st_heel_raise: "yes",
      st_sens_lateral_foot: "yes",
      st_sit_to_stand: "no",
    });
    expect(r[0].id).toBe("root_low");
  });

  it("L2-L4 radiculopathy", () => {
    const r = top(["anterior_thigh", "shin_anterior"], {
      h_walking_claudication: "no",
      h_age_over_65: "no",
      h_bilateral: "no",
      st_slr_helper: "no",
      st_sit_to_stand: "yes",
      st_sens_medial_ankle: "yes",
    });
    expect(r[0].id).toBe("root_mid");
  });

  it("meralgia paresthetica", () => {
    const r = top(["lateral_thigh"], {
      h_walking_claudication: "no",
      h_bilateral: "no",
      st_slr_helper: "no",
      st_sit_to_stand: "no",
      st_pelvic_compression: "yes",
      st_tinel_asis: "yes",
    });
    expect(r[0].id).toBe("lfcn");
  });

  it("Morton's neuroma", () => {
    const r = top(["forefoot"], {
      h_ff_click: "yes",
      h_ff_tight_shoes: "yes",
      h_ff_im_space: "yes",
      st_slr_helper: "no",
    });
    expect(r[0].id).toBe("morton");
  });
});

describe("forefoot: the alternatives to Morton's neuroma", () => {
  it("lists the tissue and nerve alternatives, unscored", () => {
    const view = restrictToRegions(db, ["forefoot"]);
    expect(unscorableHypotheses(view).map((h) => h.id).sort()).toEqual(
      ["hallux_rigidus", "mt_stress_fracture", "plantar_plate", "tarsal_tunnel"],
    );
    expect(scorableHypotheses(view).map((h) => h.id).sort()).toEqual(["morton", "root_low", "stenosis"]);
  });

  it("gradual pain and swelling under the 2nd toe joint fit a plantar plate problem in the logical-fit view", () => {
    const fit = logicalFit(db, ["forefoot"], {
      h_ff_gradual_onset: "yes",
      h_ff_2nd_head: "yes",
      h_ff_swelling: "yes",
      h_ff_im_space: "no",
      st_ff_squeeze_self: "no",
    });
    const pp = fit.find((l) => l.id === "plantar_plate")!;
    const mn = fit.find((l) => l.id === "morton")!;
    expect(pp.fit).toBe(3);
    expect(pp.against).toBe(0);
    expect(mn.against).toBeGreaterThan(mn.fit);
  });
});

describe("front/outer thigh: prone knee bend separates L2-L4 root from meralgia", () => {
  const regions: Region[] = ["anterior_thigh", "lateral_thigh"];
  const base = { h_walking_claudication: "no", h_bilateral: "no", h_age_over_65: "no" } as const;

  it("knee bend reproduces pain, pelvic compression doesn't help -> L2-L4 root", () => {
    const r = top(regions, { ...base, st_prone_knee_bend: "yes", st_pelvic_compression: "no" });
    expect(r[0].id).toBe("root_mid");
  });

  it("knee bend negative, pelvic compression eases symptoms -> meralgia", () => {
    const r = top(regions, { ...base, st_prone_knee_bend: "no", st_pelvic_compression: "yes" });
    expect(r[0].id).toBe("lfcn");
  });
});

describe("Beatty home test (positive-only)", () => {
  const regions: Region[] = ["buttock", "posterior_thigh"];
  const base = { h_leg_worse_than_back: "yes", h_cough_sneeze: "no", st_slr_helper: "no" } as const;
  const dgs = (a: Record<string, Answer>) => top(regions, a).find((e) => e.id === "deep_gluteal")!.p;

  it("a positive result makes deep gluteal syndrome the leading explanation", () => {
    expect(top(regions, { ...base, st_beatty_home: "yes" })[0].id).toBe("deep_gluteal");
  });

  it("a negative result changes nothing", () => {
    expect(dgs({ ...base, st_beatty_home: "no" })).toBeCloseTo(dgs({ ...base }), 9);
  });
});

describe("non-nerve mimics", () => {
  it("outer hip pain, positive single-leg stance and trochanter tenderness -> gluteal tendinopathy", () => {
    const r = top(["lateral_thigh"], { st_single_leg_stance: "yes", st_trochanter_tender: "yes", st_prone_knee_bend: "no", st_pelvic_compression: "no" });
    expect(r[0].id).toBe("gtps");
  });

  it("buttock/low back pain pointed at the PSIS, worse sitting, no nerve-root features -> sacroiliac joint", () => {
    const r = top(["low_back", "buttock"], {
      st_one_finger_psis: "yes",
      h_pain_sitting_chair: "yes",
      h_leg_worse_than_back: "no",
      h_pain_below_knee: "no",
      h_walking_claudication: "no",
      h_bilateral: "no",
    });
    expect(r[0].id).toBe("sij");
  });

  it("groin and front-thigh pain, worse on stairs, squat painful, knee OA -> hip osteoarthritis", () => {
    const r = top(["groin", "anterior_thigh"], {
      h_hip_stairs: "yes",
      st_squat_posterior: "yes",
      h_knee_oa_history: "yes",
      st_prone_knee_bend: "no",
      h_leg_numbness: "no",
    });
    expect(r[0].id).toBe("hip_oa");
  });
});

describe("sitting question and deep-buttock causes", () => {
  it("always-ask questions (sitting; numbness/pins and needles for leg symptoms) come before any others", () => {
    for (const regions of [["calf"], ["lateral_thigh"], ["low_back"]] as Region[][]) {
      const core = db.findings.filter((f) => f.alwaysAsk && isEligible(f, regions)).map((f) => f.id);
      expect(core).toContain("h_pain_sitting_chair");
      const answers: Record<string, Answer> = {};
      for (let i = 0; i < core.length; i++) {
        const next = nextFinding(db, answers, regions);
        if (next.done) break;
        expect(core).toContain(next.finding.id);
        answers[next.finding.id] = "no";
      }
    }
  });

  it("long-stride walking pain with a negative Beatty test points to ischiofemoral impingement", () => {
    const r = top(["buttock", "posterior_thigh"], {
      st_long_stride_walk: "yes",
      h_leg_worse_than_back: "yes",
      st_slr_helper: "no",
      h_pain_below_knee: "no",
    });
    expect(r[0].id).toBe("ifi");
  });

  it("posterior femoral cutaneous nerve: sitting pain raises it by at most ~2x odds; 'no' leaves it level with 'other'", () => {
    const regions: Region[] = ["buttock", "posterior_thigh"];
    const get = (a: Record<string, Answer>) => Object.fromEntries(top(regions, a).map((e) => [e.id, e.p]));
    const base = get({});
    const yes = get({ h_pain_sitting_chair: "yes" });
    const no = get({ h_pain_sitting_chair: "no" });
    const oddsVsOther = (r: Record<string, number>) => r.pfcn / r.other;
    expect(oddsVsOther(yes) / oddsVsOther(base)).toBeGreaterThan(1.5);
    expect(oddsVsOther(yes) / oddsVsOther(base)).toBeLessThan(2.0);
    expect(oddsVsOther(no)).toBeCloseTo(oddsVsOther(base), 9);
  });
});

describe("evidence summary on a real case", () => {
  it("L5/S1 case: the straight-leg raise supports the root, negative stenosis answers count against stenosis", () => {
    const regions: Region[] = ["buttock", "posterior_thigh", "calf"];
    const answers: Record<string, Answer> = { st_slr_helper: "yes", h_pain_below_knee: "yes", h_walking_claudication: "no" };
    const view = restrictToRegions(db, regions);
    const root = evidenceSummary(view, answers, "root_low");
    expect(root.supporting.map((i) => i.finding.id)).toEqual(expect.arrayContaining(["st_slr_helper", "h_pain_below_knee"]));
    expect(root.supporting.every((i) => i.delta > 0)).toBe(true);
    const sten = evidenceSummary(view, answers, "stenosis");
    expect(sten.against.map((i) => i.phrase)).toContain("walking doesn't bring on leg symptoms");
  });
});

describe("posterior femoral cutaneous nerve follow-up questions", () => {
  const regions: Region[] = ["buttock", "posterior_thigh"];
  const pfcnQs = ["h_pfcn_location", "h_pfcn_avoid_sitting", "h_hamstring_injury", "st_pfcn_skin"];

  it("are asked once the nerve reaches 10%, and don't change any probability", () => {
    const answers: Record<string, Answer> = {};
    // answer the always-ask questions so that sitting pain pushes the nerve to ~19%
    for (let i = 0; i < 3; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done || !n.finding.alwaysAsk) break;
      answers[n.finding.id] = n.finding.id === "h_pain_sitting_chair" ? "yes" : "no";
    }
    const before = top(regions, answers);
    // other options' follow-ups may be interleaved; "unsure" takes them out of the queue without scoring
    const asked: string[] = [];
    for (let i = 0; i < 10 && asked.length < pfcnQs.length; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      const isPfcn = pfcnQs.includes(n.finding.id);
      if (isPfcn) asked.push(n.finding.id);
      answers[n.finding.id] = isPfcn ? "yes" : "unsure";
    }
    expect(asked.sort()).toEqual([...pfcnQs].sort());
    const after = top(regions, answers);
    for (const e of before) expect(after.find((x) => x.id === e.id)!.p).toBeCloseTo(e.p, 12);
  });

  it("are not asked when the nerve is below 10%", () => {
    const n = nextFinding(db, { h_pain_sitting_chair: "no", h_leg_numbness: "yes" }, ["calf"]);
    if (!n.done) expect(pfcnQs).not.toContain(n.finding.id);
  });
});

describe("ruling out an option by logical fit", () => {
  const interview = (first: Answer, regions: Region[] = ["elbow_lateral"]) => {
    const answers: Record<string, Answer> = { h_grip_lateral_elbow: first };
    const asked: string[] = [];
    for (let i = 0; i < 40; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      asked.push(n.finding.id);
      answers[n.finding.id] = "unsure";
    }
    return asked;
  };

  it("skips the tennis-elbow checklist questions once its usual feature is answered no", () => {
    expect(interview("no")).not.toContain("st_epicondyle_tender_self");
    expect(interview("no")).not.toContain("h_outer_elbow_main");
  });

  it("still asks them while the option is open", () => {
    expect(interview("yes")).toEqual(expect.arrayContaining(["st_epicondyle_tender_self", "h_outer_elbow_main"]));
  });

  it("keeps a question that also checks another open option", () => {
    // Resisted wrist extension is also a usual feature of intersection syndrome (forearm only).
    expect(interview("no")).not.toContain("st_resisted_wrist_ext_self");
    expect(interview("no", ["forearm_dorsal"])).toContain("st_resisted_wrist_ext_self");
  });
});

describe("checks for options without accuracy data", () => {
  const OBTURATOR = ["h_worst_medial_thigh", "h_obt_exercise", "h_obt_origin", "h_obt_radiate", "st_obt_stretch_self", "st_obt_skin_self"];
  const interview = (regions: Region[], answerFor: (id: string) => Answer) => {
    const answers: Record<string, Answer> = {};
    for (let i = 0; i < 100; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      answers[n.finding.id] = answerFor(n.finding.id);
    }
    return answers;
  };

  it("asks every obturator checklist question while the option stays in play", () => {
    const answers = interview(["medial_thigh"], (id) => (OBTURATOR.includes(id) ? "yes" : "no"));
    for (const id of OBTURATOR) expect(answers[id]).toBe("yes");
  });

  it("stops asking about the obturator nerve once more checks are against it than for it", () => {
    const answers = interview(["medial_thigh"], () => "no");
    const asked = OBTURATOR.filter((id) => id in answers);
    expect(asked.length).toBeLessThan(OBTURATOR.length);
    const fit = logicalFit(restrictToRegions(db, ["medial_thigh"]), ["medial_thigh"], withImplied(db, answers, ["medial_thigh"])).find((f) => f.id === "obturator")!;
    expect(fit.against).toBeGreaterThan(fit.fit);
  });

  it("links every checklist item for the pelvic nerves to an interview question", () => {
    for (const id of ["obturator", "pudendal", "cluneal", "ilio_genito"]) {
      for (const item of db.hypotheses.find((h) => h.id === id)!.criteria!.items) expect(item.linkedFinding).toBeDefined();
    }
  });

  it("asks the obturator nerve's inner-thigh check, so its logical fit isn't left blank", () => {
    const regions: Region[] = ["medial_thigh"];
    for (const answer of ["yes", "no"] as Answer[]) {
      const answers: Record<string, Answer> = {};
      for (let i = 0; i < 80; i++) {
        const n = nextFinding(db, answers, regions);
        if (n.done) break;
        answers[n.finding.id] = answer;
      }
      expect(answers.h_worst_medial_thigh).toBe(answer);
      const obturator = logicalFit(restrictToRegions(db, regions), regions, withImplied(db, answers, regions)).find((f) => f.id === "obturator")!;
      expect(obturator.fit + obturator.against).toBeGreaterThan(0);
    }
  });
});

describe("meralgia follow-up questions (tight clothing, pregnancy, diabetes)", () => {
  it("are asked once the lateral femoral cutaneous nerve is a contender, and never change probabilities", () => {
    const regions: Region[] = ["lateral_thigh"];
    const answers: Record<string, Answer> = { h_pain_sitting_chair: "no", st_pelvic_compression: "yes" };
    const before = top(regions, answers);
    const asked: string[] = [];
    for (let i = 0; i < 6; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      if (n.finding.followUp?.hypothesis === "lfcn") asked.push(n.finding.id);
      answers[n.finding.id] = n.finding.followUp ? "yes" : "unsure";
    }
    expect(asked.sort()).toEqual(["h_diabetes", "h_pregnancy", "h_tight_clothing"]);
    const after = top(regions, answers);
    for (const e of before) expect(after.find((x) => x.id === e.id)!.p).toBeCloseTo(e.p, 12);
  });
});

describe("surgery history", () => {
  const sub = ["h_surgery_hip_anterior", "h_surgery_hernia", "h_surgery_pelvic", "h_surgery_spine"];
  const run = (surgery: Answer) => {
    const answers: Record<string, Answer> = {};
    const asked: string[] = [];
    for (let i = 0; i < 10; i++) {
      const n = nextFinding(db, answers, ["lateral_thigh"]);
      if (n.done) break;
      asked.push(n.finding.id);
      answers[n.finding.id] = n.finding.id === "h_recent_surgery" ? surgery : "no";
    }
    return asked;
  };

  it("asks which operation straight after a 'yes', and never after a 'no'", () => {
    const yes = run("yes");
    const i = yes.indexOf("h_recent_surgery");
    expect(yes.slice(i + 1, i + 1 + sub.length).sort()).toEqual([...sub].sort());
    expect(run("no").some((id) => sub.includes(id))).toBe(false);
  });

  it("surgery answers never change probabilities", () => {
    const base = top(["lateral_thigh"], {});
    const after = top(["lateral_thigh"], { h_recent_surgery: "yes", h_surgery_hip_anterior: "yes" });
    for (const e of base) expect(after.find((x) => x.id === e.id)!.p).toBeCloseTo(e.p, 12);
  });
});

describe("sensory-only nerve rule", () => {
  it("flags weakness for the posterior femoral cutaneous and lateral femoral cutaneous nerves, not for nerve roots", () => {
    const answers: Record<string, Answer> = { st_heel_raise: "yes", st_heel_walk: "no" };
    expect(unexplainedWeakness(db, answers, "pfcn").map((f) => f.id)).toEqual(["st_heel_raise"]);
    expect(unexplainedWeakness(db, answers, "lfcn").map((f) => f.id)).toEqual(["st_heel_raise"]);
    expect(unexplainedWeakness(db, answers, "root_low")).toEqual([]);
    expect(unexplainedWeakness(db, { st_heel_raise: "no" }, "pfcn")).toEqual([]);
  });
});

describe("anatomical territory gate", () => {
  it("drops nerves whose territory the patient did not mark", () => {
    const ids = top(["calf", "foot_sole_lateral"], {}).map((e) => e.id);
    expect(ids).not.toContain("lfcn");
    expect(ids).not.toContain("root_mid");
    expect(ids).toContain("root_low");
  });

  it("perineal-only symptoms: pudendal listed as unscorable and the interview ends honestly", () => {
    const restricted = restrictToRegions(db, ["perineum"]);
    expect(unscorableHypotheses(restricted).map((h) => h.id)).toContain("pudendal");
    const next = nextFinding(db, {}, ["perineum"]);
    expect(next.done && next.reason).toMatch(/no nerve/);
  });
});

describe("upper limb vignettes rank the expected cause first", () => {
  it("cervical radiculopathy: arm squeeze, Spurling-type and shoulder abduction relief positive", () => {
    const r = top(["neck", "shoulder", "upper_arm_lateral", "forearm_lateral", "hand_median"], {
      st_arm_squeeze: "yes",
      st_spurling_self: "yes",
      st_shoulder_abduction_relief: "yes",
      st_painful_arc_self: "no",
    });
    expect(r[0].id).toBe("root_cervical");
  });

  it("rotator cuff: painful arc, arm squeeze and Spurling-type negative", () => {
    const r = top(["shoulder", "upper_arm_lateral"], {
      st_painful_arc_self: "yes",
      st_arm_squeeze: "no",
      st_spurling_self: "no",
    });
    expect(r[0].id).toBe("rotator_cuff");
  });

  it("carpal tunnel: Phalen and wrist Tinel positive, neck tests negative", () => {
    const r = top(["hand_median"], {
      st_phalen_self: "yes",
      st_tinel_wrist_self: "yes",
      st_spurling_self: "no",
      st_shoulder_abduction_relief: "no",
    });
    expect(r[0].id).toBe("cts");
  });

  it("cubital tunnel: elbow flexion-internal rotation and elbow Tinel positive, neck tests negative", () => {
    const r = top(["elbow_medial", "forearm_medial", "hand_ulnar"], {
      st_siref_self: "yes",
      st_tinel_elbow_self: "yes",
      st_spurling_self: "no",
      st_shoulder_abduction_relief: "no",
    });
    expect(r[0].id).toBe("cubital");
  });
});

describe("upper limb tendon and joint mimics", () => {
  it("shoulder impingement: Hawkins and painful arc positive, arm squeeze negative -> rotator cuff", () => {
    const r = top(["shoulder"], { st_hawkins_helper: "yes", st_painful_arc_self: "yes", st_arm_squeeze: "no" });
    expect(r[0].id).toBe("rotator_cuff");
  });

  it("thumb-side wrist pain: WHAT test positive, grind test negative -> De Quervain's", () => {
    const r = top(["hand_dorsal_radial"], { st_what_self: "yes", st_grind_helper: "no", st_spurling_self: "no" });
    expect(r[0].id).toBe("de_quervain");
  });

  it("thumb-base pain: grind test positive, WHAT test negative -> thumb-base arthritis", () => {
    const r = top(["hand_dorsal_radial"], { st_grind_helper: "yes", st_what_self: "no", st_spurling_self: "no" });
    expect(r[0].id).toBe("thumb_cmc_oa");
  });

  it("outer elbow pain on gripping, no numbness: tennis elbow leads the logical fit without a probability", () => {
    const regions: Region[] = ["elbow_lateral"];
    const answers: Record<string, Answer> = { h_arm_numbness: "no", h_grip_lateral_elbow: "yes" };
    const fits = logicalFit(restrictToRegions(db, regions), regions, answers);
    expect(fits[0].id).toBe("lateral_epicondylalgia");
    expect(fits[0].fit).toBeGreaterThan(0);
    expect(fits[0].against).toBe(0);
    expect(scorableHypotheses(restrictToRegions(db, regions)).map((h) => h.id)).not.toContain("lateral_epicondylalgia");
  });
});

describe("tissue look-alikes of nerve pain", () => {
  it("sit-bone pain: resisted knee bending positive, nerve and piriformis tests negative -> hamstring tendon", () => {
    const r = top(["buttock", "posterior_thigh"], {
      st_resisted_knee_flex: "yes",
      st_slr_helper: "no",
      st_active_piriformis: "no",
      st_seated_piriformis: "no",
      st_long_stride_walk: "no",
    });
    expect(r[0].id).toBe("proximal_hamstring");
  });

  it("back and buttock pain that centralises with press-ups, no nerve-root features -> disc pain", () => {
    const r = top(["low_back", "buttock"], {
      st_centralisation_self: "yes",
      st_slr_helper: "no",
      h_leg_worse_than_back: "no",
      st_one_finger_psis: "no",
      st_psis_tender: "no",
    });
    expect(r[0].id).toBe("disc_pain");
  });

  it("little-finger-side wrist pain with a positive fovea sign -> TFCC", () => {
    const r = top(["wrist_ulnar"], { st_fovea_self: "yes" });
    expect(r[0].id).toBe("tfcc");
  });

  it("groin pain on deep hip bending: hip impingement fits logically but isn't given a probability", () => {
    const regions: Region[] = ["groin"];
    const answers: Record<string, Answer> = { h_groin_deep_flexion: "yes", h_groin_adductor: "no", h_leg_numbness: "no" };
    const fit = logicalFit(restrictToRegions(db, regions), regions, answers).find((f) => f.id === "hip_fai")!;
    expect(fit.fit).toBe(1);
    expect(fit.against).toBe(0);
    expect(scorableHypotheses(restrictToRegions(db, regions)).map((h) => h.id)).not.toContain("hip_fai");
  });
});

describe("what eases or worsens low back pain", () => {
  const regions: Region[] = ["low_back"];
  const fitOf = (answers: Record<string, Answer>, id: string) =>
    logicalFit(restrictToRegions(db, regions), regions, answers).find((f) => f.id === id)!;

  it("eased by a warm bath, tight, easier once moving, tender spot: back muscles fit, the disc isn't counted against", () => {
    const answers: Record<string, Answer> = { p_heat_eases: "yes", p_tight: "yes", p_movement_eases: "yes", p_one_spot: "yes" };
    expect(fitOf(answers, "muscle_lbp")).toMatchObject({ fit: 4, against: 0 });
    expect(fitOf(answers, "disc_pain").against).toBe(0);
    expect(fitOf(answers, "root_low").against).toBe(0);
    expect(scorableHypotheses(restrictToRegions(db, regions)).map((h) => h.id)).not.toContain("muscle_lbp");
  });

  it("warmth not helping says nothing about the back muscles", () => {
    expect(fitOf({ p_heat_eases: "no" }, "muscle_lbp")).toMatchObject({ fit: 0, against: 0 });
  });

  it("back pain when half-bent forward raises disc pain (Tonosu 2016)", () => {
    const before = top(regions, {}).find((p) => p.id === "disc_pain")!.p;
    const after = top(regions, { h_lbp_half_bent: "yes" }).find((p) => p.id === "disc_pain")!.p;
    expect(after).toBeGreaterThan(before);
    expect(fitOf({ h_lbp_half_bent: "yes" }, "disc_pain").fit).toBe(1);
  });

  it("bending forward not making it worse fills in the half-bent question as no", () => {
    expect(withImplied(db, { p_flexion_worse: "no" }, regions).h_lbp_half_bent).toBe("no");
  });
});

describe("top-of-forearm pain from repetitive work (RSI)", () => {
  const regions: Region[] = ["forearm_dorsal"];
  const fitOf = (answers: Record<string, Answer>, id: string) =>
    logicalFit(restrictToRegions(db, regions), regions, answers).find((f) => f.id === id)!;

  it("asks the repetitive-use, creaking, grip and numbness questions", () => {
    const answers: Record<string, Answer> = {};
    for (let i = 0; i < 40; i++) {
      const next = nextFinding(db, answers, regions);
      if (next.done) break;
      answers[next.finding.id] = "no";
    }
    expect(Object.keys(answers)).toEqual(
      expect.arrayContaining(["h_repetitive_use", "h_forearm_creak", "h_grip_lateral_elbow", "h_arm_numbness"]),
    );
  });

  it("repetitive work, no creaking or numbness: work-related arm pain fits, intersection syndrome counts against", () => {
    const answers: Record<string, Answer> = { h_repetitive_use: "yes", h_forearm_creak: "no", h_arm_numbness: "no" };
    expect(fitOf(answers, "nonspecific_arm_pain")).toMatchObject({ fit: 1, against: 0 });
    expect(fitOf(answers, "intersection_syndrome").against).toBe(1);
  });

  it("creaking above the wrist: intersection syndrome fits", () => {
    expect(fitOf({ h_forearm_creak: "yes", h_arm_numbness: "no" }, "intersection_syndrome")).toMatchObject({ fit: 1, against: 0 });
  });
});

describe("tennis elbow from cited reasoning and criteria", () => {
  it("outer elbow pain, tender bone, painful resisted wrist lift, grip pain, no numbness -> tennis elbow leads the logical fit", () => {
    const regions: Region[] = ["elbow_lateral", "forearm_dorsal"];
    const answers: Record<string, Answer> = {
      h_outer_elbow_main: "yes",
      st_epicondyle_tender_self: "yes",
      st_resisted_wrist_ext_self: "yes",
      h_grip_lateral_elbow: "yes",
      h_arm_numbness: "no",
      h_forearm_creak: "no",
      h_repetitive_use: "no",
    };
    const fits = logicalFit(restrictToRegions(db, regions), regions, answers);
    expect(fits[0].id).toBe("lateral_epicondylalgia");
    expect(fits[0]).toMatchObject({ fit: 4, against: 0 });
  });
});

describe("evidence-tier sweep: cited checks and criteria", () => {
  const fit = (regions: Region[], answers: Record<string, Answer>, id: string) =>
    logicalFit(restrictToRegions(db, regions), regions, answers).find((f) => f.id === id)!;

  it("adductor tenderness and painful resisted squeeze match both Doha criteria", () => {
    const f = fit(["groin", "medial_thigh"], { st_adductor_tender_self: "yes", st_adductor_squeeze_self: "yes", h_groin_adductor: "yes" }, "adductor_groin");
    expect(f).toMatchObject({ fit: 3, against: 0 });
  });

  it("sudden severe onset and shoulder-blade winging fit neuralgic amyotrophy", () => {
    const f = fit(["shoulder", "scapula"], { h_sudden_severe_arm_pain: "yes", h_scapula_winging: "yes" }, "neuralgic_amyotrophy");
    expect(f).toMatchObject({ fit: 2, against: 0 });
  });

  it("no numbness doesn't count against Guyon's canal (compression there can be purely motor)", () => {
    expect(fit(["hand_ulnar"], { h_arm_numbness: "no" }, "guyon").against).toBe(0);
  });
});

describe("self-test diagrams", () => {
  it("every self-test has a diagram", () => {
    const missing = db.findings.filter((f) => f.kind === "selftest" && !hasDiagram(f.id)).map((f) => f.id);
    expect(missing).toEqual([]);
  });
});

describe("stopping rule", () => {
  it("one positive test can't end the interview; it continues until two findings support the leader", () => {
    const regions: Region[] = ["shoulder"];
    const answers: Record<string, Answer> = {};
    const asked: string[] = [];
    for (let i = 0; i < 40; i++) {
      const next = nextFinding(db, answers, regions);
      if (next.done) break;
      asked.push(next.finding.id);
      answers[next.finding.id] = next.finding.id === "st_arm_squeeze" ? "yes" : "no";
    }
    expect(asked).toContain("st_arm_squeeze");
    expect(asked.indexOf("st_arm_squeeze")).toBeLessThan(asked.length - 1);
  });
});

describe("upper limb territory", () => {
  const arm: Region[] = ["elbow_medial", "hand_ulnar"];

  it("arm-only regions exclude every lower-limb option and list the unscored arm nerves", () => {
    const restricted = restrictToRegions(db, arm);
    const ids = restricted.hypotheses.map((h) => h.id);
    expect(ids).not.toContain("root_low");
    expect(ids).not.toContain("stenosis");
    expect(scorableHypotheses(restricted).map((h) => h.id).sort()).toEqual(["cubital", "root_cervical"]);
    expect(unscorableHypotheses(restricted).map((h) => h.id)).toEqual(expect.arrayContaining(["guyon", "tos"]));
  });

  it("never asks a lower-limb question when only arm regions are marked, and terminates", () => {
    let s = reduce(db, initialSession, { type: "start" });
    s = reduce(db, s, { type: "regions", regions: arm });
    const asked: string[] = [];
    for (let i = 0; i < 40 && s.phase === "interview"; i++) {
      const next = nextFinding(db, s.answers, s.regions);
      if (next.done) break;
      asked.push(next.finding.id);
      s = reduce(db, s, { type: "answer", id: next.finding.id, answer: "no" });
    }
    expect(s.phase).toBe("results");
    expect(asked.length).toBeGreaterThan(0);
    for (const id of asked) expect(isEligible(db.findings.find((f) => f.id === id)!, arm)).toBe(true);
    expect(asked).not.toContain("h_pain_sitting_chair");
    expect(asked).not.toContain("h_recent_surgery");
  });
});

describe("chest and upper back", () => {
  const fit = (regions: Region[], answers: Record<string, Answer>, id: string) =>
    logicalFit(restrictToRegions(db, regions), regions, answers).find((f) => f.id === id)!;

  it("chest regions bring in only trunk options, and no leg or arm question is asked", () => {
    const chest: Region[] = ["chest_front", "chest_side"];
    const ids = restrictToRegions(db, chest).hypotheses.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(["chest_wall", "root_thoracic", "intercostal", "zoster", "slipping_rib", "sc_joint"]));
    expect(ids).not.toContain("root_low");
    expect(ids).not.toContain("cts");
    let s = reduce(db, initialSession, { type: "start" });
    s = reduce(db, s, { type: "regions", regions: chest });
    const asked: string[] = [];
    for (let i = 0; i < 40 && s.phase === "interview"; i++) {
      const next = nextFinding(db, s.answers, s.regions);
      if (next.done) break;
      asked.push(next.finding.id);
      s = reduce(db, s, { type: "answer", id: next.finding.id, answer: "no" });
    }
    expect(s.phase).toBe("results");
    for (const id of asked) expect(isEligible(db.findings.find((f) => f.id === id)!, chest)).toBe(true);
  });

  it("tender, movement-related stabbing chest pain without cough ranks chest wall pain first", () => {
    const r = top(["chest_front"], {
      st_chest_press_self: "yes",
      h_chest_movement: "yes",
      h_chest_stinging: "yes",
      h_cough_now: "no",
      h_known_heart_disease: "no",
    });
    expect(r[0].id).toBe("chest_wall");
  });

  it("a sudden severe start that stops daily activity favours a compression fracture in the upper back", () => {
    const r = top(["upper_back"], { h_back_sudden_onset: "yes", h_back_limits_activity: "yes" });
    expect(r[0].id).toBe("vertebral_fracture");
  });

  it("a one-sided band with a blistering rash fits shingles in the logic view", () => {
    expect(fit(["chest_side"], { h_trunk_band: "yes", h_band_rash: "yes" }, "zoster")).toMatchObject({ fit: 2, against: 0 });
  });

  it("an itchy patch beside the shoulder blade fits notalgia paresthetica", () => {
    expect(fit(["upper_back"], { h_back_itch: "yes" }, "notalgia")).toMatchObject({ fit: 1, against: 0 });
  });
});

describe("interview", () => {
  it("only picks a self-test when no history question is informative, and terminates", () => {
    let s = reduce(db, initialSession, { type: "start" });
    s = reduce(db, s, { type: "regions", regions: ["buttock", "posterior_thigh", "calf"] });
    const view = restrictToRegions(db, s.regions);
    for (let i = 0; i < 40 && s.phase === "interview"; i++) {
      const next = nextFinding(db, s.answers, s.regions);
      if (next.done) break;
      expect(next.finding.id in withImplied(db, s.answers, s.regions)).toBe(false);
      if (next.finding.kind === "selftest" && !next.finding.followUp && !next.finding.alwaysAsk) {
        const known = withImplied(db, s.answers, s.regions);
        const openHistory = db.findings.filter(
          (f) => f.kind === "history" && !(f.id in known) && isEligible(f, s.regions),
        );
        for (const f of openHistory) {
          expect(expectedInformationGain(view, known, f)).toBeLessThan(MIN_INFORMATION_GAIN_BITS);
        }
      }
      s = reduce(db, s, { type: "answer", id: next.finding.id, answer: "no" });
    }
    expect(s.phase).toBe("results");
  });

  it("does not ask a question whose answer follows from an earlier one", () => {
    const regions: Region[] = ["buttock", "posterior_thigh"];
    const answers: Record<string, Answer> = { h_pain_sitting_chair: "yes", h_leg_numbness: "no" };
    expect(withImplied(db, answers, regions)).toMatchObject({
      h_no_pain_seated: "no",
      h_bilateral_sole_numbness: "no",
      h_leg_tingling: "no",
    });
    let s = reduce(db, initialSession, { type: "start" });
    s = reduce(db, s, { type: "regions", regions });
    const asked: string[] = [];
    for (let i = 0; i < 40 && s.phase === "interview"; i++) {
      const next = nextFinding(db, s.answers, s.regions);
      if (next.done) break;
      asked.push(next.finding.id);
      s = reduce(db, s, { type: "answer", id: next.finding.id, answer: next.finding.id in answers ? answers[next.finding.id] : "no" });
    }
    expect(asked).toContain("h_pain_sitting_chair");
    expect(asked).not.toContain("h_no_pain_seated");
    expect(asked).not.toContain("h_bilateral_sole_numbness");
    expect(asked).not.toContain("h_leg_tingling");
  });
});

describe("pain description", () => {
  const regions: Region[] = ["buttock", "posterior_thigh", "calf"];

  const run = (answer: Answer) => {
    let s = reduce(db, initialSession, { type: "start" });
    s = reduce(db, s, { type: "regions", regions });
    const asked: Finding[] = [];
    for (let i = 0; i < 80 && s.phase === "interview"; i++) {
      const next = nextFinding(db, s.answers, s.regions);
      if (next.done) break;
      asked.push(next.finding);
      s = reduce(db, s, { type: "answer", id: next.finding.id, answer });
    }
    return asked;
  };

  it("has no page of its own: the body map leads straight into the interview, and back returns to it", () => {
    let s = reduce(db, initialSession, { type: "start" });
    s = reduce(db, s, { type: "regions", regions });
    expect(s.phase).toBe("interview");
    const first = nextFinding(db, s.answers, s.regions);
    if (first.done) throw new Error("expected a question");
    s = reduce(db, s, { type: "answer", id: first.finding.id, answer: "no" });
    s = reduce(db, s, { type: "back" });
    expect(reduce(db, s, { type: "back" }).phase).toBe("regions");
  });

  it("is asked only after the scored questions, and only some of it", () => {
    for (const answer of ["no", "unsure"] as Answer[]) {
      const kinds = run(answer).map((f) => f.kind);
      const first = kinds.indexOf("profile");
      expect(first).toBeGreaterThan(0);
      expect(kinds.slice(first).every((k) => k === "profile")).toBe(true);
      const eligible = db.findings.filter((f) => f.kind === "profile" && isEligible(f, regions)).length;
      expect(kinds.length - first).toBeLessThan(eligible);
    }
  });

  it("never changes a probability on its own", () => {
    const profile = Object.fromEntries(db.findings.filter((f) => f.kind === "profile").map((f) => [f.id, "yes" as Answer]));
    expect(top(regions, profile)).toEqual(top(regions, {}));
  });

  it("a 'no' skips the matching leg question", () => {
    expect(withImplied(db, { p_burning: "no", p_shooting: "no", p_tingling: "no" }, regions)).toMatchObject({
      h_leg_burning: "no",
      h_leg_shooting: "no",
      h_leg_tingling: "no",
      h_buttock_burning_walking: "no",
    });
  });

  it("doesn't use up the interview's question budget", () => {
    const profile = Object.fromEntries(db.findings.filter((f) => f.kind === "profile").map((f) => [f.id, "unsure" as Answer]));
    expect(nextFinding(db, profile, regions).done).toBe(false);
  });

  it("every option is linked to at least one kind of stress", () => {
    const linked = new Set(db.stress.flatMap((t) => t.conditions.map((c) => c.hypothesis)));
    expect(db.hypotheses.filter((h) => !linked.has(h.id)).map((h) => h.id)).toEqual([]);
  });
});

describe("stress view citations", () => {
  it("the sources cited directly in the stress section exist", () => {
    // Results.tsx cites these by id in the section's caveats.
    for (const id of ["scholz2009", "forster2013"]) expect(db.sources.some((s) => s.id === id)).toBe(true);
  });
});
