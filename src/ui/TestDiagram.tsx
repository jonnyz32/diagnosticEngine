import type { ReactNode } from "react";

// Simple line drawings for the self-tests. Illustration only: the written instructions are what
// the tests' sources describe. Figures are seen from the side unless the drawing says otherwise.
// Colours come from the theme tokens so they work in light and dark mode.

type P = [number, number];
const pts = (ps: P[]) => ps.map((p) => p.join(",")).join(" ");

/** A stick figure. Limbs are point lists starting at the shoulder (neck) or hip; `*2` limbs are the far side. */
function Fig({
  head,
  neck,
  hip,
  arm,
  arm2,
  leg,
  leg2,
}: {
  head: P;
  neck: P;
  hip: P;
  arm?: P[];
  arm2?: P[];
  leg?: P[];
  leg2?: P[];
}) {
  const limb = (ps: P[] | undefined, from: P, far = false) =>
    ps && <polyline points={pts([from, ...ps])} className={far ? "dg-body dg-far" : "dg-body"} />;
  return (
    <g>
      {limb(arm2, neck, true)}
      {limb(leg2, hip, true)}
      <line x1={neck[0]} y1={neck[1]} x2={hip[0]} y2={hip[1]} className="dg-body" />
      {limb(leg, hip)}
      {limb(arm, neck)}
      <circle cx={head[0]} cy={head[1]} r={7} className="dg-head" />
    </g>
  );
}

/** Thick segment for close-ups of the forearm, hand and fingers. */
const Seg = ({ a, b, w = 10 }: { a: P; b: P; w?: number }) => (
  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="dg-limb" strokeWidth={w} />
);

const Arrow = ({ d }: { d: string }) => <path d={d} className="dg-arrow" markerEnd="url(#dg-head)" />;
/** Where to press, tap or feel. */
const Spot = ({ at }: { at: P }) => (
  <g className="dg-spot">
    <circle cx={at[0]} cy={at[1]} r={4} />
    <circle cx={at[0]} cy={at[1]} r={8} className="dg-ring" />
  </g>
);
/** The helper's hand. */
const Helper = ({ at }: { at: P }) => <ellipse cx={at[0]} cy={at[1]} rx={7} ry={5} className="dg-helper" />;
const Floor = ({ y = 126 }: { y?: number }) => <line x1={8} y1={y} x2={232} y2={y} className="dg-furniture" />;
const Bed = ({ y = 96 }: { y?: number }) => <rect x={20} y={y} width={190} height={14} rx={3} className="dg-furniture" />;
const Table = ({ x = 30, y = 96, w = 120 }: { x?: number; y?: number; w?: number }) => (
  <rect x={x} y={y} width={w} height={8} rx={2} className="dg-furniture" />
);
const Chair = () => (
  <g className="dg-furniture">
    <line x1={92} y1={92} x2={132} y2={92} />
    <line x1={92} y1={92} x2={92} y2={46} />
    <line x1={96} y1={92} x2={96} y2={126} />
    <line x1={128} y1={92} x2={128} y2={126} />
  </g>
);
const Wall = ({ x = 200 }: { x?: number }) => <line x1={x} y1={20} x2={x} y2={126} className="dg-furniture" />;

// Reused poses.
const LYING_BACK = { head: [40, 86] as P, neck: [52, 90] as P, hip: [100, 90] as P, arm: [[76, 92], [98, 93]] as P[] };
const LYING_FRONT = LYING_BACK;
const SIDE_LYING = { head: [40, 84] as P, neck: [52, 88] as P, hip: [100, 88] as P, leg2: [[140, 90], [180, 91]] as P[], arm: [[70, 80], [86, 72]] as P[] };
const SITTING = { head: [104, 36] as P, neck: [104, 46] as P, hip: [104, 88] as P };
const STANDING = { head: [120, 24] as P, neck: [120, 34] as P, hip: [120, 76] as P };

// Leg seen from the side, for the skin-sensation checks: hip (40,40) knee (130,60) ankle (190,60).
function SensoryLeg({ spot }: { spot: P }) {
  return (
    <>
      <Seg a={[30, 40]} b={[130, 58]} w={22} />
      <Seg a={[130, 58]} b={[192, 60]} w={14} />
      <Seg a={[192, 66]} b={[222, 72]} w={9} />
      <Spot at={spot} />
    </>
  );
}

// Forearm and hand from above (the caption says palm up or down), wrist at (130, 70).
function ForearmFlat({ children }: { children?: ReactNode }) {
  return (
    <>
      <Seg a={[20, 72]} b={[130, 70]} w={22} />
      <rect x={130} y={56} width={36} height={30} rx={8} className="dg-hand" />
      {[60, 67, 74, 81].map((y) => (
        <Seg key={y} a={[166, y]} b={[192, y]} w={6} />
      ))}
      <Seg a={[150, 58]} b={[164, 40]} w={6} />
      {children}
    </>
  );
}

const D: Record<string, [() => ReactNode, string]> = {
  st_slr_helper: [
    () => (
    <>
      <Bed />
      <Fig {...LYING_BACK} leg2={[[140, 91], [182, 92]]} leg={[[128, 70], [156, 50]]} />
      <Helper at={[160, 54]} />
      <Arrow d="M 178 84 Q 186 64 170 46" />
    </>
  ),
    "Helper lifts, knee straight",
  ],
  st_sit_to_stand: [
    () => (
    <>
      <Floor />
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [140, 124]]} leg2={[[132, 80], [150, 96]]} arm={[[116, 56], [128, 46]]} />
      <Arrow d="M 160 100 L 160 54" />
    </>
  ),
    "Stand on one leg",
  ],
  st_heel_raise: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[120, 100], [122, 118], [130, 126]]} leg2={[[116, 98], [104, 104]]} arm={[[140, 50], [158, 56]]} />
      <line x1={160} y1={56} x2={196} y2={56} className="dg-furniture" />
      <Arrow d="M 96 120 L 96 92" />
    </>
  ),
    "Rise onto toes ×10",
  ],
  st_heel_walk: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[122, 100], [118, 126], [130, 116]]} leg2={[[114, 100], [104, 126], [116, 118]]} arm={[[132, 54], [140, 70]]} />
      <Arrow d="M 140 122 L 182 122" />
    </>
  ),
    "Walk on heels",
  ],
  st_sens_anterior_thigh: [
    () => <SensoryLeg spot={[86, 40]} />,
    "Front of thigh: stroke lightly, compare sides",
  ],
  st_sens_medial_knee: [
    () => <SensoryLeg spot={[130, 60]} />,
    "Inner knee: stroke lightly, compare sides",
  ],
  st_sens_medial_ankle: [
    () => <SensoryLeg spot={[184, 58]} />,
    "Just above the inner ankle bone",
  ],
  st_sens_great_toe: [
    () => <SensoryLeg spot={[218, 66]} />,
    "Top of the big toe",
  ],
  st_sens_lateral_foot: [
    () => <SensoryLeg spot={[208, 74]} />,
    "Outer edge of the foot (little-toe side)",
  ],
  st_pelvic_compression: [
    () => (
    <>
      <Bed />
      <Fig {...SIDE_LYING} leg={[[134, 76], [168, 86]]} />
      <Helper at={[100, 72]} />
      <Arrow d="M 100 48 L 100 66" />
    </>
  ),
    "Press down on the side of the pelvis, 45 s",
  ],
  st_tinel_asis: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[124, 100], [124, 126]]} leg2={[[116, 100], [116, 126]]} arm={[[136, 56], [128, 78]]} />
      <Spot at={[128, 80]} />
    </>
  ),
    "Tap just below the front hip bone",
  ],
  st_prone_knee_bend: [
    () => (
    <>
      <Bed />
      <Fig {...LYING_FRONT} leg2={[[140, 91], [182, 92]]} leg={[[140, 89], [116, 58]]} />
      <Helper at={[118, 54]} />
      <Arrow d="M 168 74 Q 156 50 130 44" />
    </>
  ),
    "Face down: your helper bends your knee",
  ],
  st_finger_floor: [
    () => (
    <>
      <Floor />
      <Fig head={[70, 92]} neck={[80, 82]} hip={[120, 72]} leg={[[122, 100], [122, 126]]} arm={[[78, 104], [76, 114]]} />
      <line x1={76} y1={114} x2={76} y2={126} className="dg-arrow dg-dash" />
    </>
  ),
    "Your helper measures the gap from your middle fingertip to the floor",
  ],
  st_beatty_home: [
    () => (
    <>
      <Bed />
      <Fig {...SIDE_LYING} leg={[[132, 64], [148, 88]]} />
      <Arrow d="M 132 84 L 132 70" />
    </>
  ),
    "Lift bent knee, hold",
  ],
  st_active_piriformis: [
    () => (
    <>
      <Bed />
      <Fig {...SIDE_LYING} leg={[[140, 72], [178, 82]]} />
      <Helper at={[140, 64]} />
      <Arrow d="M 150 86 L 150 70" />
    </>
  ),
    "Push leg up and out; helper resists",
  ],
  st_seated_piriformis: [
    () => (
    <>
      <Floor />
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [172, 84]]} leg2={[[138, 90], [140, 124]]} arm={[[110, 66], [124, 80]]} />
      <Helper at={[176, 84]} />
      <Arrow d="M 182 96 Q 192 106 176 112" />
    </>
  ),
    "Straighten, move across, turn",
  ],
  st_squat_posterior: [
    () => (
    <>
      <Floor />
      <Fig head={[118, 54]} neck={[116, 64]} hip={[104, 96]} leg={[[130, 100], [118, 126]]} arm={[[136, 76], [156, 76]]} />
      <line x1={158} y1={76} x2={200} y2={76} className="dg-furniture" />
      <Arrow d="M 80 70 L 80 106" />
    </>
  ),
    "Squat slowly",
  ],
  st_single_leg_stance: [
    () => (
    <>
      <Floor />
      <Wall x={170} />
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} leg2={[[132, 96], [126, 110]]} arm={[[146, 56], [168, 60]]} />
    </>
  ),
    "Stand on the painful leg for up to 30 s",
  ],
  st_trochanter_tender: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[110, 56], [116, 80]]} />
      <Spot at={[116, 82]} />
    </>
  ),
    "Bony point on the outside of the hip",
  ],
  st_psis_tender: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[106, 58], [112, 74]]} />
      <Spot at={[114, 72]} />
    </>
  ),
    "Seen from the side: press firmly on the bony bump under the low-back dimple",
  ],
  st_one_finger_psis: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[106, 58], [112, 74]]} />
      <Spot at={[114, 72]} />
    </>
  ),
    "One finger on the worst spot",
  ],
  st_long_stride_walk: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[134, 100], [150, 126]]} leg2={[[108, 100], [88, 126]]} arm={[[128, 56], [132, 74]]} />
      <Arrow d="M 160 112 L 200 112" />
    </>
  ),
    "Long strides: leg reaches far behind",
  ],
  st_ifi_helper: [
    () => (
    <>
      <Bed />
      <Fig {...SIDE_LYING} leg2={[[130, 98], [168, 92]]} leg={[[138, 80], [176, 74]]} />
      <Helper at={[176, 74]} />
      <Arrow d="M 180 64 L 196 50" />
    </>
  ),
    "Lying on the good side: helper takes the top leg backwards, level with the bed",
  ],
  st_pfcn_skin: [
    () => <SensoryLeg spot={[58, 40]} />,
    "Back of thigh below the buttock: stroke lightly",
  ],
  st_shoulder_abduction_relief: [
    () => (
    <>
      <Floor />
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [140, 124]]} arm={[[124, 30], [106, 24]]} />
    </>
  ),
    "Hand rests on head",
  ],
  st_spurling_self: [
    () => (
    <>
      <Fig head={[132, 30]} neck={[120, 46]} hip={[120, 96]} arm={[[106, 70], [104, 92]]} arm2={[[134, 70], [136, 92]]} leg={[[114, 126]]} leg2={[[126, 126]]} />
      <Arrow d="M 112 22 Q 126 10 140 18" />
    </>
  ),
    "Seen from the front: tilt your head toward the painful side, then look up a little",
  ],
  st_arm_squeeze: [
    () => (
    <>
      <Seg a={[90, 20]} b={[92, 110]} w={26} />
      <Helper at={[92, 62]} />
      <Spot at={[92, 62]} />
      <Spot at={[92, 22]} />
    </>
  ),
    "Your helper squeezes the middle of the upper arm, then presses the top and the front of the shoulder; score each 0 to 10",
  ],
  st_phalen_self: [
    () => (
    <>
      <Table y={110} x={40} w={160} />
      <Seg a={[80, 108]} b={[110, 60]} w={14} />
      <Seg a={[160, 108]} b={[130, 60]} w={14} />
      <Seg a={[112, 60]} b={[118, 92]} w={11} />
      <Seg a={[128, 60]} b={[122, 92]} w={11} />
    </>
  ),
    "Backs of hands together, wrists fully bent, 1 min",
  ],
  st_tinel_wrist_self: [
    () => (
    <ForearmFlat>
      <Spot at={[132, 71]} />
    </ForearmFlat>
  ),
    "Palm up: tap the middle of the wrist crease ×10",
  ],
  st_tinel_elbow_self: [
    () => (
    <>
      <Seg a={[30, 40]} b={[110, 70]} w={22} />
      <Seg a={[110, 70]} b={[150, 20]} w={18} />
      <Spot at={[106, 82]} />
    </>
  ),
    "Tap ×10 in the groove behind the inner elbow bone (the funny bone)",
  ],
  st_siref_self: [
    () => (
    <>
      <Fig head={[120, 24]} neck={[120, 34]} hip={[120, 90]} arm={[[160, 34], [150, 62]]} arm2={[[100, 50], [98, 74]]} />
      <Arrow d="M 172 40 Q 178 56 162 66" />
    </>
  ),
    "Seen from the front: arm at shoulder height, elbow fully bent, turned down and back for 5 s",
  ],
  st_painful_arc_self: [
    () => (
    <>
      <Fig {...STANDING} leg={[[124, 100], [128, 126]]} leg2={[[116, 100], [112, 126]]} arm={[[150, 24], [162, 6]]} arm2={[[104, 56], [100, 76]]} />
      <path d="M 156 70 A 44 44 0 0 0 150 16" className="dg-arc" />
    </>
  ),
    "Seen from the front: raise the arm out to the side. Does it hurt in the middle part of the movement?",
  ],
  st_hawkins_helper: [
    () => (
    <>
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[150, 36], [150, 60]]} />
      <Helper at={[150, 40]} />
      <Arrow d="M 160 52 Q 166 70 150 74" />
    </>
  ),
    "Arm forward, elbow bent: your helper turns the hand down",
  ],
  st_neer_helper: [
    () => (
    <>
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[138, 4], [140, -14]]} />
      <Helper at={[112, 44]} />
      <Arrow d="M 140 70 Q 168 40 142 10" />
    </>
  ),
    "Straight arm lifted forward and up",
  ],
  st_what_self: [
    () => (
    <>
      <Table y={86} x={20} w={110} />
      <Seg a={[24, 78]} b={[128, 78]} w={20} />
      <Seg a={[128, 78]} b={[146, 116]} w={20} />
      <Seg a={[140, 92]} b={[164, 84]} w={7} />
      <Arrow d="M 168 96 L 182 80" />
    </>
  ),
    "Wrist bent down: push the thumb outward against your other hand",
  ],
  st_grind_helper: [
    () => (
    <ForearmFlat>
      <Helper at={[160, 42]} />
      <Spot at={[148, 60]} />
      <Arrow d="M 176 30 L 160 46" />
    </ForearmFlat>
  ),
    "Palm down: your helper pushes the thumb into its base and rotates it",
  ],
  st_resisted_knee_flex: [
    () => (
    <>
      <Bed />
      <Fig {...LYING_FRONT} leg2={[[140, 91], [182, 92]]} leg={[[140, 89], [176, 74]]} />
      <Helper at={[180, 70]} />
      <Arrow d="M 196 80 Q 196 60 180 56" />
    </>
  ),
    "Face down, knee a little bent: pull your heel up while your helper resists",
  ],
  st_centralisation_self: [
    () => (
    <>
      <Floor y={110} />
      <Fig head={[54, 50]} neck={[64, 60]} hip={[112, 106]} arm={[[64, 84], [66, 108]]} leg={[[160, 108], [204, 108]]} />
      <Arrow d="M 40 86 L 40 56" />
    </>
  ),
    "Press up, hips stay down, ×10",
  ],
  st_fovea_self: [
    () => (
    <ForearmFlat>
      <Spot at={[128, 82]} />
    </ForearmFlat>
  ),
    "Palm up: press the soft gap next to the bony knob on the little-finger side of the wrist",
  ],
  st_epicondyle_tender_self: [
    () => (
    <>
      <Seg a={[30, 40]} b={[110, 70]} w={22} />
      <Seg a={[110, 70]} b={[190, 70]} w={18} />
      <Spot at={[110, 60]} />
    </>
  ),
    "Bony bump on the outside of the elbow",
  ],
  st_resisted_wrist_ext_self: [
    () => (
    <>
      <Table y={86} x={20} w={110} />
      <Seg a={[24, 78]} b={[128, 78]} w={20} />
      <circle cx={146} cy={78} r={14} className="dg-hand" />
      <Helper at={[148, 62]} />
      <Arrow d="M 168 92 L 168 66" />
    </>
  ),
    "Lift fist up; other hand holds it down",
  ],
  st_adductor_tender_self: [
    () => (
    <>
      <Bed />
      <Fig {...LYING_BACK} leg={[[136, 64], [170, 90]]} leg2={[[140, 91], [182, 92]]} />
      <Spot at={[108, 84]} />
    </>
  ),
    "Tendon at the top of the inner thigh",
  ],
  st_chest_press_self: [
    () => (
    <>
      <Floor />
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [140, 124]]} arm={[[116, 70], [110, 56]]} />
      <Spot at={[108, 56]} />
    </>
  ),
    "Press firmly with the fingertips on the sore part of the chest",
  ],
  st_sc_protraction_self: [
    () => (
    <>
      <Floor />
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [140, 124]]} arm={[[112, 66], [114, 86]]} />
      <Spot at={[110, 48]} />
      <Arrow d="M 100 40 L 122 40" />
    </>
  ),
    "Round both shoulders forward; feel where the collarbone meets the breastbone",
  ],
  st_coracoid_self: [
    () => (
    <>
      <Floor />
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [140, 124]]} arm={[[122, 66], [112, 54]]} />
      <Spot at={[110, 52]} />
    </>
  ),
    "Press into the hollow at the front of the shoulder, below the outer collarbone",
  ],
  st_ac_swelling_self: [
    () => (
    <>
      <Floor />
      <Wall x={200} />
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[118, 56], [118, 74]]} />
      <Spot at={[124, 34]} />
      <Arrow d="M 140 30 L 192 30" />
    </>
  ),
    "Facing a mirror: compare the bumps on top of both shoulders",
  ],
  st_knee_deep_squat: [
    () => (
    <>
      <Floor />
      <Table x={150} y={70} w={70} />
      <Fig head={[120, 58]} neck={[122, 68]} hip={[104, 104]} arm={[[138, 72], [152, 70]]} leg={[[136, 112], [118, 126]]} />
      <Arrow d="M 90 70 L 90 104" />
    </>
  ),
    "Holding on, squat as low as is comfortable, then stand up",
  ],
  st_adductor_squeeze_self: [
    () => (
    <>
      <Bed />
      <Fig {...LYING_BACK} leg={[[136, 64], [170, 90]]} leg2={[[138, 68], [172, 92]]} />
      <circle cx={137} cy={66} r={6} className="dg-hand" />
      <Arrow d="M 150 48 L 140 60" />
    </>
  ),
    "Squeeze knees on a fist",
  ],
  st_obt_stretch_self: [
    () => (
    <>
      <Floor />
      <Fig
        head={[124, 40]}
        neck={[124, 50]}
        hip={[120, 94]}
        arm={[[128, 72], [130, 90]]}
        leg={[[108, 124], [76, 124]]}
        leg2={[[160, 96], [162, 126]]}
      />
      <Spot at={[116, 100]} />
      <Arrow d="M 124 82 L 146 82" />
    </>
  ),
    "Kneel on the painful side's knee and push the hips forward",
  ],
  st_obt_skin_self: [
    () => (
    <>
      <SensoryLeg spot={[44, 44]} />
      <Arrow d="M 52 46 L 118 58" />
    </>
  ),
    "Inner thigh, groin to knee: stroke lightly, compare sides",
  ],
  st_scn_tender_self: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[106, 52], [110, 68]]} />
      <Spot at={[112, 68]} />
    </>
  ),
    "Seen from the side: press along the back rim of the pelvis, working outward from the spine",
  ],
  st_scn_reproduce_self: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[120, 100], [120, 126]]} arm={[[106, 52], [110, 68]]} />
      <Spot at={[112, 68]} />
    </>
  ),
    "Press the most tender spot on the back rim of the pelvis again",
  ],
  st_ii_trigger_self: [
    () => (
    <>
      <Floor />
      <Fig {...STANDING} leg={[[124, 100], [124, 126]]} leg2={[[116, 100], [116, 126]]} arm={[[136, 56], [130, 82]]} />
      <Spot at={[130, 86]} />
    </>
  ),
    "Press just inside and below the bony point at the front of the hip",
  ],
  // Foot from above, toes to the right (big toe at the top).
  st_ff_squeeze_self: [
    () => (
    <>
      <Seg a={[40, 72]} b={[150, 72]} w={40} />
      {[56, 64, 72, 80, 88].map((y, i) => (
        <Seg key={y} a={[150, y]} b={[i === 0 ? 182 : 174 - i * 2, y]} w={i === 0 ? 9 : 6} />
      ))}
      <Spot at={[140, 76]} />
      <circle cx={140} cy={76} r={6} className="dg-hand" />
      <Arrow d="M 140 36 L 140 62" />
    </>
  ),
    "Pinch the gap behind two toes: thumb under the sole, index finger on top",
  ],
  st_shetty_helper: [
    () => (
    <>
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [140, 116], [152, 118]]} leg2={[[132, 80], [134, 112]]} arm={[[116, 70], [126, 86]]} />
      <Helper at={[146, 124]} />
      <Arrow d="M 164 96 L 164 116" />
    </>
  ),
    "Sitting, foot off the floor: press down into your helper's hand as if stepping",
  ],
  // Lower leg and foot from the side, outer ankle bone at (186, 60).
  st_ottawa_bone_self: [
    () => (
    <>
      <Seg a={[30, 48]} b={[180, 58]} w={16} />
      <Seg a={[172, 66]} b={[226, 74]} w={10} />
      <circle cx={186} cy={60} r={5} className="dg-hand" />
      <Spot at={[180, 54]} />
      <Spot at={[206, 74]} />
    </>
  ),
    "Press the back edge and tip of each ankle bone, the bony bump on the inner midfoot and the knob halfway along the outer edge of the foot",
  ],
  st_calf_squeeze_helper: [
    () => (
    <>
      <Bed />
      <Fig {...LYING_FRONT} leg2={[[150, 91], [204, 92]]} leg={[[150, 89], [204, 90], [214, 104]]} />
      <Helper at={[172, 82]} />
      <Arrow d="M 172 56 L 172 74" />
      <Arrow d="M 226 96 Q 230 110 216 114" />
    </>
  ),
    "Face down, feet over the end of the bed: your helper squeezes the calf; watch whether the foot points down",
  ],
  st_windlass_helper: [
    () => (
    <>
      <Floor />
      <rect x={96} y={116} width={48} height={10} className="dg-furniture" />
      <Fig {...STANDING} leg={[[122, 98], [124, 114], [150, 112]]} leg2={[[116, 98], [112, 114]]} arm={[[140, 50], [158, 56]]} />
      <Helper at={[156, 116]} />
      <Arrow d="M 168 126 L 156 104" />
    </>
  ),
    "Standing, toes over the edge of a step: your helper bends your big toe upward",
  ],
  st_shin_focal_self: [
    () => (
    <>
      <Floor />
      <Chair />
      <Fig {...SITTING} leg={[[138, 88], [140, 124]]} arm={[[120, 70], [136, 104]]} />
      <Spot at={[138, 106]} />
      <Arrow d="M 150 92 L 150 120" />
    </>
  ),
    "Press along the inner back edge of the shin bone; is the tender part an inch or less?",
  ],
  st_heel_percussion_helper: [
    () => (
    <>
      <Bed />
      <Fig {...LYING_BACK} leg2={[[140, 91], [182, 92]]} leg={[[140, 86], [190, 78]]} />
      <Helper at={[180, 70]} />
      <Helper at={[206, 78]} />
      <Arrow d="M 226 78 L 212 78" />
    </>
  ),
    "Your helper lifts the straight leg a little and strikes the bottom of the heel with a flat palm",
  ],
  // Head seen from behind, skull base at y 76.
  st_gon_tender_self: [
    () => (
    <>
      <ellipse cx={120} cy={50} rx={36} ry={42} className="dg-hand" />
      <Seg a={[120, 92]} b={[120, 126]} w={26} />
      <line x1={92} y1={76} x2={148} y2={76} className="dg-furniture" />
      <Spot at={[134, 82]} />
      <Spot at={[106, 82]} />
    </>
  ),
    "From behind: press two finger-widths out from the middle, just below the skull, on each side",
  ],
};

export function hasDiagram(findingId: string): boolean {
  return findingId in D;
}

export function TestDiagram({ findingId }: { findingId: string }) {
  const entry = D[findingId];
  if (!entry) return null;
  const [draw, caption] = entry;
  return (
    <figure className="diagram">
      <svg viewBox="0 -20 240 160" aria-hidden="true">
        <defs>
          <marker id="dg-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrowhead" />
          </marker>
        </defs>
        {draw()}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
