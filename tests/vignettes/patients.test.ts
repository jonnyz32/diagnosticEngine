import { describe, expect, it } from "vitest";
import { posterior, restrictToRegions } from "../../src/engine/bayes";
import { loadEvidence } from "../../src/engine/db";
import { logicalFit } from "../../src/engine/logic";
import type { Answer, Region } from "../../src/engine/schema";
import { nextFinding, withImplied } from "../../src/engine/selection";
import { bestGuess, type BestGuess } from "../../src/engine/verdict";

/**
 * Ten textbook patients described in plain language (added 2026-11-06). Each is run through
 * the full interview: a question is answered from what the description states, and "unsure"
 * otherwise. No self-test was done, except that Marcus's "weakness pushing off his toes" is
 * read as failing the heel-raise test. The best guess must name the expected option.
 * These are teaching vignettes, not published cases, so they are not in cases/cases.json.
 * A second set of ten followed the same day, with the patients' answers to follow-up questions
 * (self-tests included), plus Caleb's answer to the hip-catching question added afterwards. All
 * ten are listed; Mireille (suspected spinal metastasis, which no option covers) must get
 * "not covered".
 */

const db = loadEvidence();
const Y = "yes";
const N = "no";

interface Patient {
  name: string;
  expect: string;
  regions: Region[];
  facts: Record<string, "yes" | "no">;
}

const patients: Patient[] = [
  {
    name: "Marcus, 34: back pain into the back of the leg after lifting, cough/sneeze worse, outer-foot tingling",
    expect: "root_low",
    regions: ["low_back", "posterior_thigh", "calf", "foot_sole_lateral"],
    facts: {
      h_age_over_65: N, h_age_45: N, h_age_50: N, h_cough_sneeze: Y, h_pain_sitting_chair: Y, p_flexion_worse: Y,
      h_leg_burning: Y, h_leg_shooting: Y, h_leg_tingling: Y, p_burning: Y, p_shooting: Y, p_tingling: Y,
      h_leg_numbness: Y, h_pain_below_knee: Y, h_severe_leg_pain: Y, h_bilateral: N, h_improve_seated: N,
      h_no_pain_seated: N, h_walking_claudication: N, st_heel_raise: Y, p_injury: Y, p_sudden_severe: N,
      h_back_gradual_onset: N, h_back_movement: Y, p_position: Y,
    },
  },
  {
    name: "Elena, 52: gradual shoulder stiffness in all directions, worse at night",
    expect: "frozen_shoulder",
    regions: ["shoulder"],
    facts: {
      h_shoulder_stiff: Y, p_night_rest: Y, p_heat_eases: Y, p_dull_ache: Y, p_injury: N, p_sudden_severe: N,
      h_age_45: Y, h_age_50: Y, h_age_60: N, h_shoulder_overhead_or_fall: N, h_shoulder_dislocated: N,
      h_both_shoulders_ache: N, p_stretch: Y, h_shoulder_repetitive_onset: N, h_sudden_severe_arm_pain: N,
    },
  },
  {
    name: "David, 22: front-of-knee pain after more running, stairs, squats and long sitting",
    expect: "pfp",
    regions: ["knee_front"],
    facts: {
      h_knee_stairs_pain: Y, h_knee_sitting_pain: Y, st_knee_deep_squat: Y, h_knee_injury: N, h_knee_pivot_injury: N,
      h_knee_activity_pain: Y, h_age_45: N, h_age_growing: N, h_knee_locking: N, h_knee_swelled_fast: N,
      h_knee_below_kneecap: N, h_knee_outer_running: N, p_repetitive: Y, p_dull_ache: Y, p_injury: N, p_position: Y,
      h_knee_back_swelling: N,
    },
  },
  {
    name: "Sarah, 41: outer elbow pain on gripping with the palm down",
    expect: "lateral_epicondylalgia",
    regions: ["elbow_lateral", "forearm_lateral"],
    facts: {
      h_grip_lateral_elbow: Y, h_outer_elbow_main: Y, p_burning: Y, p_dull_ache: Y, p_injury: N, p_one_spot: Y,
      h_age_45: N, h_sudden_severe_arm_pain: N,
    },
  },
  {
    name: "Arthur, 68: slowly worsening groin and thigh pain, socks and low car seats, short morning stiffness",
    expect: "hip_oa",
    regions: ["groin", "anterior_thigh"],
    facts: {
      h_age_over_65: Y, h_age_45: Y, h_age_50: Y, h_groin_deep_flexion: Y, p_flexion_worse: Y, h_limp: Y,
      h_worse_standing: Y, h_improve_seated: Y, h_walking_claudication: Y, p_movement_eases: Y, h_morning_stiff_long: N,
      p_injury: N, p_sudden_severe: N, h_bilateral: N, p_dull_ache: Y, p_throbbing: Y, h_hip_weight_pain: Y,
      h_hip_load_increase: N,
    },
  },
  {
    name: "Maya, 29: thumb-to-middle-finger tingling since pregnancy, waking at night, eased by shaking the hand",
    expect: "cts",
    regions: ["hand_median"],
    facts: {
      h_pregnancy: Y, h_arm_numbness: Y, p_tingling: Y, p_numb: Y, p_dull_ache: Y, p_night_rest: Y, p_position: Y,
      h_symptoms_above_hand: N, h_age_45: N, h_repetitive_use: Y, h_sudden_severe_arm_pain: N, p_injury: N,
      h_hand_flick: Y,
    },
  },
  {
    name: "Liam, 19: outer ankle pain and swelling after landing on another player's foot, can take 4 steps",
    expect: "ankle_sprain",
    regions: ["ankle_lateral"],
    facts: {
      h_ankle_injury: Y, h_ankle_rolled_in: Y, h_ankle_cant_weight: N, p_injury: Y, p_throbbing: Y, h_age_growing: N,
      h_ankle_behind_outer: N, h_symptoms_above_foot: N,
    },
  },
  {
    name: "Brenda, 46: under-heel pain worst on the first steps in the morning",
    expect: "plantar_fasciitis",
    regions: ["heel"],
    facts: {
      h_heel_first_steps: Y, p_movement_eases: Y, p_stabbing: Y, h_age_45: Y, h_age_50: N, p_numb: N, p_tingling: N,
      h_leg_numbness: N, p_injury: N, h_heel_back_bump: N, h_achilles_morning: N, h_symptoms_above_foot: N,
    },
  },
  {
    name: "Chloe, 37: swollen knuckles and wrists of both hands, morning stiffness over an hour, tiredness",
    expect: "inflammatory_arthritis",
    regions: ["hand_median", "hand_ulnar", "hand_dorsal_radial", "wrist_radial", "wrist_ulnar"],
    facts: {
      h_morning_stiff_long: Y, h_many_joints_swollen: Y, h_many_places_both_sides: Y, h_fatigue_sleep: Y,
      p_heat_eases: Y, p_movement_eases: Y, p_throbbing: Y, p_dull_ache: Y, p_injury: N, h_joint_attacks: N,
      h_finger_knobbly: N, h_age_45: N, h_age_50: N, h_widespread_pain: N, h_symptoms_above_hand: N,
    },
  },
  {
    name: "Robert, 58: thumb-base pain on pinching, squared-off bony bump, grinding",
    expect: "thumb_cmc_oa",
    regions: ["wrist_radial", "hand_dorsal_radial"],
    facts: {
      h_thumb_base_pinch: Y, h_age_45: Y, h_age_50: Y, p_heat_eases: Y, p_dull_ache: Y, h_repetitive_use: Y,
      p_injury: N, h_fall_on_hand: N, h_wrist_lump: N, h_symptoms_above_hand: N, p_one_spot: Y, h_thumb_base_bump: Y,
    },
  },
  // Second set (user-supplied, 2026-11-06), with the patients' answers to follow-up questions.
  {
    name: "Victor, 72: both buttocks, thighs and calves ache on walking and standing, eased by sitting or leaning on a cart",
    expect: "stenosis",
    regions: ["low_back", "buttock", "posterior_thigh", "calf"],
    facts: {
      h_age_over_65: Y, h_age_45: Y, h_age_50: Y, h_age_60: Y, h_bend_forward: Y, h_walking_claudication: Y,
      h_walk_stand_still_ease: N, h_bilateral: Y, h_pain_below_knee: Y, h_improve_seated: Y, h_worse_standing: Y,
      h_hip_stairs: Y, h_leg_worse_than_back: Y, h_pain_sitting_chair: N, h_groin_pain: N, h_ankle_injury: N,
      p_injury: N, p_sudden_severe: N, h_back_gradual_onset: Y, p_heavy_weak: Y, p_activity_rest: Y,
      p_flexion_worse: N, p_dull_ache: Y, p_position: Y, p_one_spot: N, h_recent_surgery: N, h_leg_exercise_tight: Y,
      h_many_places_both_sides: Y,
    },
  },
  {
    name: "Hannah, 31: thumb-side wrist pain lifting her baby, painful resisted thumb extension, grind test negative",
    expect: "de_quervain",
    regions: ["wrist_radial", "hand_dorsal_radial"],
    facts: {
      h_age_45: N, h_age_50: N, h_symptoms_above_hand: N, h_wrist_thumb_motion: Y, h_thumb_base_pinch: N,
      h_arm_numbness: N, p_tingling: N, p_numb: N, p_buzzing: N, h_pregnancy: Y, p_repetitive: Y, p_one_spot: Y,
      p_injury: N, h_fall_on_hand: N, h_forearm_creak: N, h_many_joints_swollen: N, h_finger_catching: N,
      h_thumb_base_bump: N, h_wrist_lump: N, p_stabbing: Y, h_sudden_severe_arm_pain: N, st_what_self: Y,
      st_grind_helper: N, p_night_rest: N, p_movement_eases: N, h_many_places_both_sides: N,
    },
  },
  {
    // Axial SpA has no study data: its checks are asked only through the step for unscored
    // options' logical-fit checks (selection.ts `nextAfterScored`).
    name: "Devon, 24: deep low back and alternating buttock ache waking him late at night, better with exercise, stiff over an hour",
    expect: "axial_spa",
    regions: ["low_back", "buttock"],
    facts: {
      h_age_over_65: N, h_age_45: N, h_age_50: N, h_age_growing: N, h_back_onset_young: Y, h_back_gradual_onset: Y,
      h_back_exercise_better: Y, h_back_night_wakes: Y, h_morning_stiff_long: Y, p_movement_eases: Y,
      p_heat_eases: Y, p_night_rest: Y, h_bilateral: Y, h_pain_below_knee: N, p_injury: N, p_sudden_severe: N,
      h_pain_sitting_chair: Y, h_improve_seated: N, h_no_pain_seated: N, h_walking_claudication: N, p_position: Y,
      p_dull_ache: Y, p_activity_rest: N, h_recent_surgery: N, h_groin_pain: N, h_leg_worse_than_back: N,
      h_back_sudden_onset: N, p_repetitive: N, st_slr_helper: N, st_psis_tender: Y, st_trochanter_tender: N,
      st_single_leg_stance: N, st_beatty_home: N, h_pfcn_location: N, h_hamstring_injury: N, h_lbp_half_bent: N,
      p_tingling: N, p_numb: N, p_buzzing: N, p_one_spot: N, h_leg_numbness: N, st_pfcn_skin: N,
    },
  },
  {
    name: "Grace, 64: outer hip pain after starting brisk walking, tender over the bony point, worse standing on that leg",
    expect: "gtps",
    regions: ["lateral_thigh"],
    facts: {
      h_age_over_65: N, h_age_60: Y, h_age_45: Y, h_age_50: Y, st_trochanter_tender: Y, st_single_leg_stance: Y,
      h_hip_stairs: Y, h_hip_load_increase: Y, h_groin_pain: N, p_one_spot: Y, p_injury: N, p_repetitive: Y,
      p_night_rest: Y, p_position: Y, h_pain_below_knee: N, h_bilateral: N, h_bend_forward: N, h_leg_burning: N,
      p_tingling: N, p_numb: N, p_burning: N, h_tight_clothing: N, h_pregnancy: N, h_many_places_both_sides: N,
      p_dull_ache: Y, p_sudden_severe: N, h_recent_surgery: N, h_morning_stiff_long: N,
    },
  },
  {
    name: "Nora, 49: ring and little finger tingling with the elbow bent, positive elbow-flexion test",
    expect: "cubital",
    regions: ["forearm_medial", "hand_ulnar"],
    facts: {
      h_age_45: Y, h_age_50: N, h_arm_numbness: Y, p_tingling: Y, p_buzzing: Y, p_position: Y, p_heavy_weak: Y,
      h_symptoms_above_hand: Y, p_dull_ache: Y, h_finger_catching: N, h_many_joints_swollen: N, p_injury: N,
      h_sudden_severe_arm_pain: N, p_shooting: Y, st_tinel_elbow_self: Y, st_siref_self: Y, st_spurling_self: N,
      st_shoulder_abduction_relief: N, h_hand_flick: N, h_grip_medial_elbow: N, p_night_rest: Y,
      h_many_places_both_sides: N,
    },
  },
  {
    name: "Trevor, 36: Achilles pain 3-4 cm above the heel after hill sprints, stiff on first steps, warms up",
    expect: "achilles_tendinopathy",
    regions: ["achilles"],
    facts: {
      h_symptoms_above_foot: N, h_achilles_morning: Y, h_achilles_spot: Y, h_ankle_injury: N, h_heel_back_bump: N,
      h_age_growing: N, h_age_over_65: N, h_age_45: N, h_joint_attacks: N, h_poly_toes_up: N, p_injury: N,
      p_sudden_severe: N, p_repetitive: Y, p_movement_eases: Y, p_one_spot: Y, p_burning: Y, h_leg_numbness: N,
      p_tingling: N, p_numb: N, h_bilateral: N, h_walking_claudication: N, h_recent_surgery: N, h_bend_forward: N,
      h_many_places_both_sides: N,
    },
  },
  {
    // PMR has no study data: its published checklist (opened by the whole-body screen) and the
    // combined best guess carry it past hip OA's probability lead from groin pain.
    name: "Evelyn, 71: aching and stiffness of both shoulders, neck and hips for 3 weeks, 2 hours of morning stiffness",
    expect: "pmr",
    regions: ["neck", "shoulder", "upper_arm_lateral", "buttock", "lateral_thigh", "groin", "temple"],
    facts: {
      h_age_over_65: Y, h_age_60: Y, h_age_45: Y, h_age_50: Y, h_bilateral: Y, h_both_shoulders_ache: Y,
      h_morning_stiff_45: Y, h_morning_stiff_long: Y, h_hip_pain_too: Y, h_other_joints_pain: N,
      h_many_places_both_sides: Y, h_sudden_severe_arm_pain: N, p_sudden_severe: N, p_injury: N, p_dull_ache: Y,
      h_many_joints_swollen: N, h_head_attacks_brief: N, h_head_attacks_severe: N, h_head_electric: N,
      h_face_one_side: N, h_scapula_winging: N, h_recent_surgery: N, p_movement_eases: Y, h_fatigue_sleep: Y,
      p_tingling: N, p_numb: N, h_leg_numbness: N, h_arm_numbness: N, h_pain_below_knee: N, h_ac_point: N,
      p_one_spot: N, p_burning: N, p_light_touch: N, h_walking_claudication: N, h_bend_forward: N,
      h_pain_sitting_chair: N, h_obt_exercise: N, h_obt_radiate: N, h_groin_adductor: N, h_ii_pain: N,
      h_ii_sensory: N, h_improve_seated: N, h_no_pain_seated: N, h_shoulder_stiff: N, st_painful_arc_self: N,
      h_front_shoulder_pain: N, h_neck_movement_pain: N, h_groin_deep_flexion: Y, h_hip_stairs: Y, h_limp: N,
      p_night_rest: Y, p_heavy_weak: Y,
    },
  },
  {
    // Meniscus leads on probability (weight-bearing injury, squat, stairs); the collateral
    // ligament's injury checks outweigh it in the combined best guess.
    name: "Justin, 20: inner knee pain after a blow to the outside of his planted knee, no pop, no fast swelling",
    expect: "knee_collateral",
    regions: ["knee_medial"],
    facts: {
      h_knee_pop: N, h_knee_swelled_fast: N, h_knee_pivot_injury: N, h_knee_injury: Y, h_knee_side_force: Y,
      h_knee_weightbearing_injury: Y, p_injury: Y, h_age_45: N, h_age_over_65: N, h_age_growing: N,
      h_knee_activity_pain: Y, p_one_spot: Y, h_leg_numbness: N, h_bilateral: N, h_walking_claudication: N,
      h_recent_surgery: N, h_many_joints_swollen: N, p_tingling: N, p_numb: N, p_stabbing: Y, p_sudden_severe: N,
      h_pain_below_knee: N, h_knee_inner_below_joint: N, h_kneecap_slipped: N, h_joint_attacks: N,
      st_knee_deep_squat: Y, h_knee_stairs_pain: Y, h_knee_kneel_pain: N, h_knee_sitting_pain: N, h_knee_locking: N,
      h_many_places_both_sides: N,
    },
  },
  {
    // Suspected spinal metastasis, which no option covers: no listed option may come out ahead
    // of "not covered".
    name: "Mireille, 54: constant deep mid-back pain waking her at night, weight loss, past breast cancer",
    expect: "other",
    regions: ["upper_back", "mid_back"],
    facts: {
      h_back_sudden_onset: N, h_back_gradual_onset: Y, h_back_movement: N, p_night_rest: Y, h_trunk_band: N,
      h_band_rash: N, h_back_itch: N, h_neck_movement_pain: N, h_neck_car_accident: N, h_many_places_both_sides: N,
      p_injury: N, h_age_50: Y, h_age_45: Y, h_age_60: N, h_age_over_65: N, p_heat_eases: N, p_dull_ache: Y,
      p_movement_eases: N, h_back_exercise_better: N, p_sudden_severe: N, p_tingling: N, p_numb: N, p_burning: N,
      h_trunk_numbness: N, p_one_spot: N, h_back_onset_young: N, p_position: Y,
    },
  },
  {
    // Tied with pubic bone stress and the obturator nerve until the close-call questions (pubic
    // bone? deep catching in the hip?) were asked past the question budget.
    name: "Caleb, 27: front-of-groin pinching on deep squats, pivoting and low seats, painful catching in the hip",
    expect: "hip_fai",
    regions: ["groin", "lateral_thigh"],
    facts: {
      h_age_over_65: N, h_age_45: N, h_age_50: N, h_age_growing: N, h_groin_deep_flexion: Y, h_groin_pain: Y,
      h_pain_sitting_chair: Y, h_improve_seated: N, h_no_pain_seated: N, h_groin_adductor: Y, h_obt_exercise: Y,
      h_obt_origin: N, h_obt_radiate: N, p_injury: N, p_repetitive: Y, p_position: Y, p_one_spot: Y,
      h_leg_numbness: N, p_tingling: N, p_numb: N, h_bilateral: N, h_pain_below_knee: N, h_ii_pain: N,
      h_ii_sensory: N, p_stabbing: Y, p_sudden_severe: N, h_recent_surgery: N, h_walking_claudication: N,
      h_leg_burning: N, p_burning: N, h_pregnancy: N, st_adductor_squeeze_self: N, st_adductor_tender_self: N,
      st_trochanter_tender: N, st_squat_posterior: N, h_hip_stairs: Y, h_limp: N, h_hip_first_steps: N,
      p_night_rest: N, p_movement_eases: N, h_morning_stiff_long: N, h_many_places_both_sides: N, h_hip_catch: Y,
      h_pubic_bone: N, h_worst_medial_thigh: N,
    },
  },
];

function interview(p: Patient): BestGuess {
  const answers: Record<string, Answer> = {};
  for (let i = 0; i < 100; i++) {
    const next = nextFinding(db, answers, p.regions);
    if (next.done) break;
    answers[next.finding.id] = p.facts[next.finding.id] ?? "unsure";
  }
  const view = restrictToRegions(db, p.regions);
  const full = withImplied(db, answers, p.regions);
  return bestGuess(posterior(view, full), logicalFit(view, p.regions, full));
}

// "other": no listed option comes out ahead of "not covered by this tool".
const named = (g: BestGuess) => ("id" in g ? g.id : g.kind === "other" ? "other" : undefined);

// Arthur (hip OA) is the close call: stenosis 35% vs hip OA 30% by probability (groin pain, Khan
// 2004, against the stenosis posture items, which count once as one dependence group), level in
// the combined score, and the logical fit names hip OA.
describe("described patients: the best guess after a full interview", () => {
  for (const p of patients) {
    it(p.name, () => {
      for (const f of Object.keys(p.facts)) expect(db.findings.some((x) => x.id === f), f).toBe(true);
      expect(named(interview(p))).toBe(p.expect);
    });
  }
});
