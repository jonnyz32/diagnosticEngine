import type { Answer, EvidenceDb, Region } from "./schema";
import { nextFinding } from "./selection";

export const PHASES = ["intro", "regions", "interview", "results"] as const;
export type Phase = (typeof PHASES)[number];

export interface Session {
  phase: Phase;
  regions: Region[];
  answers: Record<string, Answer>;
  order: string[]; // interview finding ids in the order asked, for "back"
  doneReason?: string;
}

export const initialSession: Session = { phase: "intro", regions: [], answers: {}, order: [] };

export type Action =
  | { type: "start" }
  | { type: "regions"; regions: Region[] }
  | { type: "answer"; id: string; answer: Answer }
  | { type: "back" }
  | { type: "finish" }
  | { type: "reset" };

function advance(db: EvidenceDb, s: Session): Session {
  const next = nextFinding(db, s.answers, s.regions);
  return next.done ? { ...s, phase: "results", doneReason: next.reason } : { ...s, phase: "interview" };
}

export function reduce(db: EvidenceDb, s: Session, a: Action): Session {
  switch (a.type) {
    case "start":
      return { ...initialSession, phase: "regions" };
    case "regions":
      return advance(db, { ...s, regions: a.regions });
    case "answer":
      return advance(db, { ...s, answers: { ...s.answers, [a.id]: a.answer }, order: [...s.order, a.id] });
    case "back": {
      const last = s.order.at(-1);
      if (!last) return { ...s, phase: "regions", doneReason: undefined };
      const answers = { ...s.answers };
      delete answers[last];
      return { ...s, answers, order: s.order.slice(0, -1), phase: "interview", doneReason: undefined };
    }
    case "finish":
      return { ...s, phase: "results", doneReason: "you chose to see results" };
    case "reset":
      return initialSession;
  }
}
