import { describe, expect, it } from "vitest";
import { posterior, restrictToRegions } from "../../src/engine/bayes";
import { loadEvidence } from "../../src/engine/db";
import { logicalFit } from "../../src/engine/logic";
import type { Answer, Region } from "../../src/engine/schema";
import { nextFinding, withImplied } from "../../src/engine/selection";
import { bestGuess, judgementRanking, type BestGuess } from "../../src/engine/verdict";
import { childWithLimp, hotJointWithFever } from "../../src/ui/UrgentJointNotice";

/**
 * Ten textbook patients described in plain language (added 2026-11-06). Each is run through
 * the full interview: a question is answered from what the description states, and "unsure"
 * otherwise. No self-test was done, except that Marcus's "weakness pushing off his toes" is
 * read as failing the heel-raise test. The best guess must name the expected option.
 * These are teaching vignettes, not published cases, so they are not in cases/cases.json.
 * A second set of ten followed the same day, with the patients' answers to follow-up questions
 * (self-tests included), plus Caleb's answer to the hip-catching question added afterwards. All
 * ten are listed; Mireille (suspected spinal metastasis, which no option covers) must get
 * "not covered". A third set followed the same day; the seven whose condition the tool lists are
 * included (see the comment above them). A fourth set followed the same day (see the comment
 * above it), a fifth on 2026-11-07, and a sixth the same day (eight of ten; see the comment above them).
 */

const db = loadEvidence();
const Y = "yes";
const N = "no";

interface Patient {
  name: string;
  expect: string;
  regions: Region[];
  facts: Record<string, "yes" | "no">;
  // A close call that includes `expect` also passes (see the patient's comment).
  closeOk?: boolean;
  // Two problems at once (Naomi): the overall ranking must put this option second.
  second?: string;
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
  // Third set (user-supplied, 2026-11-06): nine of ten (Walter has cauda equina, not covered). Self-
  // tests are "unsure" unless the description or a follow-up answer (Sanjay, Claire) gives them.
  {
    // Ended on a close call (deep gluteal first, posterior femoral cutaneous nerve, SIJ) until his
    // answers to the self-tests were supplied.
    name: "Sanjay, 38: deep mid-buttock ache into the back of the thigh, worse sitting on hard surfaces, no back pain",
    expect: "deep_gluteal",
    regions: ["buttock", "posterior_thigh"],
    facts: {
      h_pain_sitting_chair: Y, h_improve_seated: N, h_no_pain_seated: N, h_walking_claudication: N, h_bend_forward: N,
      h_walk_stand_still_ease: N, h_worse_standing: N, h_bilateral: N, h_groin_pain: N, h_age_over_65: N, h_age_50: N,
      h_pain_below_knee: N, h_leg_numbness: Y, h_leg_tingling: Y, h_leg_burning: Y, h_leg_shooting: N, h_cough_sneeze: N,
      h_leg_worse_than_back: Y, h_hip_stairs: Y, h_limp: N, h_hip_first_steps: N, h_many_places_both_sides: N,
      h_pregnancy: N, h_recent_surgery: N, p_tingling: Y, p_burning: Y, p_dull_ache: Y, p_position: Y, p_repetitive: Y,
      p_injury: N, p_sudden_severe: N, p_night_rest: N, p_light_touch: N, p_spreading: N, p_numb: N, p_buzzing: N,
      p_heavy_weak: N, p_flexion_worse: N, h_pfcn_location: N, h_pfcn_avoid_sitting: N, h_hamstring_injury: N,
      h_hip_load_increase: Y, h_hip_weight_pain: N, h_tailbone_point: N, h_back_onset_young: N, h_back_gradual_onset: N,
      h_thigh_sudden_pull: N, h_widespread_pain: N, h_fatigue_sleep: N, h_buttock_burning_walking: N, h_hip_catch: N,
      h_back_extension_pain: N, h_pelvis_walk_turn: N, p_one_spot: N, p_movement_eases: N, p_heat_eases: N,
      h_severe_leg_pain: N, h_bone_health: N, h_avn_risk: N, h_back_exercise_better: N, h_back_night_wakes: N,
      h_tailbone_sitting: N, h_back_arching_sport: N, p_stretch: N, p_activity_rest: N, st_seated_piriformis: Y,
      st_beatty_home: Y, st_active_piriformis: Y, st_slr_helper: N, st_pfcn_skin: N, st_psis_tender: N,
      st_one_finger_psis: N, st_resisted_knee_flex: N, st_long_stride_walk: N, st_ifi_helper: N, st_single_leg_stance: N,
      st_trochanter_tender: N, st_centralisation_self: N, st_scn_tender_self: N, st_scn_reproduce_self: N,
    },
  },
  {
    // Snuffbox tenderness and the grind test from her answers to follow-up questions. Without the
    // snuffbox answer, thumb-base OA ties.
    name: "Claire, 29: thumb-side wrist pain after a fall on the outstretched hand, worse pushing off and pinching",
    expect: "scaphoid_fracture",
    regions: ["wrist_radial"],
    facts: {
      h_fall_on_hand: Y, p_injury: Y, h_symptoms_above_hand: N, h_arm_numbness: N, p_tingling: N, p_numb: N, p_buzzing: N,
      h_wrist_lump: N, h_many_places_both_sides: N, h_joint_attacks: N, h_many_joints_swollen: N, h_forearm_creak: N,
      h_repetitive_use: N, h_thumb_base_bump: N, h_age_45: N, h_morning_stiff_long: N, h_finger_knobbly: N,
      p_dull_ache: Y, p_stabbing: Y, p_heavy_weak: N, p_night_rest: N, p_movement_eases: N, p_sudden_severe: N,
      p_position: N, p_stretch: N, p_repetitive: N, p_burning: N, p_shooting: N, h_hand_flick: N,
      h_thumb_base_pinch: Y, h_wrist_thumb_motion: N, p_one_spot: Y, h_snuffbox_tender: Y, st_grind_helper: N,
    },
  },
  {
    name: "Owen, 44: weightlifter with pain he can point to on top of the shoulder, worse reaching across the chest",
    expect: "ac_joint",
    regions: ["shoulder"],
    facts: {
      h_ac_point: Y, h_shoulder_above_elbow: Y, h_shoulder_stiff: N, h_many_places_both_sides: N, h_neck_movement_pain: N,
      h_sudden_severe_arm_pain: N, h_scapula_winging: N, h_front_shoulder_pain: N, h_neck_car_accident: N,
      h_shoulder_apprehension: N, h_shoulder_overhead_or_fall: Y, h_many_joints_swollen: N, h_age_60: N, h_age_50: N,
      h_shoulder_repetitive_onset: N, h_shoulder_dislocated: N, h_shoulder_deep_click: N, h_both_shoulders_ache: N,
      h_morning_stiff_long: N, h_morning_stiff_45: N, h_hip_pain_too: N, h_other_joints_pain: N, h_widespread_pain: N,
      h_fatigue_sleep: N, h_arm_numbness: N, p_tingling: N, p_buzzing: N, p_numb: N, p_heavy_weak: N, p_position: Y,
      p_stretch: Y, p_activity_rest: N, p_night_rest: N, p_sudden_severe: N, p_injury: N, p_burning: N, p_light_touch: N,
      p_spreading: N, p_one_spot: Y, p_movement_eases: N, p_repetitive: Y, p_stabbing: Y, p_dull_ache: Y, p_shooting: N,
    },
  },
  {
    // 17 with a recent growth spurt: "still growing" is yes (the question asked "16 or younger"
    // until 2026-11-06, when a "no" here named patellar tendinopathy).
    name: "Tessa, 17: tender bump below the kneecap during volleyball season and a growth spurt",
    expect: "osgood",
    regions: ["knee_front"],
    facts: {
      h_knee_pop: N, h_knee_pivot_injury: N, h_knee_injury: N, h_knee_swelled_fast: N, h_knee_weightbearing_injury: N,
      h_knee_front_blow: N, h_kneecap_slipped: N, h_knee_locking: N, h_bend_forward: N, h_bilateral: N,
      h_walking_claudication: N, h_improve_seated: N, h_no_pain_seated: N, h_worse_standing: N, h_age_over_65: N,
      h_age_45: N, h_age_growing: Y, h_shin_top_bump: Y, h_knee_below_kneecap: Y, h_knee_kneel_pain: Y,
      h_knee_activity_pain: Y, h_knee_stairs_pain: Y, st_knee_deep_squat: Y, h_knee_sitting_pain: N,
      h_knee_morning_stiff_short: Y, h_many_places_both_sides: N, h_joint_attacks: N, h_many_joints_swollen: N,
      h_morning_stiff_long: N, h_leg_numbness: N, h_leg_tingling: N, h_leg_burning: N, h_leg_shooting: N,
      h_pain_below_knee: N, h_severe_leg_pain: N, h_cough_sneeze: N, h_pain_sitting_chair: N, h_recent_surgery: N,
      h_hip_weight_pain: N, h_avn_risk: N, h_leg_worse_than_back: Y, p_flexion_worse: N,
      p_injury: N, p_sudden_severe: N, p_repetitive: Y, p_one_spot: Y, p_throbbing: Y, p_dull_ache: Y, p_night_rest: N,
      p_tingling: N, p_numb: N, p_burning: N, p_buzzing: N, p_position: Y, p_movement_eases: N, p_activity_rest: N,
    },
  },
  {
    // Tied with the cervical root and cubital tunnel until the arms-overhead check (added
    // 2026-11-06) was asked as a close-call question.
    name: "Gregory, 55: electrician with ring and little finger tingling and a heavy arm when working overhead",
    expect: "tos",
    regions: ["neck", "shoulder", "forearm_medial", "hand_ulnar"],
    facts: {
      h_arm_overhead_symptoms: Y, h_hand_colour_change: Y, h_arm_numbness: Y, p_tingling: Y, p_numb: Y, p_heavy_weak: Y,
      p_dull_ache: Y, p_activity_rest: Y, p_position: Y, h_neck_movement_pain: N, h_symptoms_above_hand: Y, h_age_45: Y,
      h_age_50: Y, h_age_60: N, h_repetitive_use: Y, h_sudden_severe_arm_pain: N, h_many_places_both_sides: N,
      h_many_joints_swollen: N, h_joint_attacks: N, h_shoulder_stiff: N, h_scapula_winging: N, h_finger_catching: N,
      h_grip_medial_elbow: N, h_hand_flick: N, h_neck_car_accident: N, h_shoulder_overhead_or_fall: Y,
      h_shoulder_apprehension: N, h_shoulder_dislocated: N, h_front_shoulder_pain: N, h_ac_point: N,
      h_both_shoulders_ache: N, h_morning_stiff_long: N, h_morning_stiff_45: N, h_hip_pain_too: N, h_other_joints_pain: N,
      h_widespread_pain: N, h_fatigue_sleep: N, h_palm_cord: N, h_finger_knobbly: N, h_fingertip_droop: N,
      h_shoulder_above_elbow: N, h_back_onset_young: N, h_back_gradual_onset: Y, p_injury: N, p_sudden_severe: N,
      p_burning: N, p_shooting: N, p_night_rest: N, p_light_touch: N, p_stretch: Y, p_one_spot: N, p_buzzing: N,
      p_repetitive: Y, p_movement_eases: N, h_shoulder_repetitive_onset: Y,
    },
  },
  {
    name: "Malik, 26: diffuse inner-shin ache over 10 cm after switching to pavement running",
    expect: "mtss",
    regions: ["shin_anterior"],
    facts: {
      h_shin_long_stretch: Y, st_shin_focal_self: N, h_ff_load_increase: Y, h_ankle_injury: N, h_leg_exercise_tight: N,
      h_walking_claudication: N, h_bend_forward: N, h_bilateral: N, h_age_over_65: N, h_improve_seated: N,
      h_no_pain_seated: N, h_worse_standing: N, h_leg_numbness: N, h_leg_tingling: N, h_leg_burning: N,
      h_leg_shooting: N, h_pain_below_knee: Y, h_severe_leg_pain: N, h_cough_sneeze: N, h_pain_sitting_chair: N,
      h_recent_surgery: N, h_poly_toes_up: N, h_peroneal_setting: N, h_leg_worse_than_back: Y,
      p_flexion_worse: N, p_injury: N, p_sudden_severe: N, p_repetitive: Y, p_one_spot: N, p_throbbing: Y, p_dull_ache: Y,
      p_tingling: N, p_numb: N, p_burning: N, p_buzzing: N, p_night_rest: N, p_movement_eases: Y, p_activity_rest: N,
      p_heavy_weak: N, p_tight: N, p_stabbing: N, p_shooting: N, h_walk_stand_still_ease: N,
    },
  },
  {
    name: "Denise, 61: burning between the 3rd and 4th toes in narrow shoes, like walking on a pebble",
    expect: "morton",
    regions: ["forefoot"],
    facts: {
      h_ff_tight_shoes: Y, h_ff_im_space: Y, h_ff_pins_needles: Y, h_ff_shoes_off_eases: Y, h_ff_gradual_onset: Y,
      st_ff_squeeze_self: Y, h_ff_click: N, h_ff_2nd_head: N, h_ff_swelling: N, h_ff_toe_drift: N, h_ff_load_increase: N,
      h_ff_bone_point: N, h_big_toe_tender: N, h_big_toe_bump: N, h_big_toe_bend: N, h_bunion: N, h_under_big_toe: N,
      h_sole_wide: N, h_symptoms_above_foot: N, h_poly_toes_up: N, h_bilateral: N, h_age_over_65: N,
      h_bilateral_sole_numbness: N, h_walking_claudication: N, h_bend_forward: N, h_joint_attacks: N,
      h_many_joints_swollen: N, h_many_places_both_sides: N, h_morning_stiff_long: N, h_leg_numbness: Y,
      h_leg_tingling: Y, h_leg_burning: Y, h_leg_shooting: Y, h_pain_below_knee: N, h_severe_leg_pain: Y,
      h_cough_sneeze: N, h_pain_sitting_chair: N, h_improve_seated: Y, h_recent_surgery: N,
      p_burning: Y, p_tingling: Y, p_numb: Y, p_shooting: Y, p_stabbing: Y, p_injury: N, p_sudden_severe: N,
      p_position: N, p_night_rest: N, p_one_spot: Y, p_light_touch: N, p_spreading: N, p_buzzing: N, p_heavy_weak: N,
      p_movement_eases: N, p_repetitive: N, p_flexion_worse: N,
    },
  },
  {
    // No option covered turf toe until it was added (2026-11-06); before that, a close call
    // between sesamoiditis and hallux rigidus.
    name: "Simone, 33: big toe forced upward pivoting on turf, pain and bruising under the big toe joint",
    expect: "turf_toe",
    regions: ["forefoot"],
    facts: {
      p_injury: Y, h_big_toe_forced_up: Y, h_big_toe_swelling: Y, h_under_big_toe: Y, h_big_toe_tender: Y,
      h_big_toe_bend: Y, h_big_toe_bump: N, h_bunion: N, h_ff_gradual_onset: N, h_ff_tight_shoes: N, h_ff_im_space: N,
      h_ff_pins_needles: N, h_ff_click: N, h_ff_2nd_head: N, h_ff_swelling: N, h_ff_toe_drift: N, h_ff_load_increase: N,
      h_ff_bone_point: N, h_sole_wide: N, h_ff_shoes_off_eases: N, h_symptoms_above_foot: N, h_joint_attacks: N,
      h_many_joints_swollen: N, h_many_places_both_sides: N, h_morning_stiff_long: N, h_poly_toes_up: N, h_bilateral: N,
      h_age_over_65: N, h_bilateral_sole_numbness: N, h_walking_claudication: N, h_bend_forward: N, h_leg_numbness: N,
      h_leg_tingling: N, h_leg_burning: N, h_leg_shooting: N, h_pain_below_knee: N, h_severe_leg_pain: Y,
      h_cough_sneeze: N, h_pain_sitting_chair: N, h_recent_surgery: N, h_improve_seated: Y, p_stabbing: Y,
      p_throbbing: Y, p_tingling: N, p_numb: N, p_burning: N, p_buzzing: N, p_shooting: N, p_sudden_severe: N,
      p_one_spot: Y, p_night_rest: N, p_repetitive: N, p_position: N, p_light_touch: N, p_spreading: N,
      p_movement_eases: N, p_heavy_weak: N, p_flexion_worse: N,
    },
  },
  {
    name: "Hector, 47: neck pain into the shoulder blade, outer arm and thumb, eased with the hand on his head",
    expect: "root_cervical",
    regions: ["neck", "scapula", "upper_arm_lateral", "forearm_lateral", "hand_dorsal_radial", "hand_median"],
    facts: {
      h_arm_numbness: Y, p_tingling: Y, p_shooting: Y, p_burning: Y, p_stabbing: Y, p_heavy_weak: Y, p_numb: N,
      h_neck_movement_pain: Y, st_shoulder_abduction_relief: Y, h_symptoms_above_hand: Y,
      h_sudden_severe_arm_pain: N, h_neck_car_accident: N, h_age_45: Y, h_age_50: N, h_age_60: N, p_injury: N,
      p_sudden_severe: N, h_many_places_both_sides: N, h_many_joints_swollen: N, h_scapula_winging: N,
      h_shoulder_stiff: N, h_front_shoulder_pain: N, h_repetitive_use: N, h_hand_flick: N, h_finger_catching: N,
      h_wrist_thumb_motion: N, h_thumb_base_pinch: N, h_grip_lateral_elbow: N, h_outer_elbow_main: N,
      h_both_shoulders_ache: N, h_morning_stiff_45: N, h_hip_pain_too: N, h_other_joints_pain: N, h_widespread_pain: N,
      h_fatigue_sleep: N, h_shoulder_overhead_or_fall: N, h_back_gradual_onset: N, h_back_onset_young: N,
      h_fall_on_hand: N, h_snuffbox_tender: N, h_finger_knobbly: N, h_thumb_base_bump: N, h_forearm_creak: N,
      p_position: Y, p_stretch: N, p_repetitive: N, p_one_spot: N, p_light_touch: N, p_spreading: N, p_buzzing: N,
      p_movement_eases: N, p_dull_ache: N,
    },
  },
  // Fourth set (user-supplied, 2026-11-06): the five whose condition the tool lists, plus two it
  // doesn't cover (Camille: gallbladder; Toby: osteoid osteoma), which must get "not covered".
  // Noah (SCFE), Damon (reactive arthritis) and Peyton (gonococcal arthritis) follow, added once
  // their conditions were listed. Self-tests are "unsure".
  {
    // Named a low back nerve root (L5/S1, 53%) until compartment syndrome got checks for pins and needles, weakness and settling with rest.
    name: "Amina, 28: runner, bursting tightness in the front of both shins at 12 minutes, foot slapping, gone within 20 minutes of stopping",
    expect: "cecs",
    regions: ["shin_anterior", "foot_dorsum"],
    facts: {
      h_bilateral: Y, p_activity_rest: Y, h_leg_exercise_tight: Y, h_walking_claudication: N,
      h_walk_stand_still_ease: N, h_bend_forward: N, p_heavy_weak: Y, p_tingling: Y, h_leg_tingling: Y,
      h_leg_numbness: Y, p_night_rest: N, p_injury: N, p_sudden_severe: N, p_one_spot: N, h_age_over_65: N,
      h_age_45: N, h_age_50: N, h_age_growing: N, p_numb: N, p_buzzing: N, p_burning: Y, h_leg_burning: Y,
      p_shooting: N, h_leg_shooting: N, p_light_touch: N, p_spreading: N, p_position: N, p_stretch: N,
      p_movement_eases: N, p_repetitive: Y, h_cough_sneeze: N, h_pain_below_knee: Y, h_improve_seated: N,
      h_no_pain_seated: N, h_worse_standing: N, h_pain_sitting_chair: N, h_diabetes: N, h_recent_surgery: N,
      h_ff_load_increase: N, h_symptoms_above_foot: Y, h_severe_leg_pain: Y, p_dull_ache: Y, p_stabbing: N,
      h_bilateral_sole_numbness: N, h_leg_worse_than_back: Y, h_ankle_injury: N, p_flexion_worse: N, st_heel_walk: N,
      h_shin_long_stretch: N, h_many_places_both_sides: N, h_many_joints_swollen: N, h_big_toe_tender: N,
      h_big_toe_bump: N, h_big_toe_bend: N, h_ankle_stiff_ache: N, h_bunion: N, h_joint_attacks: N,
      h_poly_toes_up: N, st_slr_helper: N, st_prone_knee_bend: N, st_sit_to_stand: N, st_sens_medial_ankle: N,
      st_sens_medial_knee: N, h_leg_cool: N, h_vascular_risk: N, h_peroneal_setting: N,
    },
  },
  {
    // Named spinal stenosis until leg arteries got checks for cool skin and vascular risk factors.
    name: "Gerald, 74: buttock and calf cramp after 1.5 blocks, eased standing still, smoker, cool feet",
    expect: "pad",
    regions: ["buttock", "calf"],
    facts: {
      h_age_over_65: Y, h_age_45: Y, h_age_50: Y, h_age_60: Y, h_bilateral: Y, h_walking_claudication: Y,
      h_walk_stand_still_ease: Y, h_bend_forward: N, h_worse_standing: N, h_improve_seated: N, p_activity_rest: Y,
      h_leg_numbness: N, h_leg_tingling: N, h_leg_burning: N, h_leg_shooting: N, p_tingling: N, p_numb: N,
      p_buzzing: N, p_burning: N, p_shooting: N, p_night_rest: N, p_injury: N, p_sudden_severe: N, h_cough_sneeze: N,
      h_pain_below_knee: Y, h_pain_sitting_chair: N, p_position: N, p_stretch: N, p_light_touch: N, p_spreading: N,
      p_one_spot: N, p_movement_eases: N, p_heavy_weak: N, h_leg_worse_than_back: Y, h_diabetes: N,
      h_recent_surgery: N, h_leg_exercise_tight: Y, p_dull_ache: Y, h_hip_stairs: Y, h_pregnancy: N,
      h_many_places_both_sides: N, h_back_gradual_onset: N, h_tailbone_point: N, h_tailbone_sitting: N,
      h_widespread_pain: N, h_fatigue_sleep: N, h_groin_pain: N, h_ankle_injury: N, h_hip_weight_pain: Y,
      h_calf_muscle_spot: N, h_poly_toes_up: N, h_achilles_morning: N, h_back_extension_pain: N, h_hip_catch: N,
      h_achilles_spot: N, h_leg_cool: Y, h_vascular_risk: Y, h_bilateral_sole_numbness: N, h_hip_load_increase: N,
      h_bone_health: N, h_avn_risk: N,
    },
  },
  {
    // Named a labral tear until the rotator cuff got checks for an arm that can't be lifted or held out, and the fall.
    name: "Leonard, 59: can't lift the arm out to the side after a fall on the outstretched arm, night pain, drop-arm sign",
    expect: "rotator_cuff",
    regions: ["shoulder"],
    facts: {
      p_injury: Y, h_shoulder_overhead_or_fall: Y, h_fall_on_hand: Y, h_age_45: Y, h_age_50: Y, h_age_60: N,
      h_age_over_65: N, p_night_rest: Y, h_shoulder_stiff: N, p_heavy_weak: Y, h_shoulder_dislocated: N,
      h_arm_numbness: N, p_tingling: N, p_numb: N, p_buzzing: N, p_burning: N, p_shooting: N, p_dull_ache: Y,
      p_sudden_severe: N, h_both_shoulders_ache: N, h_neck_movement_pain: N, h_sudden_severe_arm_pain: N,
      h_many_places_both_sides: N, h_many_joints_swollen: N, h_morning_stiff_long: N, h_shoulder_repetitive_onset: N,
      p_movement_eases: N, p_light_touch: N, p_spreading: N, p_stretch: Y, p_position: Y, p_repetitive: N,
      p_activity_rest: N, h_scapula_winging: N, h_front_shoulder_pain: N, h_ac_point: N, h_neck_car_accident: N,
      h_symptoms_above_hand: N, h_hand_colour_change: N, h_arm_overhead_symptoms: N, h_morning_stiff_45: N,
      h_hip_pain_too: N, h_other_joints_pain: N, h_shoulder_apprehension: N, h_shoulder_deep_click: N,
      h_arm_lift_weak: Y,
    },
  },
  {
    // A close call (cubital tunnel, non-specific arm pain) until Guyon's canal got checks for palm pressure and numbness.
    name: "Kieran, 35: cyclist with heel-of-palm ache, ring and little finger tingling, weak pinch, elbow normal",
    expect: "guyon",
    regions: ["wrist_ulnar", "hand_ulnar"],
    facts: {
      h_arm_numbness: Y, p_tingling: Y, p_heavy_weak: Y, p_position: Y, p_repetitive: Y, h_repetitive_use: Y,
      p_injury: N, p_sudden_severe: N, h_age_45: N, h_age_50: N, h_age_60: N, h_age_over_65: N,
      h_symptoms_above_hand: N, h_neck_movement_pain: N, h_sudden_severe_arm_pain: N, p_numb: N, p_burning: N,
      p_shooting: N, p_buzzing: N, p_dull_ache: Y, p_night_rest: N, p_light_touch: N, p_spreading: N, p_stretch: N,
      p_movement_eases: N, h_many_places_both_sides: N, h_many_joints_swollen: N, h_morning_stiff_long: N,
      h_fall_on_hand: N, h_finger_catching: N, h_finger_knobbly: N, h_hand_flick: N, h_arm_overhead_symptoms: N,
      h_hand_colour_change: N, h_scapula_winging: N, h_neck_car_accident: N, h_widespread_pain: N,
      h_fatigue_sleep: N, p_activity_rest: N, p_one_spot: Y, h_joint_attacks: N, h_wrist_lump: N,
      h_fingertip_droop: N, h_palm_cord: N, h_palm_pressure: Y,
    },
  },
  {
    // A close call (muscle, sacroiliac joint) until the compression fracture's territory included the lower back.
    name: "Beatrice, 62: sudden midline low back pain bending for a light basket, daily prednisone, height loss",
    expect: "vertebral_fracture",
    regions: ["low_back"],
    facts: {
      h_back_sudden_onset: Y, h_back_limits_activity: Y, h_bone_health: Y, h_age_over_65: N, h_age_45: Y,
      h_age_50: Y, h_age_60: Y, h_leg_numbness: N, h_leg_tingling: N, h_leg_burning: N, h_leg_shooting: N,
      h_pain_below_knee: N, h_bilateral: N, h_cough_sneeze: Y, h_pain_sitting_chair: Y, h_improve_seated: N,
      h_no_pain_seated: N, h_worse_standing: Y, h_walking_claudication: N, h_bend_forward: N, p_injury: Y,
      p_sudden_severe: Y, p_stabbing: Y, p_one_spot: Y, p_tingling: N, p_numb: N, p_buzzing: N, p_burning: N,
      p_shooting: N, p_light_touch: N, p_spreading: N, p_heavy_weak: N, p_movement_eases: N, p_night_rest: N,
      p_position: Y, p_stretch: N, p_repetitive: N, h_back_gradual_onset: N, h_back_onset_young: N,
      h_back_movement: Y, h_back_exercise_better: N, h_back_night_wakes: N, h_leg_worse_than_back: N,
      h_recent_surgery: N, h_pregnancy: N, h_many_places_both_sides: N, h_widespread_pain: N, h_fatigue_sleep: N,
      h_tailbone_point: N, h_tailbone_sitting: N, h_back_arching_sport: N, h_back_extension_pain: N,
      p_flexion_worse: Y, h_morning_stiff_45: N, h_avn_risk: Y, h_hip_weight_pain: N, p_tight: N, p_activity_rest: N,
    },
  },
  {
    name: "Camille, 45: deep ache under the right shoulder blade after fatty meals, unchanged by moving or massage (gallbladder, not covered)",
    expect: "other",
    regions: ["scapula", "upper_back"],
    facts: {
      h_back_sudden_onset: N, h_scapula_winging: N, h_trunk_band: N, h_neck_movement_pain: N,
      h_sudden_severe_arm_pain: N, h_band_rash: N, h_back_itch: N, h_back_movement: N, h_neck_car_accident: N,
      h_many_places_both_sides: N, h_arm_overhead_symptoms: N, h_hand_colour_change: N, p_tingling: N, p_buzzing: N,
      p_numb: N, p_heavy_weak: N, p_position: N, p_stretch: N, p_activity_rest: N, p_night_rest: Y,
      p_sudden_severe: N, p_burning: N, p_light_touch: N, p_spreading: N, p_one_spot: N, p_movement_eases: N,
      h_arm_numbness: N, h_shoulder_stiff: N, h_trunk_numbness: N, p_dull_ache: Y, p_injury: N, h_age_45: Y,
      h_age_50: N, h_age_60: N, h_age_over_65: N, p_shooting: N, p_stabbing: N, h_symptoms_above_hand: N,
      h_repetitive_use: N, h_chest_surgery_injury: N, h_rib_click: N,
    },
  },
  {
    name: "Toby, 21: deep night-time shin ache relieved by one aspirin, not by rest or activity (osteoid osteoma, not covered)",
    expect: "other",
    regions: ["shin_anterior", "anterior_thigh"],
    facts: {
      p_night_rest: Y, p_injury: N, p_sudden_severe: N, p_activity_rest: N, p_repetitive: N, h_leg_exercise_tight: N,
      h_ff_load_increase: N, h_hip_load_increase: N, p_one_spot: Y, p_dull_ache: Y, p_movement_eases: N,
      h_age_over_65: N, h_age_45: N, h_age_50: N, h_age_growing: N, h_leg_numbness: N, h_leg_tingling: N,
      h_leg_burning: N, h_leg_shooting: N, p_tingling: N, p_numb: N, p_buzzing: N, p_burning: N, p_shooting: N,
      p_light_touch: N, p_spreading: N, p_heavy_weak: N, p_position: N, p_stretch: N, h_bilateral: N,
      h_walking_claudication: N, h_walk_stand_still_ease: N, h_bend_forward: N, h_worse_standing: N,
      h_improve_seated: N, h_no_pain_seated: N, h_pain_sitting_chair: N, h_cough_sneeze: N, h_pain_below_knee: Y,
      h_diabetes: N, h_recent_surgery: N, h_tight_clothing: N, h_pregnancy: N, h_hip_stairs: N, h_limp: N,
      h_groin_pain: N, h_many_places_both_sides: N, h_widespread_pain: N, h_fatigue_sleep: N, h_bone_health: N,
      h_avn_risk: N, h_thigh_sudden_pull: N, h_severe_leg_pain: Y, h_hip_weight_pain: N, h_hip_first_steps: N,
      h_morning_stiff_long: N, st_heel_walk: N, st_sens_medial_knee: N, st_sens_anterior_thigh: N,
      h_shin_long_stretch: N, h_groin_deep_flexion: N, h_poly_toes_up: N, h_ankle_injury: N, h_hip_flexor_lift: N,
      h_peroneal_setting: N, h_hip_catch: N, h_vascular_risk: N, h_leg_cool: N,
    },
  },
  {
    // Hip OA (65%), then obturator nerve, until SCFE was added (2026-11-06).
    name: "Noah, 13: overweight boy, groin and inner-thigh ache toward the knee for 4 weeks, limping, foot turned out",
    expect: "scfe",
    regions: ["groin", "medial_thigh", "anterior_thigh"],
    facts: {
      h_age_over_65: N, h_age_45: N, h_age_50: N, h_age_growing: Y, h_bend_forward: N, h_leg_numbness: N,
      h_bilateral: N, h_walking_claudication: Y, h_improve_seated: Y, h_worse_standing: Y, h_leg_burning: N,
      h_pain_below_knee: N, h_pregnancy: N, h_tight_clothing: N, h_diabetes: N, h_leg_worse_than_back: Y,
      h_hip_stairs: Y, h_pain_sitting_chair: N, h_limp: Y, h_obt_exercise: Y, h_obt_radiate: Y, h_ii_pain: N,
      h_ii_sensory: N, h_many_places_both_sides: N, p_tingling: N, p_buzzing: N, p_numb: N, p_heavy_weak: N,
      p_position: N, p_stretch: N, p_activity_rest: Y, p_night_rest: N, p_injury: N, p_burning: N, p_light_touch: N,
      p_spreading: N, p_one_spot: Y, p_movement_eases: N, h_recent_surgery: N, h_groin_adductor: N, p_dull_ache: Y,
      p_sudden_severe: N, h_hip_weight_pain: Y, h_hip_load_increase: N, h_groin_pain: Y, p_stabbing: N,
      p_throbbing: N, p_shooting: N, h_leg_tingling: N, h_leg_shooting: N, h_cough_sneeze: N, h_bone_health: N,
      h_avn_risk: N, h_widespread_pain: N, h_fatigue_sleep: N, h_thigh_sudden_pull: N, h_back_gradual_onset: N,
      h_morning_stiff_long: N, h_pubic_bone: N, h_vascular_risk: N, h_leg_cool: N, h_hip_first_steps: N,
      h_leg_turns_out: Y, h_joint_hot_swollen: N,
    },
  },
  {
    // L5/S1 root until reactive arthritis and the hot swollen joint question were added (2026-11-06).
    // A close call with the L5/S1 root since studied "against" answers stopped ruling a scored
    // option out of the questioning (2026-11-06): "is your leg pain 7 or more?" is now asked, and
    // his "yes" (with pain below the knee, worse than in the back) fits a nerve root as well.
    // Accepted by the user (2026-11-06).
    closeOk: true,
    name: "Damon, 31: hot swollen knee and Achilles insertion pain 2 weeks after food poisoning, burning urine, red eyes",
    expect: "reactive_arthritis",
    regions: ["knee_front", "knee_medial", "knee_lateral", "achilles"],
    facts: {
      p_injury: N, p_sudden_severe: Y, h_bilateral: Y, p_throbbing: Y, p_movement_eases: N, p_night_rest: Y,
      h_age_over_65: N, h_age_45: N, h_age_50: N, h_age_growing: N, h_leg_numbness: N, h_leg_tingling: N,
      h_leg_burning: N, h_leg_shooting: N, p_tingling: N, p_numb: N, p_buzzing: N, p_burning: N, p_shooting: N,
      p_light_touch: N, p_spreading: N, p_heavy_weak: N, h_walking_claudication: N, h_bend_forward: N,
      h_cough_sneeze: N, h_pain_below_knee: Y, h_joint_attacks: N, h_morning_stiff_long: Y, h_many_joints_swollen: N,
      h_many_places_both_sides: Y, p_repetitive: N, p_position: N, p_stretch: N, p_activity_rest: N,
      h_recent_surgery: N, h_ff_load_increase: N, h_hip_load_increase: N, h_heel_back_bump: N, h_achilles_spot: Y,
      p_one_spot: Y, p_dull_ache: N, p_stabbing: N, h_widespread_pain: N, h_fatigue_sleep: N, h_back_onset_young: N,
      h_improve_seated: N, h_no_pain_seated: N, h_worse_standing: Y, h_knee_injury: N, h_knee_pop: N,
      h_knee_pivot_injury: N, h_leg_worse_than_back: Y, h_ankle_injury: N, h_knee_stairs_pain: Y,
      h_knee_kneel_pain: Y, h_severe_leg_pain: Y, p_flexion_worse: N, h_poly_toes_up: N, h_knee_below_kneecap: N,
      h_knee_outer_running: N, h_knee_inner_below_joint: N, h_leg_cool: N, h_vascular_risk: N, h_arm_lift_weak: N,
      h_knee_sitting_pain: N, h_achilles_morning: Y, h_joint_hot_swollen: Y, h_preceding_infection: Y, h_eyes_red: Y,
      h_pain_moves: N,
    },
  },
  {
    // L5/S1 root until joint infection and the hot swollen joint question were added (2026-11-06).
    name: "Peyton, 25: migrating wrist, finger and ankle pain with fever, tender tendons on the back of the hand, a few pustules",
    expect: "septic_arthritis",
    regions: ["wrist_radial", "wrist_ulnar", "hand_median", "hand_dorsal_radial", "ankle_lateral", "ankle_medial"],
    facts: {
      p_injury: N, p_sudden_severe: N, h_many_joints_swollen: Y, h_many_places_both_sides: Y, h_joint_attacks: N,
      h_morning_stiff_long: N, p_stabbing: Y, p_movement_eases: N, p_night_rest: N, h_age_45: N, h_age_50: N,
      h_age_60: N, h_age_over_65: N, p_tingling: N, p_numb: N, p_buzzing: N, p_burning: N, p_shooting: N,
      h_arm_numbness: N, h_leg_numbness: N, h_leg_tingling: N, h_repetitive_use: N, p_repetitive: N,
      h_fall_on_hand: N, h_ankle_rolled_in: N, p_spreading: Y, p_light_touch: N, p_heavy_weak: N, p_position: N,
      p_stretch: N, p_activity_rest: N, h_finger_knobbly: N, h_thumb_base_bump: N, h_hand_flick: N,
      h_finger_catching: N, h_snuffbox_tender: N, p_dull_ache: N, h_bilateral: N, h_age_growing: N,
      h_widespread_pain: N, h_fatigue_sleep: N, h_symptoms_above_hand: N, h_symptoms_above_foot: Y,
      h_bend_forward: N, h_ankle_injury: N, h_leg_burning: N, h_wrist_thumb_motion: N, h_thumb_base_pinch: N,
      h_poly_toes_up: N, h_arch_flattening: N, h_ankle_behind_outer: N, h_palm_cord: N, h_ankle_stiff_ache: N,
      h_wrist_lump: N, h_fingertip_droop: N, h_forearm_creak: N, h_walking_claudication: N, h_leg_worse_than_back: Y,
      h_pain_below_knee: Y, h_severe_leg_pain: Y, h_cough_sneeze: N, h_leg_shooting: N, h_joint_hot_swollen: Y,
      h_fever: Y, h_pain_moves: Y, h_skin_spots: Y,
    },
  },
  // Fifth set (user-supplied, 2026-11-07), all ten. Self-tests are "unsure" unless the description
  // gives the result (tapping or pressing a spot, the straight-leg raise, neck tilt, wrist bending).
  {
    // An L2-L4 nerve root, then a close call with both lumbar roots, until the mid-lumbar root got the
    // foot-only check and tarsal tunnel got the ankle tapping and footwear checks (2026-11-07).
    name: "Raymond, 51: burning under the inner heel and arch after long shifts on concrete, worse as the day goes on, tapping behind the inner ankle zings into the sole",
    expect: "tarsal_tunnel",
    regions: ["heel", "foot_sole_lateral", "ankle_medial"],
    facts: {
      h_symptoms_above_foot: N, h_walking_claudication: N, h_ankle_injury: N, h_heel_first_steps: N,
      h_bend_forward: N, h_bilateral: N, h_age_over_65: N, h_age_45: Y, h_age_50: Y, h_age_60: N,
      h_leg_worse_than_back: Y, h_pain_below_knee: Y, h_leg_numbness: Y, h_worse_standing: Y, p_flexion_worse: N,
      h_severe_leg_pain: N, h_pain_3_months: Y, h_pain_disproportionate: N, h_joint_hot_swollen: N,
      h_bilateral_sole_numbness: N, h_leg_burning: Y, h_leg_tingling: Y, h_leg_shooting: Y,
      h_many_places_both_sides: N, h_joint_attacks: N, h_many_joints_swollen: N, h_poly_toes_up: N,
      h_ankle_behind_outer: N, h_age_growing: N, p_tingling: Y, p_heavy_weak: N, p_position: Y, p_activity_rest: N,
      p_night_rest: N, p_injury: N, p_burning: Y, p_shooting: Y, p_spreading: N, p_one_spot: Y,
      p_movement_eases: N, h_recent_surgery: N, h_sole_wide: Y, p_dull_ache: Y, h_diabetes: N,
      h_cough_sneeze: N, p_sudden_severe: N, h_widespread_pain: N, h_fatigue_sleep: N, h_pregnancy: N,
      h_pain_regional: N, h_heel_back_bump: N, h_ankle_stiff_ache: N, st_tinel_ankle_self: Y,
      h_foot_standing_shoes: Y,
    },
  },
  {
    // The posterior femoral cutaneous nerve until pressing over the piriformis (a Michel item, adapted)
    // and pain below the knee were added for deep gluteal syndrome (2026-11-07).
    name: "Sophia, 32: low back pain shooting to the ankle on sitting and bending, painless straight-leg raise, a buttock knot reproduces it",
    expect: "deep_gluteal",
    regions: ["low_back", "buttock", "posterior_thigh", "calf"],
    facts: {
      h_pain_sitting_chair: Y, h_walk_stand_still_ease: N, h_bend_forward: N, h_walking_claudication: N,
      h_ankle_injury: N, h_groin_pain: N, h_no_pain_seated: N, h_bilateral: N, st_slr_helper: N, h_age_over_65: N,
      h_age_45: N, h_age_50: N, h_pain_below_knee: Y, h_many_places_both_sides: N, h_pain_3_months: N,
      h_pain_disproportionate: N, h_leg_numbness: N, h_bone_health: N, h_leg_tingling: N, h_leg_burning: N,
      h_leg_shooting: Y, p_tingling: N, p_buzzing: N, p_numb: N, p_heavy_weak: N, p_position: Y, p_stretch: Y,
      p_repetitive: N, p_activity_rest: N, p_night_rest: N, p_injury: N, p_burning: N, p_spreading: N,
      p_one_spot: Y, p_movement_eases: N, h_recent_surgery: N, h_cough_sneeze: N, p_flexion_worse: Y,
      p_shooting: Y, p_sudden_severe: N, h_back_movement: Y, h_pregnancy: N, h_widespread_pain: N,
      h_fatigue_sleep: N, h_severe_leg_pain: Y, h_improve_seated: N, h_worse_standing: N, h_diabetes: N,
      p_light_touch: N, h_hip_stairs: N, h_limp: N, h_back_night_wakes: N, h_morning_stiff_long: N,
      h_back_onset_young: N, h_back_exercise_better: N, h_pfcn_location: Y, h_pfcn_avoid_sitting: N,
      h_hamstring_injury: N, st_pfcn_skin: N, h_hip_weight_pain: N, st_scn_tender_self: N,
      st_scn_reproduce_self: Y, st_piriformis_press_self: Y,
    },
  },
  {
    // Pre-eruptive shingles: no rash yet, so the rash check counts against. The thoracic root until
    // shingles got checks for feeling unwell beforehand, painful light touch and age 50 or over (2026-11-07).
    name: "Dennis, 63: burning band round the right ribs for 4 days, clothing touch unbearable, no rash yet, unwell beforehand",
    expect: "zoster",
    regions: ["mid_back", "chest_side", "abdomen"],
    facts: {
      h_trunk_band: Y, h_bone_health: N, h_pain_3_months: N, h_chest_surgery_injury: N, h_rib_click: N,
      h_abd_bulge: N, h_back_gradual_onset: N, h_pubic_bone: N, h_many_places_both_sides: N, h_band_rash: N,
      h_back_movement: N, h_groin_adductor: N, p_spreading: N, p_buzzing: N, p_numb: N, p_heavy_weak: N,
      p_position: N, p_injury: N, p_burning: Y, p_light_touch: Y, p_one_spot: N, p_movement_eases: N,
      h_trunk_numbness: Y, h_age_45: Y, h_age_50: Y, h_age_60: Y, h_age_over_65: N, p_sudden_severe: Y,
      p_stretch: N, p_activity_rest: N, p_repetitive: N, p_dull_ache: Y, h_back_sudden_onset: Y,
      h_neck_movement_pain: N, h_widespread_pain: N, h_fatigue_sleep: N, h_back_itch: N, h_recent_surgery: N,
      h_pain_disproportionate: N, h_scapula_winging: N, h_chest_stinging: N, p_tingling: N,
      h_acnes_questionnaire: N, h_unwell_before: Y,
    },
  },
  {
    // A close call (cervical root, carpal tunnel, neuralgic amyotrophy) until the forearm median nerve got
    // checks for palm numbness and a forearm ache on gripping and turning the palm down (2026-11-07).
    name: "Maren, 29: dental hygienist with an ache in the upper front forearm, thumb-side tingling including the palm, no night waking",
    expect: "median_proximal",
    regions: ["forearm_anterior", "hand_median"],
    facts: {
      h_arm_numbness: Y, h_thumb_base_pinch: N, p_night_rest: N, p_light_touch: N, h_pain_3_months: Y,
      h_pain_disproportionate: N, h_joint_hot_swollen: N, h_finger_catching: N, h_repetitive_use: Y, h_age_45: N,
      h_age_50: N, h_age_60: N, h_age_over_65: N, h_finger_knobbly: N, h_fingertip_droop: N, h_palm_cord: N,
      h_many_places_both_sides: N, h_joint_attacks: N, h_many_joints_swollen: N, p_spreading: N, p_injury: N,
      p_tingling: Y, p_buzzing: N, p_numb: Y, p_heavy_weak: Y, p_sudden_severe: N, p_burning: N,
      p_movement_eases: N, h_wrist_thumb_motion: N, h_hand_flick: N, h_symptoms_above_hand: Y, p_dull_ache: Y,
      p_repetitive: Y, h_sudden_severe_arm_pain: N, h_fall_on_hand: N, h_wrist_lump: N, h_widespread_pain: N,
      h_fatigue_sleep: N, h_pregnancy: N, h_neck_movement_pain: N, h_shoulder_stiff: N, h_grip_lateral_elbow: N,
      h_outer_elbow_main: N, h_thumb_base_bump: N, h_snuffbox_tender: N, h_forearm_creak: N,
      h_arm_overhead_symptoms: N, h_hand_colour_change: N, h_pain_regional: N, h_palm_numb: Y,
      h_forearm_grip_ache: Y,
    },
  },
  {
    // Posterior ankle impingement. Not covered (peroneal tendon named) until ankle impingement was added
    // (2026-11-07).
    name: "Curtis, 42: deep back-of-ankle pain pointing the toes after more downhill trail running, Achilles tendon itself painless",
    expect: "ankle_impingement",
    regions: ["achilles", "ankle_lateral"],
    facts: {
      h_symptoms_above_foot: N, h_ankle_injury: N, h_walking_claudication: N, h_bend_forward: N, h_bilateral: N,
      h_age_over_65: N, h_age_45: N, h_age_50: N, h_worse_standing: N, h_leg_worse_than_back: Y,
      h_pain_below_knee: Y, h_leg_numbness: N, p_flexion_worse: N, p_light_touch: N, h_pain_3_months: Y,
      h_pain_disproportionate: N, h_joint_hot_swollen: N, h_bilateral_sole_numbness: N, h_poly_toes_up: N,
      h_ankle_behind_outer: Y, h_age_growing: N, h_ankle_stiff_ache: N, h_heel_back_bump: N,
      h_many_places_both_sides: N, h_joint_attacks: N, h_many_joints_swollen: N, h_leg_burning: N,
      h_peroneal_setting: N, h_achilles_spot: N, p_tingling: N, p_buzzing: N, p_numb: N, p_heavy_weak: N,
      p_position: N, p_activity_rest: N, p_night_rest: N, p_injury: N, p_burning: N, p_spreading: N, p_one_spot: Y,
      p_movement_eases: N, h_recent_surgery: N, p_repetitive: Y, p_throbbing: Y, p_dull_ache: Y,
      p_sudden_severe: N, h_leg_tingling: N, h_leg_shooting: N, h_cough_sneeze: N, h_diabetes: N,
      h_vascular_risk: N, h_leg_cool: N, h_ff_load_increase: Y, h_hip_load_increase: Y, h_severe_leg_pain: N,
      h_widespread_pain: N, h_fatigue_sleep: N, h_achilles_morning: N, h_ankle_end_range: Y,
    },
  },
  {
    // Locked posterior dislocation. A close call (frozen shoulder, calcific tendinitis) until instability got
    // checks for a seizure or electric shock and a changed shoulder shape (2026-11-07).
    name: "Brenda, 58: shoulder blocked since an electric shock 6 weeks ago, flattened at the front with a bump at the back",
    expect: "shoulder_instability",
    regions: ["shoulder"],
    facts: {
      h_shoulder_stiff: Y, h_ac_point: N, st_ac_swelling_self: N, h_shoulder_overhead_or_fall: N,
      h_shoulder_above_elbow: Y, st_shoulder_abduction_relief: N, h_many_places_both_sides: N, h_pain_3_months: N,
      h_neck_movement_pain: N, h_sudden_severe_arm_pain: Y, h_joint_hot_swollen: N, h_scapula_winging: N,
      h_arm_overhead_symptoms: N, h_front_shoulder_pain: N, h_neck_car_accident: N, h_many_joints_swollen: N,
      h_age_45: Y, h_age_50: Y, h_age_60: N, h_age_over_65: N, p_spreading: N, p_tingling: N, p_buzzing: N,
      p_numb: N, p_heavy_weak: N, p_position: N, p_activity_rest: N, p_injury: Y, p_sudden_severe: N, p_burning: N,
      p_light_touch: N, p_one_spot: N, p_movement_eases: N, h_arm_numbness: N, p_dull_ache: Y, p_heat_eases: N,
      h_both_shoulders_ache: N, h_shoulder_repetitive_onset: N, h_repetitive_use: N, h_widespread_pain: N,
      h_fatigue_sleep: N, h_joint_attacks: N, h_pain_disproportionate: N, h_fall_on_hand: N,
      h_shoulder_shock_seizure: Y, h_shoulder_shape: Y,
    },
  },
  {
    // Anterolateral ankle impingement. Not covered (ankle sprain named) until ankle impingement was added
    // (2026-11-07).
    name: "Tariq, 24: catching pain in front of the outer ankle bone 6 weeks after a sprain, worse squatting and pivoting",
    expect: "ankle_impingement",
    regions: ["ankle_lateral"],
    facts: {
      h_symptoms_above_foot: N, h_ankle_injury: Y, h_ankle_rolled_in: Y, h_ankle_cant_weight: N,
      h_walking_claudication: N, h_bend_forward: N, h_bilateral: N, h_age_over_65: N, h_age_45: N, h_age_50: N,
      h_worse_standing: N, h_leg_worse_than_back: Y, h_pain_below_knee: Y, h_leg_numbness: N, p_flexion_worse: N,
      h_joint_hot_swollen: N, p_light_touch: N, h_pain_3_months: N, h_pain_disproportionate: N,
      st_sens_lateral_foot: N, h_bilateral_sole_numbness: N, h_ankle_behind_outer: N, h_ankle_stiff_ache: N,
      h_many_places_both_sides: N, h_joint_attacks: N, h_many_joints_swollen: N, h_poly_toes_up: N,
      h_leg_burning: N, p_spreading: N, p_injury: Y, h_peroneal_setting: N, p_tingling: N, p_buzzing: N, p_numb: N,
      p_heavy_weak: N, p_position: N, p_activity_rest: N, p_night_rest: N, p_burning: N, p_one_spot: Y,
      p_movement_eases: N, h_recent_surgery: N, p_stabbing: Y, h_age_growing: N, p_sudden_severe: N,
      h_leg_tingling: N, h_leg_shooting: N, h_cough_sneeze: N, h_severe_leg_pain: N, h_widespread_pain: N,
      h_fatigue_sleep: N, h_diabetes: N, h_vascular_risk: N, h_leg_cool: N, p_repetitive: N, h_achilles_spot: N,
      h_heel_back_bump: N, h_ankle_end_range: Y, h_ankle_catching: Y, h_ankle_lingering: Y,
    },
  },
  {
    // Hip OA (60%) until the hip-rotation self-test (usual for hip OA), the backward-stretch check and an
    // always-asked knee-lift question were added for the hip flexor tendon (2026-11-07).
    name: "Valerie, 67: front hip and groin ache on stairs and lifting the knee, hip turns inward freely and painlessly",
    expect: "iliopsoas",
    regions: ["groin", "anterior_thigh"],
    facts: {
      st_tinel_asis: N, h_walk_stand_still_ease: N, h_leg_burning: N, h_bend_forward: N, h_leg_numbness: N,
      h_walking_claudication: N, h_pregnancy: N, h_tight_clothing: N, h_diabetes: N, h_improve_seated: Y,
      h_bilateral: N, h_hip_stairs: Y, h_age_over_65: Y, h_age_45: Y, h_age_50: Y, h_age_60: Y,
      st_squat_posterior: N, st_psis_tender: N, h_leg_worse_than_back: Y, h_pain_below_knee: N,
      st_adductor_tender_self: N, st_adductor_squeeze_self: N, h_obt_exercise: Y, h_obt_radiate: N,
      st_obt_skin_self: N, h_ii_pain: N, h_ii_sensory: N, st_ii_trigger_self: N, h_many_places_both_sides: N,
      h_pain_3_months: Y, p_tingling: N, p_buzzing: N, p_numb: N, p_heavy_weak: N, p_position: N, p_stretch: Y,
      p_night_rest: N, p_injury: N, p_burning: N, p_light_touch: N, p_spreading: N, p_one_spot: Y,
      p_movement_eases: N, h_recent_surgery: N, h_groin_deep_flexion: Y, h_groin_adductor: N, h_age_growing: N,
      h_bone_health: N, h_joint_hot_swollen: N, h_hip_flexor_lift: Y, h_hip_weight_pain: N,
      h_morning_stiff_long: N, h_groin_pain: Y, p_dull_ache: Y, h_hip_catch: N, p_sudden_severe: N,
      h_leg_tingling: N, h_leg_shooting: N, h_cough_sneeze: N, h_widespread_pain: N, h_fatigue_sleep: N,
      h_back_gradual_onset: N, h_pubic_bone: N, h_avn_risk: N, h_hip_load_increase: N, h_thigh_sudden_pull: N,
      h_vascular_risk: N, h_leg_cool: N, h_pain_sitting_chair: N, h_severe_leg_pain: N, p_repetitive: N,
      st_hip_rotation_self: N, h_hip_extension_stretch: Y,
    },
  },
  {
    // Non-specific arm pain until the radial tunnel got checks for the spot below the elbow bump and
    // turning the palm up against resistance (2026-11-07).
    name: "Lukas, 36: mechanic with an ache below the outer elbow, the bony bump not tender, worse turning the palm up",
    expect: "radial_tunnel",
    regions: ["elbow_lateral", "forearm_lateral", "forearm_dorsal"],
    facts: {
      h_wrist_thumb_motion: N, h_arm_numbness: N, h_many_places_both_sides: N, h_outer_elbow_main: N,
      st_epicondyle_tender_self: N, p_light_touch: N, h_pain_3_months: Y, h_pain_disproportionate: N,
      h_joint_hot_swollen: N, h_wrist_lump: N, h_joint_attacks: N, h_many_joints_swollen: N, h_forearm_creak: N,
      h_repetitive_use: Y, h_elbow_point_swelling: N, h_fall_on_hand: N, p_spreading: N, p_injury: N,
      p_tingling: N, p_buzzing: N, p_numb: N, p_heavy_weak: N, p_position: N, p_burning: N, p_one_spot: Y,
      p_movement_eases: N, p_dull_ache: Y, p_repetitive: Y, h_age_45: N, h_age_50: N, h_age_60: N,
      h_age_over_65: N, h_sudden_severe_arm_pain: N, p_sudden_severe: N, h_widespread_pain: N, h_fatigue_sleep: N,
      h_neck_movement_pain: N, h_symptoms_above_hand: Y, h_forearm_below_elbow: Y, h_supination_pain: Y,
    },
  },
  {
    // Double crush: a neck root and carpal tunnel together. The best guess names one; the ranking must
    // put the other second (the root leads on probability from the neck-tilt and hand-on-head tests).
    name: "Naomi, 48: neck and arm pain eased with the hand on the head, plus night-time thumb-to-middle-finger tingling eased by shaking",
    expect: "root_cervical",
    second: "cts",
    regions: ["neck", "shoulder", "upper_arm_lateral", "hand_median"],
    facts: {
      st_spurling_self: Y, h_arm_numbness: Y, h_shoulder_stiff: N, h_thumb_base_pinch: N, h_ac_point: N,
      st_ac_swelling_self: N, st_shoulder_abduction_relief: Y, h_shoulder_overhead_or_fall: N, st_phalen_self: Y,
      p_light_touch: N, h_many_places_both_sides: N, h_pain_3_months: Y, h_pain_disproportionate: N, h_age_45: Y,
      h_age_50: N, h_age_60: N, h_age_over_65: N, h_joint_hot_swollen: N, h_neck_movement_pain: Y,
      h_finger_knobbly: N, h_fingertip_droop: N, h_palm_cord: N, h_joint_attacks: N, h_neck_car_accident: N,
      h_shoulder_apprehension: N, h_many_joints_swollen: N, h_finger_catching: N, p_tingling: Y, p_buzzing: N,
      p_numb: Y, p_heavy_weak: N, p_position: Y, p_activity_rest: N, p_night_rest: Y, p_sudden_severe: N,
      p_injury: N, p_burning: N, p_spreading: N, p_one_spot: N, p_movement_eases: N, h_sudden_severe_arm_pain: N,
      h_scapula_winging: N, h_arm_overhead_symptoms: N, h_front_shoulder_pain: N, h_wrist_thumb_motion: N,
      h_hand_flick: Y, h_symptoms_above_hand: Y, p_dull_ache: Y, h_pregnancy: N, h_widespread_pain: N,
      h_fatigue_sleep: N, h_back_gradual_onset: Y, h_hand_colour_change: N, h_both_shoulders_ache: N,
      h_fall_on_hand: N, h_wrist_lump: N, h_thumb_base_bump: N, h_shoulder_dislocated: N,
      h_shoulder_repetitive_onset: N, h_back_onset_young: N, h_back_exercise_better: N, h_back_night_wakes: N,
      h_repetitive_use: N, h_pain_regional: N,
    },
  },
  // Sixth set (user-supplied, 2026-11-07), answered from the descriptions only. Marisol (Pancoast tumour)
  // and Claire (subclavian artery or Takayasu arteritis) are left out: no option covers them.
  {
    // Knee OA, the part the tool covers. The emergency in this story, black tarry stools after leftover naproxen
    // (an upper GI bleed), is outside the tool.
    name: "Gavin, 46: inner knee ache on twisting and ladders, short morning stiffness, years after a knee scope (also black stools after naproxen, which the tool doesn't ask about)",
    expect: "knee_oa",
    regions: ["knee_medial"],
    facts: {
      h_pain_regional: N, h_age_45: Y, h_age_50: N, h_age_60: N, h_age_over_65: N, p_night_rest: Y, p_throbbing: Y,
      h_knee_locking: N, h_knee_swelled_fast: N, h_morning_stiff_long: N, h_fatigue_sleep: Y, h_recent_surgery: N,
      p_injury: N, p_sudden_severe: N, h_knee_pivot_injury: N, h_knee_injury: N, h_walking_claudication: N,
      h_bend_forward: N, h_bilateral: N, h_leg_worse_than_back: Y, h_pain_below_knee: N, h_leg_numbness: N,
      h_knee_activity_pain: Y, h_knee_morning_stiff_short: Y, h_pain_3_months: Y, h_pain_disproportionate: N,
      h_joint_hot_swollen: N, h_knee_inner_below_joint: N, h_many_places_both_sides: N, h_joint_attacks: N,
      h_many_joints_swollen: N, h_kneecap_slipped: N, p_spreading: N, p_tingling: N, p_buzzing: N, p_numb: N,
      p_heavy_weak: N, p_burning: N, p_one_spot: Y, p_light_touch: N, st_sens_medial_knee: N, p_dull_ache: Y,
      p_repetitive: Y, p_position: N, p_stretch: N, p_activity_rest: N,
    },
  },
  {
    // Iliac artery narrowing. Spinal stenosis (35%) until PAD's checks could be asked: pale foot after walking and
    // the same walking distance each time (2026-11-07). PAD wins on the logical fit, not on probability.
    name: "Harlan, 68: one-sided buttock and thigh cramping after half a block, no back pain, foot pale after walking",
    expect: "pad",
    regions: ["buttock", "posterior_thigh"],
    facts: {
      h_foot_pale_walking: Y, h_claud_same_distance: Y, h_pain_regional: N, h_age_over_65: Y, h_age_45: Y,
      h_age_50: Y, h_age_60: Y, h_walking_claudication: Y, h_bilateral: N, h_improve_seated: Y, h_leg_burning: Y,
      p_burning: Y, p_injury: Y, h_pain_below_knee: N, h_pain_sitting_chair: N, h_groin_pain: N,
      h_many_places_both_sides: N, h_pain_3_months: Y, h_hip_weight_pain: N, h_pregnancy: N, p_one_spot: N,
      h_tailbone_point: N, h_back_extension_pain: N, h_thigh_sudden_pull: N, p_tight: Y, p_movement_eases: N,
      h_hip_catch: N, h_bone_health: N, p_spreading: N, p_activity_rest: Y, p_tingling: N, p_buzzing: N, p_numb: N,
      p_position: N, p_stretch: N, p_repetitive: N, p_night_rest: N, h_recent_surgery: N, h_leg_worse_than_back: Y,
      h_worse_standing: N, h_leg_numbness: N, h_leg_tingling: N, h_cough_sneeze: N, h_widespread_pain: N,
      p_dull_ache: N,
    },
  },
  {
    // Anterior interosseous nerve. A close call (neck root, median nerve, neuralgic amyotrophy) until the
    // flat-pinch question was added and the sudden-onset question was opened to the forearm and hand (2026-11-07).
    name: "Talia, 24: climber with a weak flat thumb-and-index pinch, no numbness, after a forearm ache",
    expect: "median_proximal",
    regions: ["forearm_anterior", "hand_median"],
    facts: {
      h_tip_pinch_flat: Y, h_age_45: N, h_age_50: N, h_age_60: N, h_age_over_65: N, h_arm_numbness: N, p_tingling: N,
      p_numb: N, p_heavy_weak: Y, h_repetitive_use: Y, h_symptoms_above_hand: Y, h_thumb_base_pinch: N,
      p_light_touch: N, h_pain_3_months: N, h_pain_disproportionate: N, h_joint_hot_swollen: N, h_finger_catching: N,
      h_fingertip_droop: N, h_palm_cord: N, h_many_places_both_sides: N, h_joint_attacks: N, h_many_joints_swollen: N,
      h_forearm_grip_ache: Y, p_spreading: N, p_injury: N, h_palm_numb: N, p_one_spot: N, p_buzzing: N,
      p_activity_rest: N, p_sudden_severe: N, p_stretch: N, p_burning: N, p_movement_eases: N,
      h_wrist_thumb_motion: N, p_repetitive: Y, h_neck_movement_pain: N, h_hand_flick: N, h_sudden_severe_arm_pain: N,
      p_night_rest: N, p_position: N, h_wrist_lump: N, h_fall_on_hand: N, h_widespread_pain: N,
    },
  },
  {
    // L3-L4 disc with an L4 root. Named as written.
    name: "Derrick, 53: front-of-thigh burning and numbness, knee giving way, absent knee jerk, straight-leg raise painless",
    expect: "root_mid",
    regions: ["low_back", "anterior_thigh"],
    facts: {
      h_age_45: Y, h_age_50: Y, h_age_60: N, h_age_over_65: N, h_cough_sneeze: N, h_leg_numbness: Y, h_leg_burning: Y,
      p_burning: Y, p_numb: Y, p_heavy_weak: Y, h_leg_worse_than_back: Y, h_pain_below_knee: N, p_injury: Y,
      h_back_gradual_onset: N, h_walking_claudication: N, h_bend_forward: N, st_slr_helper: N, h_groin_pain: N,
      h_bilateral: N, h_many_places_both_sides: N, h_pain_3_months: N, h_pregnancy: N, h_bone_health: N,
      st_sens_anterior_thigh: Y, st_sit_to_stand: Y, h_hip_weight_pain: N, h_age_growing: N, p_activity_rest: N,
      p_one_spot: N, p_movement_eases: N, h_recent_surgery: N, h_hip_catch: N, h_hip_flexor_lift: N,
      h_leg_shooting: N, p_sudden_severe: N, h_widespread_pain: N, h_severe_leg_pain: N,
    },
  },
  {
    // Postpartum rheumatoid arthritis. Named as written.
    name: "Nadia, 34: thumb-base pain getting worse despite a splint, warm and puffy, a trigger finger on the other hand, 90 minutes of morning stiffness in both wrists",
    expect: "inflammatory_arthritis",
    regions: ["wrist_radial", "hand_dorsal_radial", "hand_ulnar"],
    facts: {
      h_pain_regional: Y, h_repetitive_use: N, h_age_45: N, h_age_50: N, h_age_60: N, h_age_over_65: N,
      h_morning_stiff_long: Y, h_finger_catching: Y, h_wrist_thumb_motion: Y, h_thumb_base_pinch: Y,
      h_joint_hot_swollen: Y, h_pregnancy: Y, p_injury: N, h_fall_on_hand: N, h_symptoms_above_hand: N,
      h_arm_numbness: N, h_thumb_base_bump: N, p_light_touch: N, h_pain_3_months: Y, h_pain_disproportionate: N,
      h_preceding_infection: N, h_eyes_red: N, h_forearm_creak: N, h_palm_cord: N, h_wrist_lump: N,
      h_fingertip_droop: N, h_arm_overhead_symptoms: N, h_many_places_both_sides: Y, h_joint_attacks: N, h_fever: N,
      h_septic_risk: N, h_pain_moves: N, h_skin_spots: N, h_palm_pressure: N, p_tingling: N, p_buzzing: N, p_numb: N,
      p_heavy_weak: N, p_repetitive: Y, p_activity_rest: N, p_burning: N, p_one_spot: Y, p_movement_eases: Y,
      p_sudden_severe: N, h_sudden_severe_arm_pain: N, h_widespread_pain: N,
    },
  },
  {
    // Common peroneal nerve at the fibular head. A close call with the lumbar roots until the outer-knee tapping
    // and leg-crossing questions were added and peroneal counted tingling (2026-11-07).
    name: "Kenji, 41: runner with a constant outer-shin ache, top-of-foot tingling when crossing his legs, a zing below the outer knee",
    expect: "peroneal",
    regions: ["shin_anterior", "foot_dorsum"],
    facts: {
      h_leg_cross_tingle: Y, h_fibular_head_tingle: Y, h_age_45: N, h_age_50: N, h_age_60: N, h_age_over_65: N,
      p_tingling: Y, p_numb: Y, h_leg_numbness: Y, h_leg_tingling: Y, p_position: Y, p_activity_rest: N,
      p_night_rest: Y, p_repetitive: N, p_injury: N, h_peroneal_setting: Y, h_walking_claudication: N,
      h_bend_forward: N, h_no_pain_seated: N, h_bilateral: N, h_leg_worse_than_back: Y, h_ankle_injury: N,
      h_ff_load_increase: Y, h_pain_below_knee: Y, p_flexion_worse: N, h_severe_leg_pain: N, p_light_touch: N,
      h_pain_3_months: N, h_pain_disproportionate: N, h_leg_burning: N, h_joint_hot_swollen: N,
      h_bilateral_sole_numbness: N, h_shin_long_stretch: N, h_ff_bone_point: N, h_big_toe_tender: N,
      h_big_toe_bump: N, h_big_toe_bend: N, h_poly_toes_up: N, h_leg_exercise_tight: N, h_ankle_end_range: N,
      h_ankle_stiff_ache: N, h_many_places_both_sides: N, p_stretch: N, p_burning: N, p_spreading: N, p_one_spot: Y,
      h_cough_sneeze: N, h_recent_surgery: N, h_many_joints_swollen: N, h_ankle_catching: N, p_dull_ache: Y,
      h_diabetes: N, h_leg_shooting: N, p_sudden_severe: N, h_widespread_pain: N, p_heavy_weak: Y,
    },
  },
  {
    // Pelvic insufficiency fracture. Named as written, on the logical fit (stenosis leads on probability).
    name: "Ruth, 76: groin and thigh pain on standing, osteoporosis, pelvic radiation, hip turning painless",
    expect: "hip_stress_fracture",
    regions: ["groin", "anterior_thigh"],
    facts: {
      h_age_over_65: Y, h_age_45: Y, h_age_50: Y, h_age_60: Y, h_hip_weight_pain: Y, h_limp: Y, h_bone_health: Y,
      p_injury: N, h_leg_numbness: N, st_hip_rotation_self: N, h_groin_pain: Y, p_dull_ache: Y, h_leg_burning: N,
      h_bend_forward: N, h_pregnancy: N, h_walking_claudication: Y, h_bilateral: N, h_worse_standing: Y,
      h_improve_seated: Y, h_obt_radiate: N, h_ii_pain: N, h_ii_sensory: N, h_many_places_both_sides: N,
      h_pain_3_months: N, p_tingling: N, p_buzzing: N, p_numb: N, p_heavy_weak: N, p_position: N, p_stretch: N,
      p_burning: N, p_light_touch: N, p_spreading: N, p_one_spot: Y, p_movement_eases: N, h_knee_oa_history: N,
      h_recent_surgery: N, h_groin_deep_flexion: N, h_groin_adductor: N, h_hip_catch: N, h_hip_flexor_lift: N,
      h_joint_hot_swollen: N, h_hip_load_increase: N, h_leg_tingling: N, h_leg_shooting: N, h_cough_sneeze: N,
      p_sudden_severe: N, h_morning_stiff_long: N, h_widespread_pain: N, h_tight_clothing: N, h_diabetes: N,
      h_obt_exercise: N, h_thigh_sudden_pull: N, h_age_growing: N,
    },
  },
  {
    // Suprascapular nerve at the spinoglenoid notch. SLAP tear until the suprascapular nerve got its first checks:
    // weak turning outward and a hollow shoulder blade (2026-11-07).
    name: "Omar, 29: tennis player with a deep ache behind the shoulder, weak turning outward, hollow shoulder blade",
    expect: "suprascapular",
    regions: ["shoulder", "scapula"],
    facts: {
      h_shoulder_er_weak: Y, h_shoulder_blade_hollow: Y, h_pain_regional: N, h_age_45: N, h_age_50: N, h_age_60: N,
      h_age_over_65: N, p_dull_ache: Y, p_heavy_weak: Y, h_shoulder_overhead_or_fall: Y, p_injury: N,
      h_shoulder_stiff: N, h_ac_point: N, h_arm_lift_weak: N, h_shoulder_above_elbow: Y, h_many_places_both_sides: N,
      h_pain_3_months: Y, h_scapula_winging: N, h_neck_movement_pain: N, h_joint_hot_swollen: N,
      h_sudden_severe_arm_pain: N, h_many_joints_swollen: N, h_front_shoulder_pain: N, h_back_itch: N,
      h_neck_car_accident: N, h_shoulder_apprehension: N, p_spreading: N, h_shoulder_shock_seizure: N, p_tingling: N,
      p_buzzing: N, p_numb: N, p_sudden_severe: N, p_stretch: Y, p_night_rest: N, p_burning: N, p_light_touch: N,
      p_one_spot: N, p_movement_eases: N, h_arm_numbness: N, p_repetitive: Y, h_shoulder_repetitive_onset: Y,
      h_shoulder_dislocated: N, h_widespread_pain: N, st_painful_arc_self: N,
    },
  },
];

// The answers after a full interview: asked questions answered from the facts, "unsure"
// otherwise, plus what follows from them.
function answersAfter(p: Patient): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (let i = 0; i < 100; i++) {
    const next = nextFinding(db, answers, p.regions);
    if (next.done) break;
    answers[next.finding.id] = p.facts[next.finding.id] ?? "unsure";
  }
  return withImplied(db, answers, p.regions);
}

function interview(p: Patient): { guess: BestGuess; ranking: string[] } {
  const view = restrictToRegions(db, p.regions);
  const full = answersAfter(p);
  const post = posterior(view, full);
  const fits = logicalFit(view, p.regions, full);
  return { guess: bestGuess(post, fits), ranking: judgementRanking(post, fits).map((o) => o.id) };
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
      const { guess: g, ranking } = interview(p);
      if (p.closeOk && g.kind === "close") expect(g.ids).toContain(p.expect);
      else expect(named(g)).toBe(p.expect);
      if (p.second) expect(ranking[1]).toBe(p.second);
    });
  }
});

// The same-day notice (display only): fever with a hot swollen joint (Peyton), or a still-growing
// child limping with hip, thigh or knee pain (Noah). No other described patient triggers it.
describe("described patients: the same-day joint notice", () => {
  for (const p of patients) {
    const expected = p.name.startsWith("Peyton") ? "hot" : p.name.startsWith("Noah") ? "child" : "none";
    it(`${p.name.split(":")[0]}: ${expected}`, () => {
      const a = answersAfter(p);
      const shown = hotJointWithFever(a) ? "hot" : childWithLimp(a, p.regions) ? "child" : "none";
      expect(shown).toBe(expected);
    });
  }
});
