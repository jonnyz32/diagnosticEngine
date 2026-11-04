import { counts, ownEvidence, posterior } from "./bayes";
import type { Answer, EvidenceDb, Finding } from "./schema";

export interface EvidenceItem {
  finding: Finding;
  answer: Answer;
  phrase: string;
  /** Change in this hypothesis' probability (0-1 scale) caused by this answer. */
  delta: number;
}

export interface EvidenceSummary {
  supporting: EvidenceItem[];
  against: EvidenceItem[];
  /** Combined change from answers that only concern other options (they moved the rest of the field). */
  indirect: number;
}

/**
 * Positive weakness findings that a purely sensory nerve cannot explain. Empty when the
 * hypothesis isn't sensory-only or no weakness was found.
 */
export function unexplainedWeakness(db: EvidenceDb, answers: Record<string, Answer>, hypId: string): Finding[] {
  const h = db.hypotheses.find((x) => x.id === hypId);
  if (!h?.sensoryOnly) return [];
  return db.findings.filter((f) => f.motor && answers[f.id] === "yes");
}

/** Below this (half a percentage point) an answer is not worth listing. */
const MIN_DELTA = 0.005;

const prob = (db: EvidenceDb, answers: Record<string, Answer>, id: string) =>
  posterior(db, answers).find((e) => e.id === id)?.p ?? 0;

/**
 * For one hypothesis: which answers pushed it up or down, and by how much. Each direct
 * answer's effect is measured by recomputing the posterior without it (leave-one-out).
 */
export function evidenceSummary(db: EvidenceDb, answers: Record<string, Answer>, hypId: string): EvidenceSummary {
  const full = prob(db, answers, hypId);
  const answered = db.findings.filter((f) => counts(f, answers[f.id]));
  const isDirect = (f: Finding) => {
    const own = ownEvidence(f, hypId);
    return own.some((e) => !(e.scoreOn === "positive" && answers[f.id] === "no"));
  };
  const direct = answered.filter(isDirect);

  const items: EvidenceItem[] = direct.map((f) => {
    const without = { ...answers };
    delete without[f.id];
    const answer = answers[f.id];
    return {
      finding: f,
      answer,
      phrase: f.summary ? f.summary[answer === "yes" ? "yes" : "no"] : `${f.prompt} ${answer}`,
      delta: full - prob(db, without, hypId),
    };
  });

  const directOnly = Object.fromEntries(direct.map((f) => [f.id, answers[f.id]]));
  const byMagnitude = (a: EvidenceItem, b: EvidenceItem) => Math.abs(b.delta) - Math.abs(a.delta);
  return {
    supporting: items.filter((i) => i.delta >= MIN_DELTA).sort(byMagnitude),
    against: items.filter((i) => i.delta <= -MIN_DELTA).sort(byMagnitude),
    indirect: full - prob(db, directOnly, hypId),
  };
}
