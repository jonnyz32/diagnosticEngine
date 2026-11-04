# Nerve Pain Navigator

A patient-facing, self-guided web app. It estimates which lumbar or pelvic nerve is most likely behind leg, buttock or pelvic symptoms, and lists clinician tests that could confirm it. It is an educational prototype, not a diagnostic device.

**Cite or exclude:** every number comes from a PubMed-indexed source with a table/abstract locator. See [evidence/CURATION.md](evidence/CURATION.md).

```
npm install
npm run dev                # http://localhost:5173
npm test                   # engine math + clinical vignettes
npm run validate-evidence  # build fails on any unsourced number
npm run audit-sources      # network: checks every DOI matches its PMID (run after adding sources)
npm run build
```

## Layout
- `evidence/` — the only place numbers live: sources, hypotheses, findings, red flags, confirmatory tests.
- `src/engine/`:
  - `bayes.ts` — posterior, dependence groups, territory gate
  - `selection.ts` — next question by expected information gain
  - `uncertainty.ts` — Monte Carlo intervals from reported CIs
  - `redflags.ts`, `session.ts`, `db.ts` (loading + integrity checks)
- `src/ui/` — React screens. Everything runs in the browser; answers stay in `localStorage`.

## Adding evidence
1. Add the paper to `evidence/sources.json` with PMID/DOI and `verifiedOn`.
2. Add or extend a finding in `evidence/findings.json`:
   - one accuracy entry per hypothesis, transcribed as reported, with `locator`
   - if the patient performs a test that was studied as a clinician exam, mark it `performedBy: "clinician"`, `adapted: true`
3. Log it in `evidence/CURATION.md`, then run `npm run validate-evidence && npm test`.
