import { useMemo, useState } from "react";
import {
  computePriors,
  evidenceTrail,
  OTHER,
  pooled,
  posterior,
  restrictToRegions,
  studiesDisagree,
  unscorableHypotheses,
} from "../engine/bayes";
import type { Answer, ConfirmatoryTest, EvidenceDb, Hypothesis, Region } from "../engine/schema";
import { checklistStatus, logicalFit, type LogicCheck, type LogicFit } from "../engine/logic";
import { FROM_BODY_MAP, type Implied } from "../engine/selection";
import { evidenceSummary, unexplainedWeakness } from "../engine/summary";
import { stressesFor, stressPatterns, type StressPattern } from "../engine/stress";
import { posteriorIntervals } from "../engine/uncertainty";
import { bestGuess, judgementRanking, type BestGuess, type RankedOption } from "../engine/verdict";
import { REGION_LABELS } from "./regions";
import { isThesis, SourceLink } from "./SourceLink";
import { ChestNotice, touchesChest } from "./ChestNotice";
import { HeadNotice, touchesHead } from "./HeadNotice";
import { AbdomenNotice, touchesAbdomen } from "./AbdomenNotice";
import { UrgentJointNotice } from "./UrgentJointNotice";

const pct = (p: number) => (p < 0.01 ? "<1%" : `${Math.round(p * 100)}%`);
const ANSWER_LABEL: Record<Answer, string> = { yes: "Yes", no: "No", unsure: "Not sure / skipped" };
// Confirmatory tests are suggested for any nerve at or above this probability (display rule, not clinical).
const CHECKLIST_THRESHOLD = 0.05;
// Condensed results (display rules, not clinical): only options at or above this probability are
// listed, and only the top few logical fits whose checks fit more than count against them.
const SHOW_THRESHOLD = 0.3;
const MAX_FITS = 3;
// Overall ranking (display rule): the condensed view shows the top band and the next, up to this many.
const MAX_RANKED = 6;
const promptOf = (db: EvidenceDb, id: string) => db.findings.find((f) => f.id === id)?.prompt ?? id;
// Every pain signal travels along nerves; this badge marks options where the problem starts in other tissue.
const TISSUE_LABEL = "Tendon, joint or muscle (nerves only carry the signal)";

interface Props {
  db: EvidenceDb;
  regions: Region[];
  given: Record<string, Answer>;
  implied: Record<string, Implied>;
  doneReason?: string;
  onBack: () => void;
  onReset: () => void;
}

export function Results({ db, regions, given, implied, doneReason, onBack, onReset }: Props) {
  const answers = useMemo(
    () => ({ ...Object.fromEntries(Object.entries(implied).map(([id, i]) => [id, i.answer])), ...given }),
    [given, implied],
  );
  const view = useMemo(() => restrictToRegions(db, regions), [db, regions]);
  const post = useMemo(() => posterior(view, answers), [view, answers]);
  const intervals = useMemo(() => posteriorIntervals(view, answers), [view, answers]);
  const fits = useMemo(() => logicalFit(view, regions, answers), [view, regions, answers]);
  const startingPoint = computePriors(view).get(OTHER)?.p ?? 0;
  const hyp = (id: string) => view.hypotheses.find((h) => h.id === id);
  const unscorable = unscorableHypotheses(view);
  // Pain description grouped first.
  const asked = [...db.findings.filter((f) => f.id in answers)].sort((a, b) => +(b.kind === "profile") - +(a.kind === "profile"));
  const [showAll, setShowAll] = useState(false);
  const shownPost = showAll ? post : post.filter((e) => e.p >= SHOW_THRESHOLD);
  const suggested = post.filter((e) => e.id !== OTHER && e.p >= SHOW_THRESHOLD).map((e) => e.id);
  const topFits = fits.filter((f) => f.fit > f.against).slice(0, MAX_FITS);
  const shownFits = showAll ? fits : topFits;
  const shownUnscorable = showAll ? unscorable : unscorable.filter((h) => topFits.some((f) => f.id === h.id));
  const scorableCount = post.length - 1;
  const hiddenCount = post.length - shownPost.length + fits.length - shownFits.length;

  return (
    <div className="results">
      <section className="card">
        <h1>Your results</h1>
        {doneReason && <p className="muted">The questions stopped because {doneReason}.</p>}
        {touchesChest(regions) && <ChestNotice db={db} />}
        {touchesHead(regions) && <HeadNotice />}
        {touchesAbdomen(regions) && <AbdomenNotice />}
        <UrgentJointNotice db={db} answers={answers} regions={regions} />
        <p className="note">
          These are estimates from published studies, adjusted for your answers. They are not a diagnosis. Many of the
          tests were studied when performed by clinicians, so treat these numbers as a rough guide to discuss with one.
        </p>
      </section>

      <BestGuessCard guess={bestGuess(post, fits)} name={(id) => hyp(id)?.name ?? id} />

      <RankingCard
        ranking={judgementRanking(post, fits)}
        other={post.find((e) => e.id === OTHER)?.p ?? 0}
        showAll={showAll}
        name={(id) => hyp(id)?.name ?? id}
      />

      {(hiddenCount > 0 || showAll) && (
        <p className="no-print center">
          <button className="link small" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
            {showAll ? "Show only the leading options" : `Show all options (${hiddenCount} more)`}
          </button>
        </p>
      )}

      {scorableCount > 0 && (
        <section className="card">
          <h2>Most likely sources</h2>
          <p className="muted">
            {showAll ? "All options with study data." : `Options above ${pct(SHOW_THRESHOLD)} probability.`} Each started
            at an equal {pct(startingPoint)} (no study reports how common they are relative to each other), so a rare cause
            near the top deserves more caution. The thin line is a 95% uncertainty range.
          </p>
          {shownPost.length === 0 && (
            <p className="note small">
              No option reached {pct(SHOW_THRESHOLD)}: your answers don't single out one source with study data.
            </p>
          )}
          <ol className="dist">
            {shownPost.map((e) => (
              <DistRow
                key={e.id}
                db={db}
                view={view}
                answers={answers}
                id={e.id}
                p={e.p}
                lo={intervals.get(e.id)?.lo}
                hi={intervals.get(e.id)?.hi}
                hypothesis={hyp(e.id)}
              />
            ))}
          </ol>
        </section>
      )}

      {db.stress.length > 0 && (
        <StressSection
          db={db}
          answers={answers}
          showAll={showAll}
          leading={[...new Set([...suggested, ...topFits.map((f) => f.id)])].map((id) => hyp(id)!)}
        />
      )}

      {fits.length > 0 && (
        <section className="card">
          <h2>Logical fit</h2>
          <p className="muted">
            A second, separate view, and not a probability: does each option match the way that condition usually shows
            up? {showAll ? "All options, ranked" : `The ${MAX_FITS} best matches, ranked`} by checks that fit minus checks
            against; it includes options with no study data. Checks marked "reasoning" have no published source.
          </p>
          {shownFits.length === 0 && (
            <p className="note small">No option has more checks that fit your answers than count against it.</p>
          )}
          <ol className="dist">
            {shownFits.map((f) => (
              <LogicRow key={f.id} db={db} fit={f} hypothesis={hyp(f.id)!} p={post.find((e) => e.id === f.id)?.p} answers={answers} />
            ))}
          </ol>
        </section>
      )}

      {shownUnscorable.length > 0 && (
        <section className="card">
          <h2>Also possible: no probability available</h2>
          <p className="muted">
            {showAll ? "These options cover areas you marked" : "These leading logical fits"} but have no study comparing
            people with the condition against people with other causes, so no probability can be calculated. Where
            published diagnostic criteria exist, you can check yourself against them below (a match, not a probability).
          </p>
          {shownUnscorable.map((h) => (
            <div key={h.id} className="unscorable">
              <h3>{h.name}</h3>
              <p>{h.description}</p>
              <Mechanism db={db} h={h} />
              <ContextFlagNotes db={db} answers={answers} h={h} />
              <Context db={db} h={h} />
              {h.criteria && <CriteriaChecklist db={db} criteria={h.criteria} answers={answers} />}
              <Confirmatory db={db} tests={db.confirmatory.filter((c) => c.hypotheses.includes(h.id))} />
            </div>
          ))}
        </section>
      )}

      {suggested.length > 0 && (
        <section className="card">
          <h2>Tests that could confirm it</h2>
          <p className="muted">Ask a clinician about these. Accuracy figures come from the studies cited.</p>
          {suggested.map((id) => (
            <div key={id}>
              <h3>{hyp(id)?.name}</h3>
              <Confirmatory db={db} tests={db.confirmatory.filter((c) => c.hypotheses.includes(id))} />
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Your answers</h2>
        <p className="muted">Areas: {regions.map((r) => REGION_LABELS[r]).join(", ")}</p>
        <table className="answers">
          <tbody>
            {asked.map((f) => (
              <tr key={f.id}>
                <td>{f.prompt}</td>
                <td>
                  {ANSWER_LABEL[answers[f.id]]}
                  {implied[f.id] && (
                    <span className="muted">
                      {" "}
                      (not asked:{" "}
                      {implied[f.id].from === FROM_BODY_MAP
                        ? "follows from the areas you marked"
                        : `follows from your answer to "${promptOf(db, implied[f.id].from)}"`}
                      )
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Method />

      <section className="card no-print">
        <div className="nav">
          <button className="secondary" onClick={onBack}>
            ← Change last answer
          </button>
          <button className="primary" onClick={() => window.print()}>
            Print summary for my clinician
          </button>
          <button className="link" onClick={onReset}>
            Start over
          </button>
        </div>
      </section>
    </div>
  );
}

function RankingCard({
  ranking,
  other,
  showAll,
  name,
}: {
  ranking: RankedOption[];
  other: number;
  showAll: boolean;
  name: (id: string) => string;
}) {
  if (ranking.length < 2) return null;
  // Condensed: the first two bands, at most MAX_RANKED options.
  const shown = showAll ? ranking : ranking.filter((o) => o.band <= 2).slice(0, MAX_RANKED);
  const bandLabel = (band: number) => {
    const members = ranking.filter((o) => o.band === band);
    if (members.length === 1) return band === 1 ? "Clearly ahead, both views taken together" : "Next";
    return band === 1 ? "Too close to separate: ordered by logical fit" : "Next, too close to separate: ordered by logical fit";
  };
  return (
    <section className="card">
      <h2>Overall ranking</h2>
      <p className="muted">
        Our judgement across both views, by the same rule as the best guess. Each option starts at its probability; one
        with no study data starts where "something this tool doesn't cover" does. Each reasoning or checklist check in
        the logical fit that matches your answers then doubles that, and each one against halves it (checks from studies
        are already in the probability). Options within a factor of two of each other are grouped, and the logical fit
        orders each group. This is an order, not a new probability.
      </p>
      <table className="ranking">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Option</th>
            <th scope="col">Probability</th>
            <th scope="col">Logical fit</th>
          </tr>
        </thead>
        {[...new Set(shown.map((o) => o.band))].map((band) => (
          <tbody key={band}>
            <tr className="band">
              <th colSpan={4} scope="colgroup">
                {bandLabel(band)}
              </th>
            </tr>
            {shown
              .filter((o) => o.band === band)
              .map((o) => (
                <tr key={o.id} className={o.ruledOut ? "ruled-out" : undefined}>
                  <td>{ranking.indexOf(o) + 1}</td>
                  <td>
                    {name(o.id)}
                    {o.ruledOut && <span className="badge warn small">more against than fit</span>}
                  </td>
                  <td>{o.p === undefined ? <span className="muted">none</span> : pct(o.p)}</td>
                  <td>
                    +{o.fit} / −{o.against}
                  </td>
                </tr>
              ))}
          </tbody>
        ))}
      </table>
      {!showAll && shown.length < ranking.length && (
        <p className="muted small">{ranking.length - shown.length} more options lower down ("Show all options" lists them).</p>
      )}
      {other > 0 && (
        <p className="muted small">Something this tool doesn't cover: {pct(other)} (shown with the probabilities below).</p>
      )}
    </section>
  );
}

function BestGuessCard({ guess, name }: { guess: BestGuess; name: (id: string) => string }) {
  const list = (ids: string[]) => ids.map(name).join(ids.length > 2 ? ", " : " or ").replace(/, ([^,]*)$/, " or $1");
  const disagreeNote = (
    <p className="muted small">
      The logical fit below doesn't agree: more of your answers count against this than fit it. Read both before you
      decide what to ask your clinician.
    </p>
  );
  const setAsideNote = (ids: string[]) => (
    <p className="muted small">
      Set aside: {list(ids)}. Close to these with both views taken together, but more of your answers count against{" "}
      {ids.length > 1 ? "them" : "it"} than fit in the logical fit below.
    </p>
  );
  let body;
  switch (guess.kind) {
    case "leading":
      body = (
        <>
          <p className="guess-name">{name(guess.id)}</p>
          <p className="muted small">
            {guess.p !== undefined ? (
              <>Its probability ({pct(guess.p)}) and the logical fit below, taken together, put it</>
            ) : (
              <>No study gives this option a probability, but it matches clearly more of your answers than the others. Taking both views together puts it</>
            )}{" "}
            at least twice as far ahead as any other option in this tool, and ahead of something the tool doesn't cover.
          </p>
          {guess.logicDisagrees && disagreeNote}
        </>
      );
      break;
    case "close":
      body = (
        <>
          <p className="guess-name">{list(guess.ids)}</p>
          <p className="muted small">
            These are close: taking probability and logical fit together, none is twice as far ahead as the others, and
            none matches clearly more of your answers, so your answers can't separate them. The tests further down could.
          </p>
          {guess.setAside.length > 0 && setAsideNote(guess.setAside)}
        </>
      );
      break;
    case "logic-lead":
      body = (
        <>
          <p className="guess-name">{name(guess.id)}</p>
          <p className="muted small">
            {!guess.scored && <>No study gives this option a probability. </>}
            Taking probability and logical fit together it is level with {list(guess.rivals)}, but in the logical fit below
            it matches clearly more of your answers than {guess.rivals.length > 1 ? "any of them" : "that one"}.
          </p>
        </>
      );
      break;
    case "other":
      body = (
        <>
          <p className="guess-name">Probably something this tool doesn't cover</p>
          <p className="muted small">
            No listed option comes out clearly ahead of "something not covered" ({pct(guess.p)}), even counting the logical
            fit
            {guess.bestListed && <>; the closest listed one your answers don't count against is {name(guess.bestListed)}</>}. A clinician's examination is
            the better next step.
          </p>
        </>
      );
      break;
    case "none":
      body = <p>Your answers don't point to one option over the others.</p>;
  }
  return (
    <section className="card guess">
      <h2>Our best guess</h2>
      {body}
      <p className="muted small">This is a best guess to discuss with a clinician, not a diagnosis.</p>
    </section>
  );
}

function DistRow(props: {
  db: EvidenceDb;
  view: EvidenceDb;
  answers: Record<string, Answer>;
  id: string;
  p: number;
  lo?: number;
  hi?: number;
  hypothesis?: Hypothesis;
}) {
  const { db, view, answers, id, p, lo, hi, hypothesis } = props;
  const [open, setOpen] = useState(false);
  const name = id === OTHER ? "Something not covered by this tool" : hypothesis!.name;
  const fullTrail = id === OTHER ? [] : evidenceTrail(view, answers, id);
  // Answers with no study for this nerve only move it relative to nerves that do have data.
  const trail = fullTrail.filter((t) => t.evidence.length);
  const indirect = fullTrail.length - trail.length;
  const missingCI = trail.some((t) => !t.suppressedBy && t.evidence.some((e) => !e.sensCI || !e.specCI));
  // Any evidence for this hypothesis (answered or not) built by combining different studies.
  const crossStudy =
    id !== OTHER && db.findings.some((f) => f.evidence.some((e) => e.hypothesis === id && e.specFrom));
  const fromThesis =
    id !== OTHER && db.findings.some((f) => f.evidence.some((e) => e.hypothesis === id && isThesis(db, e.sourceId)));
  return (
    <li className="dist-row">
      <div className="dist-head">
        <span className="dist-name">
          {name}
          {hypothesis?.category === "mimic" && <span className="badge small">{TISSUE_LABEL}</span>}
        </span>
        <span className="dist-p">
          {pct(p)}
          {lo !== undefined && hi !== undefined && (
            <span className="dist-ci">
              {" "}
              ({pct(lo)}–{pct(hi)})
            </span>
          )}
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        <div className={id === OTHER ? "fill other" : "fill"} style={{ width: `${p * 100}%` }} />
        {lo !== undefined && hi !== undefined && (
          <div className="ci" style={{ left: `${lo * 100}%`, width: `${Math.max((hi - lo) * 100, 0.5)}%` }} />
        )}
      </div>
      {id === OTHER ? (
        <p className="muted small">
          Other causes of leg, pelvic or arm pain not modelled here (for example circulation problems, muscle strains, or
          nerves not listed), plus listed problems that have no data to score. The tool can't tell these apart.
        </p>
      ) : (
        <>
          <EvidenceBrief view={view} answers={answers} id={id} />
          <WeaknessNote db={db} answers={answers} h={hypothesis!} />
          <ContextFlagNotes db={db} answers={answers} h={hypothesis!} />
          {crossStudy && (
            <p className="small badge warn">
              Low certainty: this estimate combines different studies (cases from one, comparison patients from another),
              and only a "yes" answer counts. The effect used is the largest the data allow.
            </p>
          )}
          {fromThesis && (
            <p className="small badge warn">
              Low certainty: part of this estimate comes from a doctoral thesis, which has not been peer-reviewed.
            </p>
          )}
          {missingCI && (
            <p className="small badge warn">
              The range is likely too narrow: a study used here didn't report confidence intervals, so its uncertainty
              isn't included.
            </p>
          )}
          <p className="muted small">{hypothesis!.description}</p>
          <Mechanism db={db} h={hypothesis!} />
          {fullTrail.length > 0 && (
            <button className="link small" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "Hide" : "Show"} how this was calculated
            </button>
          )}
          {open && trail.length === 0 && (
            <p className="muted small">
              None of your answers has been studied for this nerve. Its probability changed only because other options
              moved.
            </p>
          )}
          {open && trail.length > 0 && (
            <table className="trail">
              <thead>
                <tr>
                  <th>Your answer</th>
                  <th>Effect</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {trail.map((t) => {
                  const ss = pooled(t.evidence);
                  return (
                    <tr key={t.finding.id} className={t.suppressedBy ? "suppressed" : ""}>
                      <td>
                        {t.finding.prompt} <strong>{ANSWER_LABEL[t.answer]}</strong>
                      </td>
                      <td>
                        {t.suppressedBy
                          ? "not counted (overlaps a stronger answer)"
                          : `×${t.likelihoodRatio.toFixed(2)} ${t.likelihoodRatio >= 1 ? "↑" : "↓"}`}
                      </td>
                      <td>
                        sens {ss.sens.toFixed(2)}, spec {ss.spec.toFixed(2)}
                        {t.evidence.length > 1 && <> (pooled from {t.evidence.length} studies)</>}{" "}
                        {t.evidence.map((e, i) => (
                          <span key={i}>
                            <SourceLink db={db} sourceId={e.sourceId} locator={e.locator} />
                            {e.specFrom && (
                              <>
                                {" "}
                                comparison rate from <SourceLink db={db} sourceId={e.specFrom.sourceId} locator={e.specFrom.locator} />
                                <span className="badge warn small">cross-study</span>
                              </>
                            )}{" "}
                          </span>
                        ))}
                        {t.evidence.some((e) => e.adapted) && <span className="badge warn small">adapted</span>}
                        {studiesDisagree(t.evidence) && (
                          <span className="badge warn small" title="The pooled studies' confidence intervals don't overlap">
                            studies disagree
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {indirect > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} className="muted">
                      {indirect} other answer{indirect > 1 ? "s" : ""} had no study for this nerve and only affected it
                      indirectly, through the other options.
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          <Context db={db} h={hypothesis!} />
          {hypothesis!.criteria && p >= CHECKLIST_THRESHOLD && (
            <CriteriaChecklist db={db} criteria={hypothesis!.criteria} answers={answers} />
          )}
        </>
      )}
    </li>
  );
}

function LogicRow(props: {
  db: EvidenceDb;
  fit: LogicFit;
  hypothesis: Hypothesis;
  p?: number;
  answers: Record<string, Answer>;
}) {
  const { db, fit, hypothesis, p, answers } = props;
  const [open, setOpen] = useState(false);
  const order = { fit: 0, against: 1, unknown: 2 } as const;
  const checks = [...fit.checks].sort((a, b) => order[a.verdict] - order[b.verdict]);
  return (
    <li className="dist-row">
      <div className="dist-head">
        <span className="dist-name">
          {hypothesis.name}
          {hypothesis.category === "mimic" && <span className="badge small">{TISSUE_LABEL}</span>}
        </span>
        <span className="dist-p">
          {fit.fit} fit · {fit.against} against
        </span>
      </div>
      <div className="logic-dots" aria-hidden="true">
        {checks.map((c, i) => (
          <span key={i} className={`dot ${c.verdict}`} />
        ))}
      </div>
      <p className="muted small">
        {fit.unknown > 0 && `${fit.unknown} not answered · `}
        Probability: {p === undefined ? "cannot be estimated (no study data)" : pct(p)}
      </p>
      {fit.uncovered.length > 0 && (
        <p className="muted small">
          Doesn't explain your {fit.uncovered.map((r) => REGION_LABELS[r].toLowerCase()).join(", ")} symptoms. That doesn't
          make it less likely: a separate problem could explain them.
        </p>
      )}
      {fit.unexplainedWeakness.length > 0 && hypothesis.sensoryOnly && (
        <p className="muted small">
          Can't explain the weakness you found ({fit.unexplainedWeakness.map((f) => f.summary?.yes ?? f.prompt).join("; ")}),
          because this nerve only carries feeling. Something else may be causing it as well.{" "}
          <SourceLink db={db} sourceId={hypothesis.sensoryOnly.sourceId} locator={hypothesis.sensoryOnly.locator} />
        </p>
      )}
      {fit.unexplained.map((u) => (
        <p key={u.finding.id} className="muted small">
          Doesn't explain: {u.finding.summary?.yes ?? u.finding.prompt}. {u.reason} That doesn't make it less likely: a
          separate problem could be the cause.{" "}
          {u.sourceId ? (
            <SourceLink db={db} sourceId={u.sourceId} locator={u.locator} />
          ) : (
            <span className="badge warn small">reasoning, uncited</span>
          )}
        </p>
      ))}
      <button className="link small" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide" : "Show"} the checks
      </button>
      {open && (
        <table className="trail">
          <thead>
            <tr>
              <th>Check</th>
              <th>Result</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c, i) => (
              <LogicCheckRow key={i} db={db} c={c} answers={answers} />
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

// Stresses on a nerve that this tool has no questions for.
const NOT_ASSESSED = [
  "heat or cold injury (thermal)",
  "toxins, such as alcohol, some medicines or chemotherapy",
  "body-wide conditions such as diabetes, low vitamin B12 or an underactive thyroid (metabolic)",
  "infection, such as shingles",
  "blocked arteries in the leg or arm, which cause pain on walking or use much like reduced blood supply to a nerve",
];

function StressSection({
  db,
  answers,
  leading,
  showAll,
}: {
  db: EvidenceDb;
  answers: Record<string, Answer>;
  leading: Hypothesis[];
  showAll: boolean;
}) {
  const patterns = useMemo(() => stressPatterns(db, answers), [db, answers]);
  const byId = new Map(patterns.map((p) => [p.type.id, p]));
  const anyAnswered = patterns.some((p) => p.fit + p.against > 0);
  const shown = showAll ? patterns : patterns.filter((p) => p.matches);
  return (
    <section className="card">
      <h2>What kind of stress fits your pain?</h2>
      <p className="muted">
        {showAll ? "Every type of stress" : "The types of stress"} that match how you described your pain (pressure,
        stretch, poor blood supply, inflammation, an overloaded tendon, joint or muscle...). Clinical reasoning, mostly
        uncited, and not a probability: it never changes the percentages above.
      </p>
      {!anyAnswered && <p className="note small">You didn't describe your pain, so no pattern can be matched yet.</p>}
      {anyAnswered && shown.length === 0 && (
        <p className="note small">No single type of stress clearly matches how you described your pain.</p>
      )}
      <ol className="dist">
        {shown.map((p) => (
          <StressRow key={p.type.id} db={db} p={p} answers={answers} />
        ))}
      </ol>
      {leading.length > 0 && (
        <>
          <h3>Stresses your leading options usually involve</h3>
          <ul className="stress-leading">
            {leading.map((h) => {
              const linked = stressesFor(db, h.id).filter(({ type }) => showAll || byId.get(type.id)?.matches);
              return (
                <li key={h.id}>
                  <strong>{h.name}:</strong>{" "}
                  {linked.length === 0
                    ? showAll
                      ? "not yet described in this tool."
                      : "none of its usual stresses matches how you described your pain."
                    : linked.map(({ type, condition }) => (
                        <span key={type.id} className={byId.get(type.id)?.matches ? "chip match" : "chip"}>
                          {type.name}
                          {byId.get(type.id)?.matches && " ✓"}{" "}
                          {condition.sourceId ? (
                            <SourceLink db={db} sourceId={condition.sourceId} locator={condition.locator} />
                          ) : condition.reason ? (
                            <span className="muted small" title={condition.reason}>
                              (reasoning)
                            </span>
                          ) : null}
                        </span>
                      ))}
                </li>
              );
            })}
          </ul>
          <p className="muted small">
            ✓ marks a stress that also fits how you described your pain. When the two agree, the explanation hangs
            together. Hover "(reasoning)" for the reason behind an uncited link.
          </p>
        </>
      )}
      <details className="small muted">
        <summary>Limits of this view</summary>
      <ul className="bullets small muted">
        <li>
          Pain words are weak clues on their own. In one study, a burning quality and pain on light touch were not typical
          of a trapped nerve root in the back. <SourceLink db={db} sourceId="scholz2009" locator="Results (Table 2)" /> In
          another, 16% of people whose back pain didn't spread down the leg still described marked burning.{" "}
          <SourceLink db={db} sourceId="forster2013" locator="Table 2 (burning)" />
        </li>
        <li>
          A condition doesn't fix the mechanism: the same pain mechanism can occur in different conditions, and different
          mechanisms in the same condition. <SourceLink db={db} sourceId="scholz2009" locator="Discussion" />
        </li>
        <li>Not assessed by this tool: {NOT_ASSESSED.join("; ")}.</li>
      </ul>
      </details>
    </section>
  );
}

function StressRow({ db, p, answers }: { db: EvidenceDb; p: StressPattern; answers: Record<string, Answer> }) {
  const [open, setOpen] = useState(false);
  const order = { fit: 0, against: 1, unknown: 2 } as const;
  const checks = [...p.checks].sort((a, b) => order[a.verdict] - order[b.verdict]);
  const finding = (id: string) => db.findings.find((f) => f.id === id);
  return (
    <li className="dist-row">
      <div className="dist-head">
        <span className="dist-name">{p.type.name}</span>
        <span className="dist-p">
          {p.fit} fit · {p.against} against
        </span>
      </div>
      <div className="logic-dots" aria-hidden="true">
        {checks.map((c, i) => (
          <span key={i} className={`dot ${c.verdict}`} />
        ))}
      </div>
      <p className="muted small">{p.type.description}</p>
      <button className="link small" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide" : "Show"} the clues
      </button>
      {open && (
        <table className="trail">
          <thead>
            <tr>
              <th>Clue</th>
              <th>Result</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c, i) => (
              <tr key={i}>
                <td>
                  Expected:{" "}
                  {c.clue.anyOf
                    .map((id) => finding(id)?.summary?.[c.clue.answer] ?? finding(id)?.prompt ?? id)
                    .join(c.clue.answer === "yes" ? " or " : " and ")}
                  <span className="muted">
                    {" "}
                    · you:{" "}
                    {c.clue.anyOf
                      .filter((id) => answers[id])
                      .map((id) => ANSWER_LABEL[answers[id]])
                      .join(", ") || "not asked"}
                  </span>
                  <div className="muted">{c.clue.reason}</div>
                </td>
                <td>{clueResult(c, answers)}</td>
                <td>
                  {c.clue.sourceId ? (
                    <SourceLink db={db} sourceId={c.clue.sourceId} locator={c.clue.locator} />
                  ) : (
                    <span className="badge warn small">reasoning, uncited</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

const VERDICT_LABEL = { fit: "✓ fits", against: "✗ against", unknown: "not answered" } as const;

// A "supports" clue answered the other way is neutral, which "not answered" would misdescribe.
function clueResult(c: StressPattern["checks"][number], answers: Record<string, Answer>): string {
  const answered = c.clue.anyOf.some((id) => answers[id] === "yes" || answers[id] === "no");
  return c.verdict === "unknown" && answered ? "no match (not counted against)" : VERDICT_LABEL[c.verdict];
}

function LogicCheckRow({ db, c, answers }: { db: EvidenceDb; c: LogicCheck; answers: Record<string, Answer> }) {
  const a = answers[c.finding.id];
  const label = { evidence: "Study data", criteria: "Published criteria", reasoning: "Reasoning" }[c.basis];
  return (
    <tr>
      <td>
        Expected: {c.finding.summary?.[c.expect] ?? `${c.finding.prompt} ${c.expect}`}
        <span className="muted"> · you: {a ? ANSWER_LABEL[a] : "not asked"}</span>
        {c.basis === "reasoning" && c.note && <div className="muted">{c.note}</div>}
      </td>
      <td>{VERDICT_LABEL[c.verdict]}</td>
      <td>
        {c.sourceId ? (
          <>
            {label} <SourceLink db={db} sourceId={c.sourceId} locator={c.locator} />
          </>
        ) : (
          <span className="badge warn small">reasoning, uncited</span>
        )}
      </td>
    </tr>
  );
}

function CriteriaChecklist({
  db,
  criteria,
  answers,
}: {
  db: EvidenceDb;
  criteria: NonNullable<Hypothesis["criteria"]>;
  answers: Record<string, Answer>;
}) {
  // Items linked to a question the patient already answered start pre-filled.
  const [ans, setAns] = useState<Record<string, "yes" | "no">>(() => {
    const init: Record<string, "yes" | "no"> = {};
    for (const i of criteria.items) {
      const a = i.linkedFinding ? answers[i.linkedFinding] : undefined;
      if (a === "yes" || a === "no") init[i.id] = a;
    }
    return init;
  });
  const answered = criteria.items.filter((i) => ans[i.id]);
  const matched = answered.filter((i) => ans[i.id] === i.matchIf);
  const status = checklistStatus(criteria, (i) => (!ans[i.id] ? "unknown" : ans[i.id] === i.matchIf ? "fit" : "against"));
  const statusText = {
    met: "By the source's rule, the checklist is met as far as you can check it.",
    impossible: "By the source's rule, your answers mean the checklist can't be met.",
    open: "By the source's rule, it isn't settled yet: it depends on items still to answer.",
    pattern: "",
  }[status];
  return (
    <div className="criteria">
      <p className="small">
        <strong>{criteria.title}</strong> <SourceLink db={db} sourceId={criteria.sourceId} locator={criteria.locator} />
      </p>
      {criteria.items.map((i) => (
        <div key={i.id} className="question-row small">
          <p>
            {i.prompt}
            {i.linkedFinding && answers[i.linkedFinding] && answers[i.linkedFinding] !== "unsure" && (
              <span className="muted"> (filled in from your earlier answer)</span>
            )}
            {i.sourceId && (
              <>
                {" "}
                <SourceLink db={db} sourceId={i.sourceId} locator={i.locator} />
              </>
            )}
          </p>
          <div className="choices">
            {(["yes", "no"] as const).map((v) => (
              <button
                key={v}
                className={ans[i.id] === v ? "choice on" : "choice"}
                onClick={() => setAns({ ...ans, [i.id]: v })}
              >
                {v === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
      ))}
      {answered.length > 0 && (
        <p className="note small">
          You match {matched.length} of the {answered.length} criteria you've answered
          {answered.length < criteria.items.length ? ` (${criteria.items.length - answered.length} still to answer)` : ""}.
          {statusText && <> {statusText}</>}
          {criteria.clinicianOnly.length > 0 && <> Only a clinician can check: {criteria.clinicianOnly.join("; ")}.</>}
        </p>
      )}
    </div>
  );
}

const MAX_LISTED = 3;
const pts = (d: number) => {
  const n = Math.round(Math.abs(d) * 100);
  return `${d >= 0 ? "+" : "−"}${n < 1 ? "<1" : n} pts`;
};

function EvidenceBrief({ view, answers, id }: { view: EvidenceDb; answers: Record<string, Answer>; id: string }) {
  const s = useMemo(() => evidenceSummary(view, answers, id), [view, answers, id]);
  const line = (items: typeof s.supporting) =>
    items.length === 0
      ? "none of your answers so far"
      : items
          .slice(0, MAX_LISTED)
          .map((i) => `${i.phrase} (${pts(i.delta)})`)
          .join(" · ") + (items.length > MAX_LISTED ? ` · and ${items.length - MAX_LISTED} more` : "");
  return (
    <div className="brief small">
      <p>
        <span className="brief-up">▲ Supporting:</span> {line(s.supporting)}
      </p>
      <p>
        <span className="brief-down">▼ Against:</span> {line(s.against)}
      </p>
      {Math.abs(s.indirect) >= 0.005 && (
        <p className="muted">
          {s.indirect > 0 ? "Answers that made other options less likely" : "Answers that made other options more likely"}{" "}
          ({pts(s.indirect)})
        </p>
      )}
    </div>
  );
}

function ContextFlagNotes({ db, answers, h }: { db: EvidenceDb; answers: Record<string, Answer>; h: Hypothesis }) {
  const hits = h.contextFlags.filter((c) => answers[c.finding] === c.answer);
  if (hits.length === 0) return null;
  return (
    <>
      {hits.map((c, i) => (
        <p key={i} className="small note">
          <strong>Linked to your history: </strong>
          {c.text} <SourceLink db={db} sourceId={c.sourceId} locator={c.locator} />
        </p>
      ))}
    </>
  );
}

function WeaknessNote({ db, answers, h }: { db: EvidenceDb; answers: Record<string, Answer>; h: Hypothesis }) {
  const weak = unexplainedWeakness(db, answers, h.id);
  if (weak.length === 0 || !h.sensoryOnly) return null;
  return (
    <p className="small badge warn">
      Weakness found ({weak.map((f) => f.summary?.yes ?? f.prompt).join("; ")}). This nerve only carries feeling, so it
      can't explain weakness on its own; a nerve root or the sciatic nerve is more likely to be involved, alone or as
      well. <SourceLink db={db} sourceId={h.sensoryOnly.sourceId} locator={h.sensoryOnly.locator} />
    </p>
  );
}

function Mechanism({ db, h }: { db: EvidenceDb; h: Hypothesis }) {
  if (!h.mechanism) return null;
  return (
    <p className="small mechanism">
      <strong>{h.category === "mimic" ? "Where the pain comes from: " : "How the nerve is affected: "}</strong>
      {h.mechanism.text} <SourceLink db={db} sourceId={h.mechanism.sourceId} locator={h.mechanism.locator} />
    </p>
  );
}

function Context({ db, h }: { db: EvidenceDb; h: Hypothesis }) {
  if (h.context.length === 0) return null;
  return (
    <ul className="context">
      {h.context.map((c, i) => (
        <li key={i}>
          {c.text} <SourceLink db={db} sourceId={c.sourceId} locator={c.locator} />
        </li>
      ))}
    </ul>
  );
}

function Confirmatory({ db, tests }: { db: EvidenceDb; tests: ConfirmatoryTest[] }) {
  if (tests.length === 0) {
    return <p className="muted small">No confirmatory test with a published source is in this database yet. Ask a clinician.</p>;
  }
  return (
    <ul className="confirm">
      {tests.map((t) => (
        <li key={t.id}>
          <strong>{t.name}</strong>: {t.description}{" "}
          <SourceLink db={db} sourceId={t.recommendation.sourceId} locator={t.recommendation.locator} />
          {t.accuracy.map((a, i) => (
            <div key={i} className="small muted">
              Accuracy: {a.sens !== undefined && `sensitivity ${Math.round(a.sens * 100)}%`}
              {a.spec !== undefined && `, specificity ${Math.round(a.spec * 100)}%`} ({a.population}){" "}
              <SourceLink db={db} sourceId={a.sourceId} locator={a.locator} />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Method() {
  return (
    <section className="card">
      <details>
        <summary>How this works, and its limits</summary>
        <ul className="bullets small">
          <li>
            Each answer is weighted by the sensitivity and specificity reported in a published study, using Bayes' rule.
            Where a study only covered one nerve, every other option is assumed to show that finding at the study's
            false-positive rate.
          </li>
          <li>
            Under each result, "Supporting" and "Against" list the answers that moved it most. The points shown are how
            much that result would change if the answer were removed. Answers that only affect other options are grouped
            on a separate line.
          </li>
          <li>
            Answers that measure the same thing (for example "no pain sitting" and "better when sitting") are grouped, and
            only the strongest in each group is counted, to avoid double-counting.
          </li>
          <li>
            Nerves that don't supply any area you marked are left out. This is an anatomical rule, not a probability.
          </li>
          <li>
            "Logical fit" is a count, not a probability, and it never changes the percentages. A studied symptom or test
            counts when studies found it more often in this condition than in others: having it fits. Lacking it counts
            against only if most people with the condition (over half in the study) have it. Criteria answers come from the published checklists. Reasoning
            checks are features a condition usually produces, written without a published source and labelled as such: if
            the feature is absent, the condition is less likely. Symptoms an option can't explain are shown as notes and
            never count against it, since several problems can coexist.
          </li>
          <li>
            Some self-tests only count when positive. For these, the published sensitivity is unreliable, so a negative
            result (or a test done slightly wrong) is ignored rather than allowed to rule a nerve out.
          </li>
          <li>
            Self-tests marked "adapted" were studied when performed by clinicians. Done at home, they are likely less
            accurate than the figures used.
          </li>
          <li>
            The source studies come from specific settings (spine clinics, surgical series, Japanese community and specialty
            care). Your situation may differ.
          </li>
          <li>Pudendal, superior cluneal, obturator, groin and femoral nerves lack accuracy data, so they are listed but not scored.</li>
          <li>
            In the arm, only the neck nerve roots, carpal tunnel and cubital tunnel have usable self-test data. The median
            nerve above the wrist, the ulnar nerve at the wrist, the radial nerves, the thoracic outlet and the shoulder-girdle
            nerves are listed but not scored. The arm history questions only feed the logical fit, not the probabilities.
          </li>
          <li>
            Tendon, joint, disc, bone and muscle causes are scored where a study supports a question or self-test: hip
            arthritis, the sacroiliac joint, outer-hip tendons, the hamstring tendon, a painful disc, the rotator cuff, the
            AC joint, frozen shoulder, De Quervain's, thumb-base arthritis, the wrist cartilage (TFCC), narrowed leg
            arteries, kneecap pain, ACL and meniscal tears, ankle and midfoot fractures, Achilles rupture, plantar heel pain
            and tibial stress fractures, jaw (TMD) pain, headache from the neck and the abdominal wall nerve (ACNES).
            Many others (for example facet joints, hip impingement, shoulder arthritis, tennis elbow, knee osteoarthritis,
            Achilles tendinopathy, ankle sprains, shin splints, compartment syndrome, and trigeminal and occipital
            neuralgia) have no usable test data, so they are listed with a logical fit only. Migraine, tension-type
            headache and problems of the organs inside the chest and belly are not modelled.
          </li>
        </ul>
      </details>
    </section>
  );
}
