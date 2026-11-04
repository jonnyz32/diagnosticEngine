import type { Region } from "../engine/schema";
import { REGION_GROUPS, REGION_LABELS } from "./regions";

// Simplified front/back outlines of pelvis and leg, of neck and arm, and of the trunk (right side drawn; symptoms apply to either side).
const FRONT: { region: Region; d: string }[] = [
  { region: "groin", d: "M60 40 L100 40 L92 70 L68 70 Z" },
  { region: "perineum", d: "M74 70 L86 70 L84 84 L76 84 Z" },
  { region: "lateral_thigh", d: "M40 50 L58 46 L60 150 L46 150 Z" },
  { region: "anterior_thigh", d: "M58 46 L68 72 L76 86 L74 150 L60 150 Z" },
  { region: "medial_thigh", d: "M76 86 L84 86 L82 150 L74 150 Z" },
  { region: "shin_anterior", d: "M50 160 L80 160 L74 250 L58 250 Z" },
  { region: "foot_dorsum", d: "M56 258 L76 258 L84 274 L54 274 Z" },
  { region: "forefoot", d: "M54 274 L84 274 L88 287 L54 287 Z" },
];
const BACK: { region: Region; d: string }[] = [
  { region: "low_back", d: "M44 10 L116 10 L112 40 L48 40 Z" },
  { region: "buttock", d: "M44 40 L80 40 L80 84 L42 80 Z" },
  { region: "posterior_thigh", d: "M42 84 L80 88 L78 150 L48 150 Z" },
  { region: "calf", d: "M50 160 L80 160 L76 250 L58 250 Z" },
  { region: "foot_sole_lateral", d: "M56 258 L76 258 L79 274 L53 274 Z" },
  { region: "forefoot", d: "M53 274 L79 274 L80 287 L52 287 Z" },
];
// Right arm hanging palm forward: the thumb side is on the left of the front view, the right of the back view.
const ARM_FRONT: { region: Region; d: string }[] = [
  { region: "neck", d: "M88 0 L108 0 L108 22 L88 22 Z" },
  { region: "shoulder", d: "M48 22 L108 22 L100 40 L48 44 Z" },
  { region: "upper_arm_lateral", d: "M48 44 L64 42 L64 110 L50 110 Z" },
  { region: "upper_arm_medial", d: "M64 42 L80 40 L78 110 L64 110 Z" },
  { region: "elbow_lateral", d: "M50 110 L64 110 L64 130 L50 130 Z" },
  { region: "elbow_medial", d: "M64 110 L78 110 L78 130 L64 130 Z" },
  { region: "forearm_lateral", d: "M50 130 L58 130 L56 190 L50 190 Z" },
  { region: "forearm_anterior", d: "M58 130 L70 130 L68 190 L56 190 Z" },
  { region: "forearm_medial", d: "M70 130 L78 130 L76 190 L68 190 Z" },
  { region: "wrist_radial", d: "M50 190 L63 190 L63 204 L50 204 Z" },
  { region: "wrist_ulnar", d: "M63 190 L76 190 L76 204 L63 204 Z" },
  { region: "hand_median", d: "M50 204 L68 204 L66 262 L50 262 L36 236 L46 222 Z" },
  { region: "hand_ulnar", d: "M68 204 L76 204 L80 262 L66 262 Z" },
];
const ARM_BACK: { region: Region; d: string }[] = [
  { region: "neck", d: "M52 0 L72 0 L72 22 L52 22 Z" },
  { region: "scapula", d: "M48 22 L80 22 L78 70 L50 66 Z" },
  { region: "shoulder", d: "M80 22 L112 22 L112 44 L80 40 Z" },
  { region: "upper_arm_medial", d: "M80 40 L96 42 L96 110 L82 110 Z" },
  { region: "upper_arm_lateral", d: "M96 42 L112 44 L110 110 L96 110 Z" },
  { region: "elbow_medial", d: "M82 110 L96 110 L96 130 L82 130 Z" },
  { region: "elbow_lateral", d: "M96 110 L110 110 L110 130 L96 130 Z" },
  { region: "forearm_medial", d: "M82 130 L90 130 L89 190 L84 190 Z" },
  { region: "forearm_dorsal", d: "M90 130 L102 130 L102 190 L89 190 Z" },
  { region: "forearm_lateral", d: "M102 130 L110 130 L110 190 L102 190 Z" },
  { region: "wrist_ulnar", d: "M84 190 L94 190 L94 204 L84 204 Z" },
  { region: "wrist_radial", d: "M94 190 L110 190 L110 204 L94 204 Z" },
  { region: "hand_ulnar", d: "M84 204 L94 204 L94 262 L80 262 Z" },
  { region: "hand_dorsal_radial", d: "M94 204 L110 204 L114 222 L124 236 L110 262 L94 262 Z" },
];

// Trunk from the front and back (outline of the ribcage, either side).
const CHEST_FRONT: { region: Region; d: string }[] = [
  { region: "chest_front", d: "M64 20 L96 20 L96 100 L64 100 Z" },
  { region: "chest_side", d: "M40 26 L64 20 L64 100 L44 108 Z" },
];
const CHEST_BACK: { region: Region; d: string }[] = [
  { region: "upper_back", d: "M60 20 L100 20 L100 66 L60 66 Z" },
  { region: "mid_back", d: "M60 66 L100 66 L100 110 L60 110 Z" },
];

interface Props {
  selected: Region[];
  onToggle: (r: Region) => void;
}

function Figure({
  title,
  shapes,
  selected,
  onToggle,
  viewBox = "30 0 100 290",
}: Props & { title: string; shapes: typeof FRONT; viewBox?: string }) {
  return (
    <figure className="bodymap-figure">
      <svg viewBox={viewBox} role="group" aria-label={`${title} view`}>
        {shapes.map((s) => (
          <path
            key={s.region}
            d={s.d}
            className={selected.includes(s.region) ? "region on" : "region"}
            onClick={() => onToggle(s.region)}
            tabIndex={-1}
          >
            <title>{REGION_LABELS[s.region]}</title>
          </path>
        ))}
      </svg>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

export function BodyMap({ selected, onToggle }: Props) {
  return (
    <div className="bodymap">
      <div className="bodymap-figures" aria-hidden="true">
        <Figure title="Front" shapes={FRONT} selected={selected} onToggle={onToggle} />
        <Figure title="Back" shapes={BACK} selected={selected} onToggle={onToggle} />
        <Figure title="Arm, front" shapes={ARM_FRONT} selected={selected} onToggle={onToggle} viewBox="30 0 100 270" />
        <Figure title="Arm, back" shapes={ARM_BACK} selected={selected} onToggle={onToggle} viewBox="30 0 100 270" />
        <Figure title="Chest" shapes={CHEST_FRONT} selected={selected} onToggle={onToggle} viewBox="30 0 100 130" />
        <Figure title="Upper back" shapes={CHEST_BACK} selected={selected} onToggle={onToggle} viewBox="30 0 100 130" />
      </div>
      <div className="bodymap-chips">
        {REGION_GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend>{g.title}</legend>
            {g.regions.map((r) => (
              <label key={r} className={selected.includes(r) ? "chip on" : "chip"}>
                <input type="checkbox" checked={selected.includes(r)} onChange={() => onToggle(r)} />
                {REGION_LABELS[r]}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
