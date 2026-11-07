import type { Answer, EvidenceDb, Region } from "../engine/schema";
import { SourceLink } from "./SourceLink";

const CHILD_HIP: Region[] = ["groin", "anterior_thigh", "medial_thigh", "lateral_thigh", "knee_front", "knee_medial"];

// Display rules for a safety notice, never a probability. Like the chest notice it asks nothing
// and stops nothing (red flags were removed by the user's decision); it reacts to answers already
// given. A hot swollen joint with fever, or a still-growing child limping with hip, thigh or knee
// pain, needs to be seen the same day.
export const hotJointWithFever = (answers: Record<string, Answer>) =>
  answers.h_joint_hot_swollen === "yes" && answers.h_fever === "yes";
export const childWithLimp = (answers: Record<string, Answer>, regions: Region[]) =>
  answers.h_age_growing === "yes" && answers.h_limp === "yes" && regions.some((r) => CHILD_HIP.includes(r));

export function UrgentJointNotice({ db, answers, regions }: { db: EvidenceDb; answers: Record<string, Answer>; regions: Region[] }) {
  const hot = hotJointWithFever(answers);
  const child = childWithLimp(answers, regions);
  if (!hot && !child) return null;
  return (
    <div className="note warn" role="note">
      {hot && (
        <p>
          <strong>A hot, swollen joint with fever needs to be seen today.</strong> A joint infection can damage the joint
          within days, and only fluid drawn from the joint can tell it apart from other causes{" "}
          <SourceLink db={db} sourceId="margaretten2007" locator="Abstract, Conclusions" />. Go to an urgent care or
          emergency department today.
        </p>
      )}
      {child && (
        <p>
          <strong>A child who is still growing and limps with hip, thigh or knee pain needs a hip X-ray the same day.</strong>{" "}
          A slipped growth plate at the hip is often missed, especially when the pain is only in the knee, and a delay
          raises the risk of complications <SourceLink db={db} sourceId="pavone2023" locator="Abstract; Misleading Symptoms" />.
        </p>
      )}
    </div>
  );
}
