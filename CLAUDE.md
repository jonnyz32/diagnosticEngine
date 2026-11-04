# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pain Source Navigator (formerly Nerve Pain Navigator): a patient-facing, self-guided React/Vite app (no backend) that ranks which lumbar/pelvic, neck/arm or thoracic nerve, or tendon/joint/muscle problem whose pain the nerves only carry ("mimic" in the schema), best explains a patient's leg, buttock, pelvic, arm, chest or upper-back symptoms, and lists clinician tests that could confirm it. Answers live only in `localStorage`. It is an educational prototype, not a diagnostic device.

## Commands

```
npm run dev                # Vite dev server, http://localhost:5173
npm test                   # vitest run (tests/**/*.test.ts)
npx vitest run tests/engine/bayes.test.ts   # one file
npx vitest run -t "lumbar spinal stenosis"  # one test by name
npm run validate-evidence  # zod schema + referential integrity of evidence/*.json
npm run audit-sources      # network: checks each DOI against OpenAlex by PMID
npm run mine-literature    # network: Europe PMC search per hypothesis → mining/ reports (never edits evidence)
npm run eval-cases         # score against published case reports (dev per case, holdout aggregate only); -- --log appends to cases/RESULTS.md
npm run build              # validate-evidence, then tsc, then vite build
```

There is no linter. `tsc` runs in strict mode with `noUnusedLocals`/`noUnusedParameters`, so unused code fails the build.

## The cite-or-exclude rule (most important constraint)

Every clinical number (sens/spec, CIs, LRs, priors) lives in `evidence/*.json` and must trace to a source in `evidence/sources.json` (PMID/DOI plus `verifiedOn`) with a `locator` (table or abstract section). Never enter a value from memory and never invent a number to fill a gap. If no verifiable source exists, leave it out; the UI shows "cannot be estimated". DOIs typed by hand have been wrong before, so run `audit-sources` after adding sources.

- Exception (user decision, 2026-11-04): a doctoral thesis without a PMID/DOI may be a source, cited by its repository record (`thesis: {institution, url}`). It is warned on by the validator and labelled "thesis" in the UI; use it only where no peer-reviewed source gives the value.
- A patient-performed version of a clinician-studied test must have `performedBy: "clinician"` and `adapted: true`. The validator rejects it otherwise.
- Priors are deliberately `null` (uniform, plus an "other" bucket) because no study reports joint prevalence. Don't "fix" this by mixing prevalences from different populations.
- Every evidence change gets logged in [evidence/CURATION.md](evidence/CURATION.md). That file holds the modelling rules, the extraction log, the known gaps and the papers checked and rejected; read it before touching evidence or scoring.
- `*.pdf` is gitignored. The user supplies full texts (for example `paper1.pdf`, `paper2.pdf`) for extraction.

## Architecture

The data flows `evidence/*.json` → `src/engine/db.ts` (zod parse via `schema.ts` + `checkIntegrity`) → pure engine functions → React UI (`src/ui/`). `scripts/validate-evidence.ts` reuses the same `checkIntegrity`, so a new cross-reference rule only needs adding in `db.ts`.

Engine (`src/engine/`, pure functions over an `EvidenceDb`):
- `bayes.ts`: one-vs-rest posterior. `P(finding | h)` is the sensitivity where a study measured it for `h`; otherwise it is the mean false-positive rate of that finding's studies (excluding `specFrom` borrowed rates). Several studies of one finding for one `h` are combined by `pooled()` (weighted by effective sample size from their CIs); always go through `ownEvidence`/`pooled`, never `evidence.find`. Only the strongest answered finding in each `dependenceGroup` counts. `restrictToRegions` is the anatomical territory gate, a deterministic filter rather than a probability. A hypothesis with no evidence entries is "unscorable".
- `selection.ts`: picks the next question. Order: `alwaysAsk`/`askIf` questions, then `followUp` questions once their hypothesis reaches `minP`, then the highest expected-information-gain question (all history before self-tests). A finding whose answer follows logically from an earlier answer (`impliedBy`) is filled in by `impliedAnswers`/`withImplied` and never asked; it is scored as if answered. An information-only question is skipped once every option it would check has more "against" than "fit" in the logical fit (`ruledOutOptions`; steers questioning only, never a probability). A question must gain at least `MIN_INFORMATION_GAIN_BITS` (0.03) to be asked. Stop rules and other engineering constants are defined here.
- `session.ts`: reducer for the phases intro → regions → interview → results. There is no separate pain-description page (removed 2026-11-04, user request): `kind: "profile"` findings are asked inside the interview by `nextAfterScored` in `selection.ts`, only once the scored questions are done and only when the answer tells the options still in play apart (a logical-fit check for one of them, or an unsettled clue to a stress type some but not all of them involve). The same step first asks every logic or criteria-linked check for an unscored option in play (no information gain would pick them), and stops once that option has more against than fit. Link every new `criteria` item to a question (`linkedFinding`). They don't count toward the question budget.
- `stress.ts`: the "type of stress" view (compression, stretch, ischaemia, inflammation, tissue overload...), built from `evidence/stress.json`. Like `logic.ts`, it counts clues as fit/against/unknown, never yields a probability and must stay out of `bayes.ts`.
- Self-test diagrams: `src/ui/TestDiagram.tsx`, keyed by finding id. A test fails if a self-test has none, so add one with every new self-test.
- Red flags: removed from the app (user decision, 2026-11-03). `evidence/redflags.json` is kept and still validated, but nothing asks or checks it. The chest regions show a fixed safety notice instead (`src/ui/ChestNotice.tsx`): nothing is asked and nothing stops.
- `uncertainty.ts`: seeded Monte Carlo intervals that sample Beta distributions fitted to the reported CIs.
- `summary.ts`: leave-one-out evidence summary per hypothesis, plus the sensory-only "can't explain weakness" note.
- `logic.ts`: the "logical fit" score shown beside the probability, which counts checks as fit, against or unknown and never yields a probability. The checks are studied findings whose "yes" points toward the option (LR+ above 1; a "no" counts against only when sensitivity is above 50%; a "yes" that points away is a note), `logic` items of type `usual` (the condition usually produces a "yes", so a "no" counts against it), and `logic` items of type `supports` (a trigger or relief the mechanism explains, such as warmth easing tight muscle: "yes" fits, "no" drops the check, because other conditions share it). Symptoms an option can't explain (unmarked territory, weakness for a sensory-only nerve, `logic` items of type `unexplained`) are notes, never "against": several problems can coexist.

Several schema fields are display-only and must never feed a probability: `context`, `contextFlags`, `mechanism`, `criteria` checklists, `sensoryOnly`, `logic`, and findings with empty `evidence` (information-only). `scoreOn: "positive"` makes a "no" answer count as "unsure". [src/engine/schema.ts](src/engine/schema.ts) documents each field.

`logic` items and `evidence/stress.json` clues and condition links are the deliberate exceptions to cite-or-exclude: the user chose to allow uncited clinical reasoning there (a `type` plus a `reason`, never a number). The UI labels these "reasoning, uncited". They must stay out of `bayes.ts`.

Evidence tiers (user decision, 2026-11-03): studies without sens/spec are used too. Case series, reviews and consensus feed cited `logic` items and `criteria` checklists (no probability). A two-study `specFrom` estimate (frequency in the condition from one study, in comparable people without it from another) may feed probabilities, labelled low certainty. See CURATION.md "Evidence tiers".

## Tests

- `tests/engine/` tests the math against a synthetic fixture (`fixture.ts`), not clinical data.
- `tests/vignettes/` runs textbook cases against the real evidence database and asserts the exact list of scorable hypotheses. Adding or removing evidence can legitimately break these tests; update the expected values only when the change is intended.
- `cases/cases.json` holds published case reports (facts stated in the report only, mapped to findings), scored by `src/engine/evaluate.ts`. A hash of the PMID splits them into dev and holdout. **Holdout rule (user decision, 2026-11-03):** never inspect, print or debug a holdout case, and never change evidence, reasoning, regions or coding conventions to fix one; report holdout only in aggregate. `tests/cases/` evaluates dev only, against the floor in `cases/baseline.json` (raise it after real improvements, never lower it). Read [cases/README.md](cases/README.md) for the selection protocol and coding conventions before adding cases.
