import type { Region } from "../engine/schema";

const HEAD: Region[] = ["head_back", "temple", "face", "jaw"];

export const touchesHead = (regions: Region[]) => regions.some((r) => HEAD.includes(r));

// Safety notice for the head regions, like the chest notice: nothing is asked and nothing stops.
// It states what the tool does not cover (migraine, tension-type headache and serious causes).
export function HeadNotice() {
  return (
    <div className="note warn" role="note">
      <strong>This tool only looks at nerve, joint and muscle causes of head, face and jaw pain.</strong> It doesn't check
      for migraine, tension-type headache, tooth, sinus or eye problems, or serious causes. Call emergency services now
      for a sudden, explosive or worst-ever headache, or headache with weakness, numbness, slurred speech, confusion,
      fever with a stiff neck, or after a head injury. If you are over 50, see a doctor urgently for a new headache,
      scalp tenderness, or jaw pain that comes on with chewing and eases when you stop, or any change in your vision.
    </div>
  );
}
