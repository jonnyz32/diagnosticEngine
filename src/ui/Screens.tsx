import { useState } from "react";
import type { Answer, Finding, Region } from "../engine/schema";
import { BodyMap } from "./BodyMap";
import { ChestNotice, touchesChest } from "./ChestNotice";
import { HeadNotice, touchesHead } from "./HeadNotice";
import { AbdomenNotice, touchesAbdomen } from "./AbdomenNotice";
import { TestDiagram } from "./TestDiagram";

export function Intro({ onStart }: { onStart: () => void }) {
  return (
    <section className="card">
      <h1>What might be causing your back, leg, foot, neck, arm, chest, head or jaw pain?</h1>
      <p>
        This tool asks about your symptoms and guides you through a few simple self-tests. It then estimates where the
        problem most likely starts, and which tests a clinician could use to confirm it. That can be a nerve that is
        trapped or irritated, or a tendon, joint or muscle whose pain the nerves simply carry, such as hip arthritis, the
        sacroiliac joint, the shoulder's rotator cuff or tennis elbow.
      </p>
      <ul className="bullets">
        <li>Every probability comes from published diagnostic studies. Each number links to its source.</li>
        <li>Where no study exists, the tool says so instead of guessing.</li>
        <li>Your answers stay on this device.</li>
      </ul>
      <p className="note">
        This is an educational tool, not a diagnosis. It cannot examine you, and most of the studies it relies on used
        examinations by clinicians. Take the printed summary to a doctor or physiotherapist.
      </p>
      <button className="primary" onClick={onStart}>
        Start
      </button>
    </section>
  );
}

export function RegionScreen({ initial, onDone }: { initial: Region[]; onDone: (r: Region[]) => void }) {
  const [sel, setSel] = useState<Region[]>(initial);
  const toggle = (r: Region) => setSel((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  return (
    <section className="card">
      <h2>Where do you feel pain, numbness or tingling?</h2>
      <p>Select every area that applies, on either side. Nerves that don't supply any area you select are left out.</p>
      <BodyMap selected={sel} onToggle={toggle} />
      {touchesChest(sel) && <ChestNotice />}
      {touchesHead(sel) && <HeadNotice />}
      {touchesAbdomen(sel) && <AbdomenNotice />}
      <button className="primary" disabled={sel.length === 0} onClick={() => onDone(sel)}>
        Continue
      </button>
    </section>
  );
}

// Headings for pain-description questions, whose prompts are short phrases.
const PROFILE_HEADINGS: Record<NonNullable<Finding["profileGroup"]>, string> = {
  sensation: "Does it feel like this?",
  pattern: "When does it happen?",
  behaviour: "What makes it better or worse?",
};

export function QuestionScreen({
  finding,
  step,
  followUpName,
  onAnswer,
  onBack,
  onFinish,
}: {
  finding: Finding;
  step: number;
  followUpName?: string;
  onAnswer: (a: Answer) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const isTest = finding.kind === "selftest";
  const adapted = finding.evidence.some((e) => e.adapted);
  return (
    <section className="card">
      <div className="step-meta">
        <span>Question {step}</span>
        {isTest && <span className="badge">Self-test</span>}
        {finding.needsHelper && <span className="badge">Needs a helper</span>}
        {followUpName && <span className="badge">Checking for: {followUpName}</span>}
        {finding.profileGroup && (
          <span className="badge" title="Matched against the types of stress that fit the options still open">
            Describing your pain: doesn't change your percentages
          </span>
        )}
        {finding.evidence.length === 0 && !finding.profileGroup && (
          <span className="badge" title="No study has measured this against other causes">
            Doesn't change your percentages; recorded for your clinician
          </span>
        )}
        {finding.scoreOn === "positive" && (
          <span className="badge" title="A negative or failed attempt can't rule anything out, so it isn't counted">
            Only a positive result counts
          </span>
        )}
        {adapted && (
          <span className="badge warn" title="The source studies used a clinician-performed version of this test">
            Adapted: accuracy may be lower
          </span>
        )}
      </div>
      {isTest && <TestDiagram findingId={finding.id} />}
      {finding.instructions && (
        <ol className="instructions">
          {finding.instructions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {finding.safety && <p className="safety">⚠ {finding.safety}</p>}
      {finding.profileGroup && <p className="muted">{PROFILE_HEADINGS[finding.profileGroup]}</p>}
      <h2 className="prompt">{finding.prompt}</h2>
      {finding.help && <p className="help">{finding.help}</p>}
      <div className="choices big">
        <button className="choice" onClick={() => onAnswer("yes")}>
          Yes
        </button>
        <button className="choice" onClick={() => onAnswer("no")}>
          No
        </button>
        <button className="choice" onClick={() => onAnswer("unsure")}>
          {isTest ? "Couldn't do it / not sure" : "Not sure"}
        </button>
      </div>
      <div className="nav">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <button className="link" onClick={onFinish}>
          Show results now
        </button>
      </div>
    </section>
  );
}
