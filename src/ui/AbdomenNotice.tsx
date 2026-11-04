import type { Region } from "../engine/schema";

export const touchesAbdomen = (regions: Region[]) => regions.includes("abdomen");

// Safety notice for the belly, like the chest notice: nothing is asked and nothing stops.
// Only abdominal wall causes are modelled; the organs inside are not.
export function AbdomenNotice() {
  return (
    <div className="note warn" role="note">
      <strong>Belly pain usually comes from the organs inside, which this tool doesn't check.</strong> It only looks at
      the nerves, muscles and wall of the belly. Get urgent medical help for severe or worsening belly pain, pain with
      fever, vomiting, blood in your vomit or stool, a hard swollen belly, pain in pregnancy, or a lump in the groin or
      belly that is painful, hard and won't go back in.
    </div>
  );
}
