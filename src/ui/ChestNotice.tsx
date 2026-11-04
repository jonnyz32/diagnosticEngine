import type { EvidenceDb, Region } from "../engine/schema";
import { SourceLink } from "./SourceLink";

const CHEST: Region[] = ["chest_front", "chest_side"];

export const touchesChest = (regions: Region[]) => regions.some((r) => CHEST.includes(r));

// Safety notice for the chest regions. Not a red-flag check (those were removed by the user's
// decision): nothing is asked and nothing stops. It states what the tool does not cover.
export function ChestNotice({ db }: { db?: EvidenceDb }) {
  return (
    <div className="note warn" role="note">
      <strong>Chest pain can come from the heart, lungs, a major blood vessel or the gut.</strong> This tool doesn't
      check for any of those. Chest pain spreading to one or both arms makes a heart attack more likely
      {db && (
        <>
          {" "}
          <SourceLink db={db} sourceId="panju1998" locator="Abstract" />
        </>
      )}
      . If you have chest pain now that is severe, crushing or pressing, or comes with breathlessness, sweating, feeling
      sick or faint, call emergency services now. Don't use this tool instead of being checked.
    </div>
  );
}
