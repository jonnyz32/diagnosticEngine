import { useEffect, useMemo, useReducer } from "react";
import { loadEvidence } from "./engine/db";
import { initialSession, PHASES, reduce, type Action, type Session } from "./engine/session";
import { impliedAnswers, nextFinding } from "./engine/selection";
import { Results } from "./ui/Results";
import { Intro, QuestionScreen, RegionScreen } from "./ui/Screens";

const db = loadEvidence();
const STORAGE_KEY = "nerve-engine-session-v1";

function restore(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? { ...initialSession, ...JSON.parse(raw) } : initialSession;
    // A session saved in a phase that no longer exists (e.g. the removed red-flag or pain-description screen) starts over.
    return PHASES.includes(saved.phase) ? saved : initialSession;
  } catch {
    return initialSession;
  }
}

export function App() {
  const [s, dispatch] = useReducer((st: Session, a: Action) => reduce(db, st, a), undefined, restore);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable; session just won't persist */
    }
    window.scrollTo(0, 0);
  }, [s]);

  const next = useMemo(
    () => (s.phase === "interview" ? nextFinding(db, s.answers, s.regions) : null),
    [s.phase, s.answers, s.regions],
  );
  const implied = useMemo(() => impliedAnswers(db, s.answers, s.regions), [s.answers, s.regions]);

  return (
    <>
      <header className="topbar">
        <span className="brand">Pain Source Navigator</span>
        <span className="disclaimer">Educational prototype, not a diagnosis</span>
      </header>
      <main>
        {s.phase === "intro" && <Intro onStart={() => dispatch({ type: "start" })} />}
        {s.phase === "regions" && <RegionScreen initial={s.regions} onDone={(regions) => dispatch({ type: "regions", regions })} />}
        {s.phase === "interview" && next && !next.done && (
          <QuestionScreen
            key={next.finding.id}
            finding={next.finding}
            step={s.order.length + 1}
            followUpName={db.hypotheses.find((h) => h.id === next.finding.followUp?.hypothesis)?.name}
            onAnswer={(answer) => dispatch({ type: "answer", id: next.finding.id, answer })}
            onBack={() => dispatch({ type: "back" })}
            onFinish={() => dispatch({ type: "finish" })}
          />
        )}
        {(s.phase === "results" || next?.done) && (
          <Results
            db={db}
            regions={s.regions}
            given={s.answers}
            implied={implied}
            doneReason={s.doneReason ?? (next?.done ? next.reason : undefined)}
            onBack={() => dispatch({ type: "back" })}
            onReset={() => dispatch({ type: "reset" })}
          />
        )}
      </main>
    </>
  );
}
