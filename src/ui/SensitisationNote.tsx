import type { LogicFit } from "../engine/logic";
import type { EvidenceDb } from "../engine/schema";
import type { BestGuess } from "../engine/verdict";
import { SourceLink } from "./SourceLink";

export const SENSITISED = "nociplastic";

// A display rule, never a probability (user decision, 2026-11-06): an oversensitive pain system
// can sit on top of a tissue or nerve problem (IASP criteria), so when the patient-checkable part
// of its checklist is met but the best guess names something else, the results say both rather
// than letting the ranking pick one. Not shown when the named option is itself one of the
// sensitised conditions (the "sensitisation" stress type: fibromyalgia, CRPS), where it would
// only repeat it.
export function sensitisedLayer(db: EvidenceDb, fits: LogicFit[], guess: BestGuess): boolean {
  if (fits.find((f) => f.id === SENSITISED)?.checklist?.status !== "met") return false;
  const family = new Set([SENSITISED, ...(db.stress.find((t) => t.id === "sensitisation")?.conditions ?? []).map((c) => c.hypothesis)]);
  const named = guess.kind === "leading" || guess.kind === "logic-lead" ? [guess.id] : guess.kind === "close" ? guess.ids : [];
  return !named.some((id) => family.has(id));
}

export function SensitisationNote({ db, fits, guess }: { db: EvidenceDb; fits: LogicFit[]; guess: BestGuess }) {
  if (!sensitisedLayer(db, fits, guess)) return null;
  return (
    <section className="card">
      <p className="note" role="note">
        <strong>Your answers also fit an oversensitive pain system.</strong> They meet the part of the published criteria
        for nociplastic pain that you can check yourself: pain for 3 months or more, spread over a region, and a light
        stroke on the skin hurting. This can happen on its own or on top of the problem named above, because more than one
        type of pain can be present at once <SourceLink db={db} sourceId="nijs2021" locator="Section 3 (The Present)" />.
        Only a clinician can judge how much of your pain the named problem explains, so mention both.
      </p>
    </section>
  );
}
