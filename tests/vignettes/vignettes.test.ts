import { describe, expect, it } from "vitest";
import { posterior, restrictToRegions, scorableHypotheses, unscorableHypotheses } from "../../src/engine/bayes";
import { loadEvidence } from "../../src/engine/db";
import { logicalFit } from "../../src/engine/logic";
import { hasDiagram } from "../../src/ui/TestDiagram";
import type { Answer, Finding, Region } from "../../src/engine/schema";
import { initialSession, reduce } from "../../src/engine/session";
import { evidenceSummary, unexplainedWeakness } from "../../src/engine/summary";
import { bestGuess } from "../../src/engine/verdict";
import { sensitisedLayer } from "../../src/ui/SensitisationNote";
import {
  expectedEliminated,
  FROM_BODY_MAP,
  impliedAnswers,
  isEligible,
  isRuledOut,
  MIN_INFORMATION_GAIN_BITS,
  nextFinding,
  ruledOutOptions,
  withImplied,
} from "../../src/engine/selection";

const db = loadEvidence();
const top = (regions: Region[], answers: Record<string, Answer>) => posterior(restrictToRegions(db, regions), answers);

describe("evidence database", () => {
  it("loads and passes integrity checks", () => {
    expect(scorableHypotheses(db).map((h) => h.id).sort()).toEqual(
      [
        "ac_joint",
        "achilles_rupture",
        "acl",
        "acnes",
        "ankle_fracture",
        "cervicogenic_headache",
        "chest_wall",
        "cts",
        "cubital",
        "de_quervain",
        "deep_gluteal",
        "disc_pain",
        "frozen_shoulder",
        "gtps",
        "hip_oa",
        "ifi",
        "lfcn",
        "meniscus",
        "morton",
        "pad",
        "pfcn",
        "pfp",
        "plantar_fasciitis",
        "proximal_hamstring",
        "root_cervical",
        "root_low",
        "root_mid",
        "rotator_cuff",
        "sij",
        "stenosis",
        "tfcc",
        "thumb_cmc_oa",
        "tibial_stress_fracture",
        "tmd",
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
      ["crps", "gout", "hallux_rigidus", "hallux_valgus", "inflammatory_arthritis", "mt_stress_fracture", "nociplastic", "plantar_plate", "polyneuropathy", "reactive_arthritis", "septic_arthritis", "sesamoiditis", "tarsal_tunnel", "turf_toe"],
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
  it("the first question is the one expected to eliminate the most possibilities", () => {
    for (const regions of [["calf"], ["lateral_thigh"], ["low_back"]] as Region[][]) {
      const next = nextFinding(db, {}, regions);
      if (next.done) throw new Error("expected a question");
      const view = restrictToRegions(db, regions);
      const best = Math.max(
        ...view.findings
          .filter((f) => isEligible(f, regions) && !f.askIf && !f.followUp)
          .map((f) => expectedEliminated(view, {}, regions, f)),
      );
      expect(next.gain).toBeCloseTo(best, 9);
      expect(next.gain).toBeGreaterThan(MIN_INFORMATION_GAIN_BITS);
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
    // sitting pain pushes the nerve to ~19%
    const answers: Record<string, Answer> = { h_pain_sitting_chair: "yes", h_leg_numbness: "no" };
    const before = top(regions, answers);
    // other questions may be interleaved; "unsure" takes them out of the queue without scoring
    const asked: string[] = [];
    for (let i = 0; i < 60 && asked.length < pfcnQs.length; i++) {
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
    const f = db.findings.find((x) => x.id === "st_resisted_wrist_ext_self")!;
    const ruledOutIn = (regions: Region[]) => {
      const view = restrictToRegions(db, regions);
      return isRuledOut(view, f, ruledOutOptions(view, { h_grip_lateral_elbow: "no" }, regions));
    };
    expect(ruledOutIn(["elbow_lateral"])).toBe(true);
    expect(ruledOutIn(["forearm_dorsal"])).toBe(false);
  });
});

describe("knee", () => {
  it("twisting injury with a pop -> ACL tear", () => {
    const r = top(["knee_front", "knee_medial", "knee_lateral"], { h_knee_pivot_injury: "yes", h_knee_pop: "yes" });
    expect(r[0].id).toBe("acl");
  });

  it("front-of-knee pain on squatting, kneeling, sitting and stairs, no injury -> kneecap pain", () => {
    const r = top(["knee_front"], {
      st_knee_deep_squat: "yes",
      h_knee_kneel_pain: "yes",
      h_knee_sitting_pain: "yes",
      h_knee_stairs_pain: "yes",
      h_knee_pivot_injury: "no",
    });
    expect(r[0].id).toBe("pfp");
  });

  it("inner knee pain after a weight-bearing injury, painful deep squat, no pivot, no kneecap triggers -> meniscal tear", () => {
    const r = top(["knee_medial"], {
      h_knee_weightbearing_injury: "yes",
      st_knee_deep_squat: "yes",
      h_knee_pivot_injury: "no",
      h_knee_kneel_pain: "no",
      h_knee_sitting_pain: "no",
    });
    expect(r[0].id).toBe("meniscus");
  });

  it("knee OA has no probability but fits on the NICE checklist", () => {
    const regions: Region[] = ["knee_medial"];
    const fit = logicalFit(restrictToRegions(db, regions), regions, {
      h_age_45: "yes",
      h_knee_activity_pain: "yes",
      h_knee_morning_stiff_short: "yes",
    });
    const oa = fit.find((l) => l.id === "knee_oa")!;
    expect(oa.fit).toBe(3);
    expect(oa.against).toBe(0);
    expect(scorableHypotheses(restrictToRegions(db, regions)).map((h) => h.id)).not.toContain("knee_oa");
  });

  it("back of the knee brings in the Baker's cyst, the L5/S1 roots and stenosis, not the kneecap", () => {
    const ids = restrictToRegions(db, ["knee_back"]).hypotheses.map((h) => h.id);
    for (const id of ["bakers_cyst", "root_low", "stenosis", "acl", "meniscus"]) expect(ids).toContain(id);
    expect(ids).not.toContain("pfp");
  });
});

describe("head, face, jaw and belly", () => {
  it("jaw pain with a high screener score -> TMD", () => {
    const r = top(["jaw", "temple"], { h_tmd_screener: "yes" });
    expect(r[0].id).toBe("tmd");
  });

  it("brief electric attacks on one side of the face set off by touch fit trigeminal neuralgia on the ICHD-3 checklist", () => {
    const regions: Region[] = ["face", "jaw"];
    const fit = logicalFit(restrictToRegions(db, regions), regions, {
      h_face_one_side: "yes",
      h_head_attacks_brief: "yes",
      h_head_attacks_severe: "yes",
      h_head_electric: "yes",
      h_face_light_trigger: "yes",
      h_tmd_screener: "no",
    });
    expect(fit[0].id).toBe("trigeminal");
    expect(fit[0].fit).toBe(5);
  });

  it("back-of-head headache with neck pain and a tender skull base -> neck headache; a 'no' on the tender spot doesn't count", () => {
    const regions: Region[] = ["head_back"];
    const r = top(regions, { h_ha_neck_pain: "yes", st_gon_tender_self: "yes" });
    expect(r[0].id).toBe("cervicogenic_headache");
    const p = (a: Record<string, Answer>) => top(regions, a).find((e) => e.id === "cervicogenic_headache")!.p;
    expect(p({ st_gon_tender_self: "no" })).toBeCloseTo(p({}), 12);
  });

  it("fixed fingertip belly pain with a high questionnaire score -> abdominal wall nerve; the trunk nerves are listed too", () => {
    const r = top(["abdomen"], { h_acnes_questionnaire: "yes" });
    expect(r[0].id).toBe("acnes");
    const ids = restrictToRegions(db, ["abdomen"]).hypotheses.map((h) => h.id);
    for (const id of ["acnes", "abdominal_hernia", "root_thoracic", "intercostal", "zoster"]) expect(ids).toContain(id);
  });
});

describe("ankle, heel and lower leg", () => {
  const injured = { h_ankle_injury: "yes" } as const;

  it("rolled ankle, can't take four steps, pressing down hurts, bone tender -> fracture first", () => {
    const r = top(["ankle_lateral"], {
      ...injured,
      h_ankle_rolled_in: "yes",
      h_ankle_cant_weight: "yes",
      st_shetty_helper: "yes",
      st_ottawa_bone_self: "yes",
    });
    expect(r[0].id).toBe("ankle_fracture");
  });

  it("rolled ankle, walking and pressing down fine: fracture less likely, the sprain fits", () => {
    const regions: Region[] = ["ankle_lateral"];
    const answers = { ...injured, h_ankle_rolled_in: "yes", h_ankle_cant_weight: "no", st_shetty_helper: "no", st_ottawa_bone_self: "no" } as const;
    const p = (a: Record<string, Answer>) => top(regions, a).find((e) => e.id === "ankle_fracture")!.p;
    expect(p(answers)).toBeLessThan(p(injured));
    const fit = logicalFit(restrictToRegions(db, regions), regions, answers);
    const sprain = fit.find((l) => l.id === "ankle_sprain")!;
    expect(sprain.fit).toBe(2);
    expect(sprain.against).toBe(0);
    const fracture = fit.find((l) => l.id === "ankle_fracture")!;
    expect(fracture.against).toBeGreaterThan(fracture.fit);
  });

  it("without an injury the fracture checks are never asked, and the weight-bearing answer is implied", () => {
    const regions: Region[] = ["ankle_lateral", "achilles", "heel"];
    const answers: Record<string, Answer> = { h_ankle_injury: "no" };
    const asked: string[] = [];
    for (let i = 0; i < 40; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      asked.push(n.finding.id);
      answers[n.finding.id] = "no";
    }
    for (const id of ["h_ankle_cant_weight", "st_shetty_helper", "st_ottawa_bone_self", "h_ankle_rolled_in"]) expect(asked).not.toContain(id);
    expect(withImplied(db, { h_ankle_injury: "no" }, regions).h_ankle_cant_weight).toBe("no");
  });

  it("back-of-ankle pain without an injury: a normal calf squeeze makes a rupture unlikely", () => {
    const r = top(["achilles"], { h_ankle_injury: "no", st_calf_squeeze_helper: "no" });
    expect(r.find((e) => e.id === "achilles_rupture")!.p).toBeLessThan(0.1);
  });

  it("after a push-off injury, a calf squeeze that doesn't move the foot -> Achilles rupture", () => {
    const r = top(["achilles", "calf"], { ...injured, st_calf_squeeze_helper: "yes" });
    expect(r[0].id).toBe("achilles_rupture");
  });

  it("heel pain brought on by bending the big toe up -> plantar heel pain", () => {
    const r = top(["heel"], { st_windlass_helper: "yes", h_heel_first_steps: "yes" });
    expect(r[0].id).toBe("plantar_fasciitis");
  });

  it("a short tender spot on the shin doesn't favour a stress fracture (as in the study); a painful heel tap does", () => {
    const regions: Region[] = ["shin_anterior"];
    const p = (a: Record<string, Answer>) => top(regions, a).find((e) => e.id === "tibial_stress_fracture")!.p;
    expect(p({ st_shin_focal_self: "yes" })).toBeLessThan(p({}));
    expect(p({ st_heel_percussion_helper: "yes" })).toBeGreaterThan(p({}));
  });

  it("the heel brings in plantar heel pain, the S1 root, stenosis and the tarsal tunnel; the outer ankle brings in the sural and peroneal nerves", () => {
    const heel = restrictToRegions(db, ["heel"]).hypotheses.map((h) => h.id);
    for (const id of ["plantar_fasciitis", "root_low", "stenosis", "tarsal_tunnel", "polyneuropathy"]) expect(heel).toContain(id);
    expect(heel).not.toContain("ankle_sprain");
    const outer = restrictToRegions(db, ["ankle_lateral"]).hypotheses.map((h) => h.id);
    for (const id of ["ankle_sprain", "ankle_fracture", "peroneal_tendon", "sural", "peroneal", "root_low"]) expect(outer).toContain(id);
  });
});

describe("leg look-alikes: arteries, peroneal nerve, polyneuropathy", () => {
  it("calf pain on walking that eases on standing still ranks narrowed arteries first", () => {
    const r = top(["calf"], {
      h_walk_stand_still_ease: "yes",
      h_worse_standing: "no",
      h_bend_forward: "no",
      h_no_pain_seated: "no",
    });
    expect(r[0].id).toBe("pad");
  });

  it("classic neurogenic claudication still ranks stenosis above the arteries", () => {
    const r = top(["low_back", "buttock", "calf"], {
      h_walking_claudication: "yes",
      h_walk_stand_still_ease: "no",
      h_worse_standing: "yes",
      h_bend_forward: "yes",
    });
    const rank = (id: string) => r.findIndex((x) => x.id === id);
    expect(rank("stenosis")).toBeLessThan(rank("pad"));
  });

  it("foot drop after leg crossing fits the peroneal nerve; numb soles are a note, not against it", () => {
    const fit = logicalFit(db, ["shin_anterior", "foot_dorsum"], {
      st_heel_walk: "yes",
      h_peroneal_setting: "yes",
      h_bilateral_sole_numbness: "yes",
    });
    const pn = fit.find((l) => l.id === "peroneal")!;
    expect(pn.fit).toBe(2);
    expect(pn.against).toBe(0);
  });

  it("symptoms that didn't start in both feet count against polyneuropathy", () => {
    const fit = logicalFit(db, ["foot_dorsum"], { h_poly_toes_up: "no" });
    const poly = fit.find((l) => l.id === "polyneuropathy")!;
    expect(poly.against).toBe(1);
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
      // All "yes" makes hip OA lead (93%, with the cited groin question, Khan 2004) before the
      // studied inner-thigh question comes up; the obturator checklist is still asked.
      if (answer === "no") expect(answers.h_worst_medial_thigh).toBe(answer);
      else expect(answers.h_obt_origin).toBe(answer);
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
    for (let i = 0; i < 80; i++) {
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
    for (let i = 0; i < 80; i++) {
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

  it("frozen shoulder: front-of-shoulder (coracoid) point most tender, no painful arc -> frozen shoulder", () => {
    const r = top(["shoulder"], { st_coracoid_self: "yes", st_painful_arc_self: "no", st_arm_squeeze: "no" });
    expect(r[0].id).toBe("frozen_shoulder");
  });

  it("AC joint: began with repetitive work, stays above the elbow, swollen bump -> AC joint", () => {
    const r = top(["shoulder"], {
      h_shoulder_repetitive_onset: "yes",
      h_shoulder_above_elbow: "yes",
      st_ac_swelling_self: "yes",
      st_coracoid_self: "no",
      st_arm_squeeze: "no",
    });
    expect(r[0].id).toBe("ac_joint");
  });

  it("pain spreading below the elbow counts strongly against the AC joint", () => {
    const r = top(["shoulder"], { h_shoulder_above_elbow: "no" });
    const ac = r.find((x) => x.id === "ac_joint")!;
    expect(ac.p).toBeLessThan(0.02);
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

  it("asks the repetitive-use, creaking, grip and numbness questions unless an earlier 'no' ruled out what they check", () => {
    const answers: Record<string, Answer> = {};
    for (let i = 0; i < 40; i++) {
      const next = nextFinding(db, answers, regions);
      if (next.done) break;
      answers[next.finding.id] = "no";
    }
    expect(Object.keys(answers)).toEqual(expect.arrayContaining(["h_repetitive_use", "h_arm_numbness"]));
    const view = restrictToRegions(db, regions);
    const ruledOut = ruledOutOptions(view, withImplied(db, answers, regions), regions);
    for (const id of ["h_forearm_creak", "h_grip_lateral_elbow"]) {
      if (!(id in answers)) expect(isRuledOut(view, db.findings.find((f) => f.id === id)!, ruledOut)).toBe(true);
    }
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

  // User report (2026-11-06): costochondritis that doesn't feel stabbing. "Stinging or stabbing"
  // (52.9% of chest wall pain) answered "no" first used to rule chest wall pain out of the
  // questioning, so the pressing test and the movement question were never asked.
  it("a 'no' to stinging or stabbing still leads to the pressing test and the movement question", () => {
    const chest: Region[] = ["chest_front"];
    const facts: Record<string, Answer> = {
      h_chest_stinging: "no", st_chest_press_self: "yes", h_chest_movement: "yes", h_trunk_band: "no",
      h_rib_click: "no", h_trunk_numbness: "no", h_many_places_both_sides: "no",
    };
    const answers: Record<string, Answer> = { h_chest_stinging: "no" };
    for (let i = 0; i < 40; i++) {
      const next = nextFinding(db, answers, chest);
      if (next.done) break;
      answers[next.finding.id] = facts[next.finding.id] ?? "unsure";
    }
    expect(answers).toHaveProperty("st_chest_press_self");
    expect(answers).toHaveProperty("h_chest_movement");
    const view = restrictToRegions(db, chest);
    const guess = bestGuess(posterior(view, answers), logicalFit(view, chest, answers));
    expect("id" in guess && guess.id).toBe("chest_wall");
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
  it("asks questions in order of how many possibilities they eliminate, and terminates", () => {
    let s = reduce(db, initialSession, { type: "start" });
    s = reduce(db, s, { type: "regions", regions: ["buttock", "posterior_thigh", "calf"] });
    const gains: number[] = [];
    for (let i = 0; i < 80 && s.phase === "interview"; i++) {
      const next = nextFinding(db, s.answers, s.regions);
      if (next.done) break;
      expect(next.finding.id in withImplied(db, s.answers, s.regions)).toBe(false);
      if (next.gain > 0) gains.push(next.gain);
      s = reduce(db, s, { type: "answer", id: next.finding.id, answer: "no" });
    }
    expect(s.phase).toBe("results");
    expect(gains.length).toBeGreaterThan(3);
    expect(gains.every((g) => g >= MIN_INFORMATION_GAIN_BITS)).toBe(true);
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

  it("is asked within the interview like any other question, and only some of it", () => {
    for (const answer of ["no", "unsure"] as Answer[]) {
      const kinds = run(answer).map((f) => f.kind);
      expect(kinds[0]).not.toBe("profile");
      const eligible = db.findings.filter((f) => f.kind === "profile" && isEligible(f, regions)).length;
      expect(kinds.filter((k) => k === "profile").length).toBeLessThan(eligible);
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

describe("coverage pass: options without accuracy data (logical fit only)", () => {
  const fitOf = (regions: Region[], given: Record<string, Answer>, id: string) =>
    logicalFit(restrictToRegions(db, regions), regions, withImplied(db, given, regions)).find((l) => l.id === id)!;
  const interview = (regions: Region[], given: Record<string, Answer>, answer: Answer = "no") => {
    const answers = { ...given };
    const asked: string[] = [];
    for (let i = 0; i < 120; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      asked.push(n.finding.id);
      answers[n.finding.id] = answer;
    }
    return asked;
  };

  it("tailbone pain on sitting fits coccydynia", () => {
    expect(fitOf(["buttock"], { h_tailbone_point: "yes", h_tailbone_sitting: "yes" }, "coccydynia")).toMatchObject({ fit: 2, against: 0 });
  });

  it("one 'no' to the whole-body screen rules out fibromyalgia, PMR and inflammatory arthritis, and their detail questions aren't asked", () => {
    const regions: Region[] = ["shoulder", "neck"];
    const asked = interview(regions, {});
    expect(asked).toContain("h_many_places_both_sides");
    for (const id of ["h_widespread_pain", "h_fatigue_sleep", "h_both_shoulders_ache", "h_morning_stiff_45", "h_age_50", "h_many_joints_swollen", "h_morning_stiff_long"])
      expect(asked).not.toContain(id);
    for (const id of ["fibromyalgia", "pmr", "inflammatory_arthritis"])
      expect(fitOf(regions, { h_many_places_both_sides: "no" }, id).against).toBeGreaterThan(0);
  });

  it("both shoulders aching with long morning stiffness over 50 fits the polymyalgia rheumatica checklist", () => {
    const given: Record<string, Answer> = { h_many_places_both_sides: "yes", h_both_shoulders_ache: "yes", h_morning_stiff_45: "yes", h_age_over_65: "yes" };
    expect(withImplied(db, given, ["shoulder"]).h_age_50).toBe("yes");
    expect(fitOf(["shoulder"], given, "pmr")).toMatchObject({ fit: 4, against: 0 });
    // Short morning stiffness implies the 45-minute item is not met.
    expect(withImplied(db, { h_morning_stiff_long: "no" }, ["shoulder"]).h_morning_stiff_45).toBe("no");
  });

  it("a growing child with a tender bump below the kneecap fits Osgood-Schlatter, and knee OA is implied against", () => {
    const given: Record<string, Answer> = { h_age_growing: "yes", h_shin_top_bump: "yes" };
    expect(withImplied(db, given, ["knee_front"]).h_age_45).toBe("no");
    expect(fitOf(["knee_front"], given, "osgood")).toMatchObject({ fit: 2, against: 0 });
    expect(fitOf(["knee_front"], given, "knee_oa").against).toBeGreaterThan(0);
  });

  it("injury details are asked only after a knee injury", () => {
    const asked = interview(["knee_medial", "knee_back"], { h_knee_injury: "no" });
    for (const id of ["h_knee_side_force", "h_knee_front_blow"]) expect(asked).not.toContain(id);
  });

  it("a fall on the hand with a tender hollow at the base of the thumb fits a scaphoid fracture", () => {
    expect(fitOf(["wrist_radial"], { h_fall_on_hand: "yes", h_snuffbox_tender: "yes" }, "scaphoid_fracture")).toMatchObject({ fit: 2, against: 0 });
  });

  it("a big toe forced upward, then swollen, fits turf toe; no injury fills in 'not forced upward'", () => {
    expect(fitOf(["forefoot"], { h_big_toe_forced_up: "yes", h_big_toe_swelling: "yes", h_under_big_toe: "yes" }, "turf_toe")).toMatchObject({ fit: 3, against: 0 });
    expect(withImplied(db, { p_injury: "no" }, ["forefoot"]).h_big_toe_forced_up).toBe("no");
  });

  it("a hot swollen joint opens the infection and reactive arthritis questions; nothing else does", () => {
    const opened = ["h_fever", "h_septic_risk", "h_pain_moves", "h_skin_spots", "h_preceding_infection", "h_eyes_red"];
    const yes = interview(["knee_front"], { h_joint_hot_swollen: "yes" });
    for (const id of opened) expect(yes).toContain(id);
    const no = interview(["knee_front"], {});
    expect(no).toContain("h_joint_hot_swollen");
    for (const id of opened) expect(no).not.toContain(id);
  });

  it("fever with a hot swollen joint and skin spots fits a joint infection; diarrhoea and red eyes fit reactive arthritis", () => {
    expect(fitOf(["wrist_radial"], { h_joint_hot_swollen: "yes", h_fever: "yes", h_skin_spots: "yes" }, "septic_arthritis")).toMatchObject({ fit: 3, against: 0 });
    expect(fitOf(["knee_front"], { h_joint_hot_swollen: "yes", h_preceding_infection: "yes", h_eyes_red: "yes" }, "reactive_arthritis")).toMatchObject({ fit: 3, against: 0 });
    expect(fitOf(["knee_front"], { h_joint_hot_swollen: "yes", h_preceding_infection: "no" }, "reactive_arthritis").against).toBe(1);
  });

  it("a still-growing child with a limp and a foot turning out fits SCFE; an adult is not asked about growing", () => {
    expect(fitOf(["groin"], { h_age_growing: "yes", h_limp: "yes", h_leg_turns_out: "yes" }, "scfe")).toMatchObject({ fit: 3, against: 0 });
    expect(withImplied(db, { h_age_50: "yes" }, ["groin"]).h_age_growing).toBe("no");
    expect(interview(["groin"], { h_age_growing: "no" })).not.toContain("h_leg_turns_out");
  });

  it("every option added in this pass has at least one check", () => {
    const added = ["coccydynia", "spondylolysis", "axial_spa", "whiplash", "pelvic_girdle", "osteitis_pubis", "hip_stress_fracture", "hip_avn", "iliopsoas", "thigh_strain", "shoulder_instability", "slap_tear", "calcific_tendinitis", "olecranon_bursitis", "scaphoid_fracture", "wrist_ganglion", "hand_oa", "mallet_finger", "dupuytren", "knee_collateral", "pcl", "patellar_dislocation", "osgood", "knee_ocd", "ankle_oa", "high_ankle_sprain", "hallux_valgus", "sesamoiditis", "insertional_achilles", "sever", "gout", "inflammatory_arthritis", "pmr", "fibromyalgia"];
    for (const h of db.hypotheses.filter((x) => added.includes(x.id))) {
      const checks = h.logic.filter((l) => l.type !== "unexplained").length + (h.criteria?.items.length ?? 0);
      const scored = db.findings.some((f) => f.evidence.some((e) => e.hypothesis === h.id));
      expect(scored || checks > 0, h.id).toBe(true);
    }
  });
});

describe("body-map screen: symptoms higher up than the foot or hand", () => {
  const interview = (regions: Region[], screen: Answer) => {
    const answers: Record<string, Answer> = {};
    const asked: string[] = [];
    for (let i = 0; i < 80; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      asked.push(n.finding.id);
      answers[n.finding.id] = n.finding.id.startsWith("h_symptoms_above_") ? screen : "unsure";
    }
    return asked;
  };
  // Questions about the back-and-leg pattern of a lower-back root or stenosis.
  const BACK = ["h_bend_forward", "h_walking_claudication", "h_bilateral", "st_slr_helper", "h_worse_standing", "h_improve_seated", "h_pain_below_knee", "h_leg_worse_than_back", "h_no_pain_seated", "h_walk_stand_still_ease", "h_age_over_65"];
  const spineQuestions = (asked: string[]) => asked.filter((id) => BACK.includes(id));

  it("is asked first when only the foot is marked, and a 'no' drops every back and leg question", () => {
    for (const regions of [["forefoot", "foot_dorsum"], ["heel"]] as Region[][]) {
      const no = interview(regions, "no");
      expect(no[0]).toBe("h_symptoms_above_foot");
      expect(spineQuestions(no)).toEqual([]);
      expect(spineQuestions(interview(regions, "yes")).length).toBeGreaterThan(0);
    }
  });

  it("is filled in from the body map, not asked, when an area higher up is marked", () => {
    const regions: Region[] = ["forefoot", "calf"];
    expect(impliedAnswers(db, {}, regions).h_symptoms_above_foot).toEqual({ answer: "yes", from: FROM_BODY_MAP });
    expect(interview(regions, "no")).not.toContain("h_symptoms_above_foot");
  });

  it("a 'no' for the hand drops the neck tests", () => {
    expect(interview(["hand_median"], "no")).not.toContain("st_spurling_self");
    expect(interview(["hand_median"], "yes")).toContain("st_spurling_self");
  });

  it("never changes a probability", () => {
    for (const [regions, id] of [[["heel"], "h_symptoms_above_foot"], [["hand_median"], "h_symptoms_above_hand"]] as [Region[], string][]) {
      expect(top(regions, { [id]: "no" })).toEqual(top(regions, {}));
    }
  });
});

describe("heel pain answered the plantar-fasciitis way", () => {
  const regions: Region[] = ["heel"];
  const run = (windlass: Answer) => {
    const pf: Record<string, Answer> = { h_symptoms_above_foot: "no", h_heel_first_steps: "yes", h_leg_numbness: "no", st_windlass_helper: windlass };
    const answers: Record<string, Answer> = {};
    for (let i = 0; i < 60; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      answers[n.finding.id] = pf[n.finding.id] ?? "no";
    }
    const view = restrictToRegions(db, regions);
    const all = withImplied(db, answers, regions);
    return { answers, guess: bestGuess(posterior(view, all), logicalFit(view, regions, all)) };
  };

  it("asks the windlass test, the only studied sign of plantar fasciitis", () => {
    expect(run("yes").answers.st_windlass_helper).toBe("yes");
  });

  it("never names stenosis or a back root as the best guess", () => {
    expect(run("yes").guess).toMatchObject({ kind: "leading", id: "plantar_fasciitis" });
    expect(run("unsure").guess).toMatchObject({ kind: "leading", id: "plantar_fasciitis" });
    expect(run("no").guess).toMatchObject({ kind: "other", bestListed: "plantar_fasciitis" });
  });
});

describe("sensitised pain system (nociplastic) and CRPS (user request, 2026-11-06)", () => {
  const interview = (regions: Region[], facts: Record<string, Answer>) => {
    const answers: Record<string, Answer> = {};
    for (let i = 0; i < 100; i++) {
      const n = nextFinding(db, answers, regions);
      if (n.done) break;
      answers[n.finding.id] = facts[n.finding.id] ?? "unsure";
    }
    const view = restrictToRegions(db, regions);
    const all = withImplied(db, answers, regions);
    const fits = logicalFit(view, regions, all);
    return { answers, fits, guess: bestGuess(posterior(view, all), fits) };
  };
  const Y = "yes";
  const N = "no";

  it("is an option in every region, never scored", () => {
    const h = db.hypotheses.find((x) => x.id === "nociplastic")!;
    expect(new Set(h.regions).size).toBe(46);
    expect(scorableHypotheses(db).some((x) => x.id === "nociplastic" || x.id === "crps")).toBe(false);
    expect(hasDiagram("st_brush_self")).toBe(true);
  });

  it("names it when the pain is long-lasting, regional and touch-sensitive and nothing structural fits", () => {
    const { guess, fits } = interview(["low_back", "buttock", "posterior_thigh"], {
      h_pain_3_months: Y, h_pain_regional: Y, st_brush_self: Y, p_light_touch: Y, h_sens_comorbid: Y, p_spreading: Y,
      p_one_spot: N, h_leg_numbness: N, h_leg_tingling: N, p_numb: N, p_tingling: N, h_cough_sneeze: N, p_injury: N,
      h_walking_claudication: N, h_bend_forward: N, p_burning: N, p_shooting: N, h_many_places_both_sides: N,
    });
    expect(guess).toMatchObject({ kind: "leading", id: "nociplastic" });
    expect(fits.find((f) => f.id === "nociplastic")!.checklist!.status).toBe("met");
    expect(sensitisedLayer(db, fits, guess)).toBe(false); // already the headline
  });

  it("one 'no' to the 3-month question rules it out and its other questions aren't asked", () => {
    const { answers, fits } = interview(["low_back"], { h_pain_3_months: N, p_one_spot: Y });
    expect(answers.h_pain_3_months).toBe("no");
    for (const id of ["h_pain_regional", "st_brush_self", "h_hypersens_history", "h_sens_comorbid", "h_central_syndromes", "h_onset_stress", "h_pain_inconsistent", "h_pain_harmless_trigger"]) expect(answers[id]).toBeUndefined();
    expect(fits.find((f) => f.id === "nociplastic")!.checklist!.status).toBe("impossible");
  });

  it("counts the pain reprocessing trial's rule-in signs as cited checks that a 'no' only drops (2026-11-07)", () => {
    const h = db.hypotheses.find((x) => x.id === "nociplastic")!;
    expect(h.mechanism?.sourceId).toBe("ashar2022");
    expect(h.logic!.every((l) => l.type === "supports" && l.sourceId === "ashar2022")).toBe(true);
    const base = { h_pain_3_months: Y, h_pain_regional: Y, st_brush_self: Y } as const;
    const rest = ["h_central_syndromes", "h_onset_stress", "h_pain_inconsistent", "h_pain_harmless_trigger"];
    const fit = (a: Record<string, Answer>) => logicalFit(restrictToRegions(db, ["low_back"]), ["low_back"], a).find((f) => f.id === "nociplastic")!;
    const yes = fit({ ...base, ...Object.fromEntries(rest.map((id) => [id, Y])) });
    for (const id of rest) expect(yes.checks.find((c) => c.finding.id === id)).toMatchObject({ verdict: "fit", sourceId: "ashar2022" });
    const no = fit({ ...base, ...Object.fromEntries(rest.map((id) => [id, N])) });
    for (const id of rest) expect(no.checks.find((c) => c.finding.id === id)).toBeUndefined();
  });

  it("widespread pain for 3 months implies the 3-month answer", () => {
    expect(impliedAnswers(db, { h_widespread_pain: "yes" }, ["low_back"]).h_pain_3_months?.answer).toBe("yes");
  });

  it("shows the layer note when a nerve root leads but the sensitised checklist is met", () => {
    const fits = logicalFit(restrictToRegions(db, ["low_back"]), ["low_back"], {
      h_pain_3_months: Y, h_pain_regional: Y, st_brush_self: Y,
    });
    expect(sensitisedLayer(db, fits, { kind: "leading", id: "root_low", p: 0.7, logicDisagrees: false })).toBe(true);
    expect(sensitisedLayer(db, fits, { kind: "leading", id: "fibromyalgia", logicDisagrees: false })).toBe(false);
    const open = logicalFit(restrictToRegions(db, ["low_back"]), ["low_back"], { h_pain_3_months: Y, h_pain_regional: Y });
    expect(sensitisedLayer(db, open, { kind: "leading", id: "root_low", p: 0.7, logicDisagrees: false })).toBe(false);
  });

  it("names CRPS for wrist pain out of proportion after a fall, with colour, swelling and stiffness changes", () => {
    const { guess, fits } = interview(["wrist_radial", "hand_median", "forearm_anterior"], {
      p_injury: Y, h_fall_on_hand: Y, h_pain_disproportionate: Y, p_light_touch: Y, h_limb_temp_colour: Y,
      h_limb_swelling_sweat: Y, h_limb_motor_trophic: Y, p_burning: Y, h_pain_3_months: Y, h_pain_regional: Y, st_brush_self: Y,
    });
    expect(guess).toMatchObject({ kind: "leading", id: "crps" });
    expect(fits.find((f) => f.id === "crps")!.checklist!.status).toBe("met");
    expect(sensitisedLayer(db, fits, guess)).toBe(false);
  });

  it("CRPS's symptom questions are asked only after pain out of proportion, and only for the limbs", () => {
    const { answers } = interview(["knee_front"], { h_pain_disproportionate: N });
    expect(answers.h_pain_disproportionate).toBe("no");
    for (const id of ["h_limb_temp_colour", "h_limb_swelling_sweat", "h_limb_motor_trophic"]) expect(answers[id]).toBeUndefined();
    expect(isEligible(db.findings.find((f) => f.id === "h_pain_disproportionate")!, ["low_back"])).toBe(false);
  });
});
