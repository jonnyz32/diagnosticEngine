# Evidence curation log

Rule: **cite or exclude.** Every number in this folder has to trace to a PubMed-indexed source (PMID/DOI) and a locator (table or abstract section). `npm run validate-evidence` enforces this, and `npm run build` runs it first.

## Process
1. Search PubMed (E-utilities) for systematic reviews first, then prospective diagnostic accuracy studies, then guidelines.
2. Transcribe values from the PMC full-text table where the paper is open access; otherwise from the abstract. Never enter a value from memory.
3. Record what the paper reported: sens/spec with 95% CI, or LR+/LR−. Note the population and reference standard.
4. A test the patient performs that was studied as a clinician exam gets `performedBy: "clinician"` and `adapted: true`. The validator rejects it otherwise.
5. Leave out a test or prior whose source can't be verified.

## Modelling rules (not clinical values)
- **Priors.** No study reports the relative frequency of all these conditions in one population, so every hypothesis has `prior: null`. They start equal, with an "other" bucket.
- **One-vs-rest.** `P(finding | nerve)` = sens if a study measured this finding for that nerve; otherwise the mean false-positive rate (1 − spec) of the studies on that finding.
- **Pooling (user decision, 2026-11-02).** Several studies of one finding for one hypothesis are pooled, fixed effect:
  - Sens and spec are each a weighted mean, weighted by each study's effective sample size (α + β of the Beta matched to its 95% CI, as in `uncertainty.ts`). If any pooled study lacks a CI, all weigh equally.
  - The non-target rate pools per hypothesis first, then averages across hypotheses.
  - The same source twice for one hypothesis is rejected (double counting).
  - Studies with non-overlapping CIs get a validator warning and a "studies disagree" badge in the UI.
  - Pool only studies that ask the same question in a comparable population. A study with a very different comparison group (e.g. Konno 2007's much younger disc patients) belongs in the log, not the pool.
- **Dependence groups.** Only the strongest answered finding in each group counts:
  - `posture_sitting`: no pain sitting / better sitting / worse standing
  - `flexion_walking`: claudication / bending forward
  - `lfcn_provocation`: pelvic compression / Tinel
- **Territory gate.** A hypothesis is considered only if the patient marked one of its `regions`. This is anatomical, deterministic, and never a probability.
- **Red flags.** Removed from the app on 2026-11-03 (user decision): no emergency screen and no stop. The data in `redflags.json` is kept and validated, unused. When it was in use it was a deterministic stop, never scored; Dionne 2019 found pooled sensitivity of only 0.19–0.43.
- **Cross-study entries (`specFrom`).** Low certainty: sensitivity comes from a case series, and the comparison rate (spec) is borrowed from a different study's patients without the condition. Borrowed rates are excluded from the non-target average so the other study isn't counted twice. The UI labels these "Low certainty: built from different studies".
- **Positive-only findings.** A finding with `scoreOn: "positive"` ignores "no" answers (treated as unsure). It is used where specificity is sound but sensitivity is not (the Beatty test), or where a "no" can't rule out because several problems can coexist (the SIJ one-finger test).
- **Information-only follow-up questions.** A finding with empty `evidence` and a `followUp {hypothesis, minP}` is asked once that hypothesis reaches `minP`. Its answer fills linked checklist items and the clinician summary, and never changes a probability. Used for the 4 PFCN checks (location, avoiding sitting, hamstring history, skin self-check) at minP 0.10.
- **Conditional questions (`askIf`).** Asked straight after a parent answer (e.g. which operation, after "symptoms started after an operation").
- **Implied answers (`impliedBy`).** A question whose answer already follows *logically* from an earlier answer is filled in and not asked (shown in "Your answers" as "not asked"). It is scored exactly as if the patient had given that answer; the dependence groups still apply. Only strict logical implications qualify, never clinical associations. Not added on purpose: "no numbness" → sensory self-tests negative, because hypoaesthesia found on testing is often unnoticed. Rules (2026-11-02):
  - pain completely gone sitting = yes → better sitting = yes, and sitting brings on pain = no
  - better sitting = no, or sitting brings on pain = yes → pain completely gone sitting = no
  - sitting brings on pain = no → PFCN "avoid sitting because it hurts" = no
  - both soles numb = yes → numbness/pins and needles in a leg = yes
  - numbness/pins and needles in a leg = no → both soles numb = no, and tingling = no
- **Context flags.** Cited notes shown on a hypothesis when the patient gave a matching answer (surgery history). Display only: incidence *after surgery* is not P(surgery | condition), so it can't be a likelihood ratio.
- **Logical fit (added 2026-11-02).** A second score beside the probability. It is a count of checks that fit, go against, or are unanswered, and never a probability. The checks are:
  - studied findings whose "yes" points toward the option (LR+ above 1): "yes" fits; "no" counts against only when the condition usually has the finding (sensitivity above 50%, a display rule), so a rare finding's absence rules nothing out. Only the direction is used, never the size. When the "yes" points away (LR+ below 1), a "yes" answer is shown as a cited note and never counts against the option;
  - answers linked to a criteria item;
  - each hypothesis's `logic` items of type `usual`: "if X usually presents with Y and Y is absent, X is unlikely", so "yes" fits and "no" counts against.

  Symptoms an option can't explain are shown as notes and never count against it, because several problems can coexist (user decision, 2026-11-02). These are a marked area outside its territory, weakness for a sensory-only nerve, and a "yes" to a `logic` item of type `unexplained`.

  `logic` items are the **only place where uncited content is allowed**, by the user's decision. Each has a `type` and a plain-language `reason`, has no number, and is shown as "reasoning, uncited" unless it carries a `sourceId` and `locator`. The validator rejects a `logic` item on a finding that already has accuracy data or a criteria link for that hypothesis. The first set (all uncited) has 9 `usual` items (meralgia's numbness and burning, obturator's inner-thigh pain, ilioinguinal/genitofemoral's link to surgery, the femoral nerve's motor and sensory pattern) and 20 `unexplained` notes (cough/sneeze for nerves outside the spine, pain below the knee, numbness for joint and tendon mimics, and others). Replace an item with a cited one when a source turns up.
- **Engineering constants** (in `src/engine/`): logical-fit "usual" cutoff, sensitivity above 0.5 (`logic.ts`); likelihoods clamped to [0.005, 0.995]; stop rules (top hypothesis ≥ 0.85 *and* at least 2 answered findings supporting it, never when "other" leads; otherwise every question that can still change anything is asked, gain > 1e-6 bits; 25 questions. Changed 2026-11-03, see "Upper limb: stopping rule and mimics"); confirmatory-test display threshold of 10%.

## Extraction log (verified 2026-11-01)

| Source | What was used | Where |
|---|---|---|
| Suri 2011, PMID 20543768 (PMC2978791) | SLR, sit-to-stand, heel raise, heel walk, 5 sensory sites, for midlumbar vs low lumbar; FST, patellar, Achilles reflex (confirmatory) | Table 3 (full text) |
| Suri 2010, PMID 21156951 (PMC3260477) | 8 history items for stenosis; wide-based gait and Romberg (confirmatory) | Table 3 (full text) |
| Martin 2014, PMID 24217716 | SLR for deep gluteal entrapment; piriformis tests combined (confirmatory) | Abstract |
| Paneyala 2024, PMID 39687528 (PMC11649346) | Pelvic compression, Tinel for meralgia; test definitions | Abstract; Case Presentation |
| Nouraei 2007, PMID 17415207 | Clinician pelvic compression accuracy (confirmatory) | Abstract |
| van Slobbe 2004, PMID 15015008 | Meralgia incidence (context only) | Abstract |
| Kuniya 2014, PMID 25551470 | Superior cluneal criteria and frequency (context only) | Abstract |
| Labat 2008, PMID 17828787; Levesque 2022, PMID 34643963 | Nantes criteria (context only, no accuracy data) | Abstract |
| Dionne 2019, PMID 31132655 | Cauda equina red flags | Abstract |
| Chou 2007, PMID 17909209 | Imaging and red-flag recommendations | Recommendations 3–4 |
| Draghici 2023, PMID 37958280 | Electrodiagnostics/imaging for entrapments | Abstract |
| van der Windt 2010, PMID 20166095 | Context only (surgical-population pooled values not used) | Abstract |

| Kiral 2024, PMID 38849322 | SCN entrapment frequency (context); hip-knee flexion test 41.67/88.64 (clinician confirmatory) | Abstract |
| Fernandes 2025, PMID 40387915 | Pudendal neurophysiology + image-guided block 79/85.7 (confirmatory) | Abstract |
| Ahmed 2026, PMID 41389120 (PMC12804544) | States the Nantes criteria have never been tested for accuracy; duplex US 90/67 and MRI sensitivity 78% (confirmatory) | Results; Discussion |
| Bradshaw 1997, PMID 9167824 | Obturator entrapment pattern (checklist only) | Abstract |

## Criteria checklists (shown, never scored)
Pudendal (Nantes), superior cluneal (Kuniya) and obturator (Bradshaw pattern) have a `criteria` block. The patient sees how many published criteria they match, plus which criteria only a clinician can check.

## Second search pass (2026-11-01): what does not exist
- **Pudendal.** Ahmed 2026 confirms no accuracy study of the Nantes criteria. Vicente Palacio 2025 (PMID 40947057) covers a "neuropathic phenotype" of chronic pelvic pain, not pudendal specifically, using a 10-item tool that isn't published in the abstract. Not used.
- **Superior cluneal.** Kiral 2024 found history features similar to other low back pain. The hip-knee flexion test procedure isn't in the abstract or the trial registration (NCT05303597), so it isn't offered as a self-test.
- **Obturator, ilioinguinal/iliohypogastric/genitofemoral, femoral.** Only case reports, case series and reviews. Bjurström 2017 (PMID 28091815) validates sensory mapping against QST in confirmed cases, which doesn't separate them from other causes.

## Third search pass (2026-11-01): Europe PMC full text, web, Semantic Scholar
Added:
| Source | What was used |
|---|---|
| Michel 2013, PMID 23684470 | 12-point piriformis score: checklist (6 patient items) and clinician confirmatory (≥8: 96.4/100, case-control). Items read from the authors' ACR 2013 abstract table. |
| Fishman 2002, PMID 11887107 | FAIR-position **H-reflex** (electrodiagnostic) 88.1/83.2. Often misquoted online as the bedside FAIR maneuver. |
| Fritz 2017, PMID 28453433 | MR-neurography-guided genitofemoral block: 88% intervention success after positive block (confirmatory, no sens/spec) |
| Albert 2019, PMID 31608144 | Pain drawings can't separate L5 from S1 (~54%, chance), so the two stay combined |
| Seror 2004, PMID 14755498 | Meralgia SSEP accuracy; nerve conduction preferred |

Checked and not usable:
- **Lefaucheur 2007** (PMID 17996810): pudendal ENMG has "limited sensitivity and specificity", with no figures.
- **Tawa 2017** (PMID 28231784): pooled clinician neurological exam; not root-level-specific for home use.
- **Lin 2017** (PMID 28878316): clinician sensory testing (von Frey) for L5.
- **Tataroglu 2019** (PMID 31227403): LFCN conduction technique, no usable figures in the abstract.

## Fourth search pass (2026-11-01): field-restricted PubMed sweep per nerve, questionnaires, imaging
Added:
| Source | What was used |
|---|---|
| Suri 2011 (existing) | **New scored self-test:** helper prone knee bend (femoral stretch test), midlumbar 50/100, low lumbar 0/50 |
| Mostofi 2018, PMID 29993363 | Léri's sign 93/80 for L3/L4 in 1,545 front-of-thigh patients (context; retrospective) |
| Filler 2005, PMID 15739520 | MR neurography for piriformis syndrome 64/93 (confirmatory) |
| Siahaan 2021, PMID 34557150 | Ultrasound piriformis thickness 94.8/87.9 vs healthy controls (confirmatory) |
| Seror 2006, PMID 16421883 | LFCN conduction side-to-side ratio: sens 98.3%, spec ≥ 98.75% (confirmatory) |
| Knockaert 1989, PMID 2608591 | Ilioinguinal clinical triad (checklist) |
| Knockaert 1996, PMID 8766215 | Abdominal-wall EMG sensitivity 60% (confirmatory) |
| Iudicelli 2026, PMID 41681788 | Cluneal ultrasound markers, 12 vs 12 pilot (confirmatory) |
| Mollo 2009, PMID 19195783 | Primary source for pudendal duplex 89.6/67.4 (replaces the secondary citation) |

Checked and not used:
- **Epping 2017** (PMID 28600958). DN4/painDETECT in suspected radiculopathy: sensitivity 75–76% but specificity only 42–51%, so LR+ ≈ 1.3–1.5. Both instruments are also copyrighted, so their wording can't be reproduced without a licence.
- **Kim 2016, Bouhassira 2005, Freynhagen 2006.** Neuropathic vs nociceptive pain in general, not nerve-specific. The same licensing issue applies.
- **Ly 2019** (PMID 31337177). MRN vs pudendal block response; association only.
- **Lemos 2021** (PMID 34400289). MR tractography vs surgery in n = 13.
- **Chhabra 2023** (PMID 35700216). MRN "contributory" rates; no sens/spec.
- **Lim 2025** (PMID 39993116). MRI piriformis area 75/75 vs healthy; superseded by stronger imaging data.

## Full-text check (2026-11-02)
- **Mostofi 2018** (read on the publisher site, free access). Correction: the authors use "meralgia" to mean L3 radicular pain, not lateral femoral cutaneous neuropathy. The claim that the cohort included meralgia patients was removed.
  - Specificity rests on 153 patients without imaging compression; the TN + FP counts (122 + 32) sum to 154.
  - The maneuver is prone with the knee bent and the leg lifted (hip extension).
  - Kept as context only.
- **Michel 2013.** Read in full (user-supplied PDF); see below.
- **Vroomen 2002.** Read in full (user-supplied PDF); see below.
- **Kiral 2024, Filler 2005, Vicente Palacio 2025.** No legal free copy found (OpenAlex closed, web search).

## User-supplied full texts (2026-11-02)
PDFs are kept out of git (`*.pdf` in .gitignore). Sens/spec are computed from the papers' raw counts with Wilson 95% CIs.

| Source | Extracted |
|---|---|
| Vroomen 2002, Table 2 | **Scored history:** leg pain worse than back pain, 82.2/54.1 (125/152 vs 56/122); worse with cough/sneeze/strain, 50.0/67.2 (76/152 vs 40/122) |
| Vroomen 2002, Table 3 | **Scored self-test:** finger-floor distance ≥ 25 cm, 44.7/73.8 (68/152 vs 32/122); adapted, grouped with the SLR |
| Michel 2013, Table 1 | Clinician maneuvers, specificity vs L5/S1 disc patients: Beatty 93.3, Freiberg 76.7, FAIR 60, heel-to-opposite-knee 60. Needle EMG neurogenic signs 26/30 disc patients vs 0/250 piriformis patients. |
| Michel 2013, Tables 2–3 | Score items confirmed against the journal table; score ≥ 8 in 241/250 cases vs 0/60 controls |

Not scored from Michel:
- The four maneuvers were positive in 250/250 cases, which points to incorporation bias, so their sensitivity is not credible.
- The Beatty home-test procedure isn't described in the paper (reference [3], Beatty 1994).

Vroomen modelling note: the target is "root compression at any level", entered identically for `root_mid` and `root_low`. Items that need clinician judgement were not used ("typically dermatomal distribution", "dermatomal cold sensations"). Nor were non-significant items ("more pain on sitting", OR 0.9).

## Beatty test and Hopayian review (2026-11-02)
- **Beatty 1994** (PMID 8190228, abstract). The patient-performed procedure was verified. It is now a scored self-test with **`scoreOn: "positive"`** (user decision, superseding checklist-only):
  - A positive answer applies Michel's figures (sens 250/250, spec 28/30 vs L5/S1 disc patients; LR+ ≈ 15).
  - A negative or failed attempt is ignored.
  - Rationale: the sensitivity is likely inflated by incorporation bias, which mainly distorts negatives. If the true sensitivity were 50%, LR+ would still be ≈ 7.5, so the positive effect may be overstated by up to about 2×.
- **Hopayian 2010** (PMID 20596735, full text via Europe PMC HTML).
  - Frequencies of features in reported cases are used as context only.
  - The review confirms Beatty data are too sparse for reliable estimates.
  - It criticises Fishman 2002 for using asymptomatic controls, and Filler 2005 for an injection-response reference standard. Both caveats were added to the confirmatory entries.
  - It explicitly lists "features in sciatica with vs without a spinal cause" as unanswered research, which confirms the gap.

## Systematic screen of spine history studies (2026-11-02)
**Query.** PubMed: (sciatica OR lumbar radiculopathy OR spinal stenosis) AND (Sensitivity and Specificity[MeSH] OR diagnostic accuracy) AND (history OR symptom* OR questionnaire OR self-report*), excluding imaging/EMG titles.

**Flow.** 220 records → ~40 kept on title → 22 abstracts read → 5 free full texts read.

**Added:**
| Source | Use |
|---|---|
| Konstantinou 2012, PMID 22752591 (PMC3481089) | **3 scored history items** for root involvement (both roots), Table 4 classification 1: pain below knee 73/61; leg numbness or pins and needles 64/60; usual leg pain ≥ 7/10 48/73. Reference = clinical diagnosis. |
| Scholz 2009, PMID 19360087 | StEP tool (interview + exam) 92/97, radicular vs axial LBP (confirmatory) |

**Read but not used:**
- **Konno 2007** (PMC2176057). Its LSS-vs-disc items duplicate Suri 2010 / Konno items already scored, from a weaker design (surgical groups compared with each other).
- **Mistry 2020.** Its best evidence is Vroomen (already used) and StEP (added).
- **Plinsinga-type SLR study** (PMC10742430). SLR LR+ 1.19; no new item.
- Konstantinou "leg worse than back" and "cough/sneeze" items. Vroomen's MRI-referenced versions are kept.

**Excluded on abstract:**
- Sugioka 2008. Composite score; its items are already in via Suri 2010.
- Fritz 1997 treadmill. Lab test.
- Downhill-walk test. n = 23, PPV/NPV only.
- Fritz 1997 PRAPQ. Weak clusters.
- Mannequin sign. No controls.
- Shamsi 2004. Clinician level signs.
- Modified extension test. n = 30, spec 0.40.
- Hopayian 2018. No accuracy data.

**Paywalled, worth getting:**
- **Kato/Konno 2016 SSHQ** (LSS vs disc herniation, 93/85 and 91/85): https://doi.org/10.1016/j.jos.2016.07.012
- **Verwoerd 2014** (20 history items, 395 patients, blinded MRI): https://doi.org/10.1016/j.spinee.2013.11.049
- **Cook 2011** (LSS history cluster, 1,448 patients): https://doi.org/10.1002/pri.500
- **Cook 2020 SR** (LSS history/exam): https://doi.org/10.1007/s00586-019-06048-4

**DOI audit.** All 35 source DOIs were checked against OpenAlex by PMID. One error (Konstantinou, typed from memory) was found and fixed.

## Non-nerve mimics (2026-11-02)
Hypotheses with `category: "mimic"` are labelled "Not a nerve problem" in the UI. Their clinical descriptions are cited from Suri 2010, Table 1.

| Mimic | Scored items (source) | Confirmatory |
|---|---|---|
| Hip OA (`hip_oa`) | Pain on stairs/slopes 68/68; worst pain in inner thigh 12/98; knee OA history 33/84; squat causing posterior pain 24/96 (adapted). Metcalfe 2019 JAMA RCE Tables 1–2; reference = X-ray. | Decreased adduction 80/81, decreased IR 66/79 (Metcalfe); X-ray osteophytes 89/91 (Altman 1991) |
| Sacroiliac joint (`sij`) | One-finger test at PSIS 77.4/66.7 (adapted); pain sitting on a chair 64.5/61.8. Tonosu 2018 Table 2; reference includes history/exam (incorporation bias likely). | Laslett 2005: ≥ 3/6 provocation tests 94/78 vs SIJ injection |
| Gluteal tendinopathy (`gtps`) | Single-leg stance 30 s: LR+ 12 (abstract), LR− 0.62 derived from sens 38%/spec 100%; trochanter self-palpation 80/46.7 (adapted). Grimaldi 2017; comparator = other lateral hip pain. | Clinical exam 60/73 (Grimaldi) |

Not added:
- **Vascular claudication (PAD).** The Edinburgh Claudication Questionnaire (Leng & Fowkes 1992) is paywalled, and its comparator is mostly asymptomatic. No accessible study of patient-reported items for vascular vs neurogenic claudication was found.
- **Lequesne 2008.** Healthy controls; superseded by Grimaldi 2017.
- **Sutlive 2008.** Paywalled; its squat item is used via Metcalfe.
- **Athena sign 2026.** Narrative, hypothesis-generating.

Grimaldi full-text values were read from a third-party reproduction of the article (sogacot.org); they are consistent with the abstract.

## Sitting, mechanisms, PFCN, IFI (2026-11-02)
**Sitting.** "Does sitting on a chair bring on your pain or make it worse?" (`h_pain_sitting_chair`) is now `alwaysAsk` and asked first.
- Scored for SIJ (Tonosu 2018, 64.5/61.8) and both roots (Vroomen 2002 "more pain on sitting", 53.9/43.4, OR 0.9: essentially non-discriminative).
- It auto-fills the sitting items in the deep gluteal (Michel) and pudendal (Nantes) checklists.
- No comparative data was found for sitting pain in deep gluteal syndrome, the pudendal nerve or the PFCN. Evidence there is expert review (Martin 2015) and case series only, so it is not scored for them.
- Paywalled sitting data that could add more: Kurosawa 2017 (SIJ vs LDH/LSS, PMID 28204687) and Young 2003 (pain rising from sitting vs injections, PMID 14609690).
- Dreyfuss 1996 (PMID 8961447) found no history feature useful for SIJ pain; that is consistent with modest weighting.

**SIJ one-finger test is positive-only (2026-11-02, user decision).** `st_one_finger_psis` asks where the *worst* pain is. Tonosu compared SIJ pain against other low back pain, one cause per patient. In someone with two coexisting problems, the worst pain can come from the other one while the SIJ still hurts, so a "no" can't rule SIJ out. It now has `scoreOn: "positive"`: a "yes" applies Tonosu's figures, and a "no" counts as unsure.
- Its gate is unchanged (low back/buttock).
- Two same-day attempts were reverted: widening the gate to thigh/groin, and a "worst pain in back/buttock?" pre-question.
- Kept from those attempts: `selection.ts`'s information-gain picker now respects `askIf`. It is currently a no-op, because no `askIf` finding carries evidence.
- Added `st_psis_tender`, PSIS tenderness on pressing (Tonosu 2018 Table 2: 24/31 vs 46/123; sens 77.4%, spec 62.6%; Wilson CIs). Read from Europe PMC full-text XML (PMC6118337).
  - Clinician palpation in the study, so `performedBy: "clinician"`, `adapted: true`.
  - Scored both ways: it asks whether the bump is tender, not where the worst pain is, so a coexisting problem can't produce a false "no". LR− ≈ 0.36.
  - `followUp` for `sij` at `minP` 0.1, with no region gate because body-map marking is imprecise.
  - Shares `dependenceGroup` `sij_psis` with the one-finger test: both measure the same spot, so only the stronger counts.
  - Replaces a same-day uncited "any pain at the bump?" question and its `usual` logic item. The studied finding gives the logical-fit check automatically (sens > 50%).
  - Caveats: same population and incorporation-bias caveat as the one-finger test.
- Still not found: data on spontaneous (unpressed) PSIS pain. Dreyfuss 1996 and Kurosawa 2017 are paywalled.
- Known gap: the clinician provocation cluster remains the real rule-out test. It needs the clinician provocation cluster (Laslett 2005: sens 94%, so all six negative makes it unlikely), which is examiner-only.

**Mechanism labels.** Each hypothesis has a cited `mechanism` (display only):
- Mostofi 2018 (root_mid), van der Windt 2010 (root_low), Suri 2010 (stenosis), Filler 2005 (deep gluteal), Paneyala 2024 (LFCN), Ahmed 2026 (pudendal), Kuniya 2014 (cluneal), Bradshaw 1997 (obturator), Knockaert 1989 (ilioinguinal).
- Mimics: Altman 1991, Laslett 2005, Grimaldi 2017, Martin 2015.
- Femoral has none (no source read describes its mechanism).

**Posterior femoral cutaneous nerve (`pfcn`).** Unscorable. Description and context from Joshi 2017 (PMID 28299433; sitting pain) and Meng 2015 (PMID 26105014; 6 cases confirmed by ultrasound-guided block). Confirmatory test: ultrasound-guided block. No accuracy studies exist (PubMed: case reports and anatomy only).

**Ischiofemoral impingement (`ifi`, mimic).** Long-stride walking self-test 94.1/84.6 (16/17, 11/13), adapted from the Gómez-Hoyos 2016 clinician test (retrospective, n = 30, spine excluded). Clinician IFI test 82.4/84.6.

**DOI audit.** `npm run audit-sources` now checks every DOI against OpenAlex by PMID. Two more hand-typed DOIs (Meng, Joshi) were caught and fixed; all 44 match.

## Non-pain sensations (2026-11-02)
- `h_leg_numbness` (numbness or pins and needles; Konstantinou) is now `alwaysAsk` for leg symptoms. Its help text explains that pins and needles includes buzzing and tingling.
  - "Buzzing" is not a term used in any accuracy study, so the studied wording was kept.
- New scored items from Konstantinou 2012, Table 4, classification 1 (leg-pain descriptors, both roots):
  - tingling 35/80 (grouped with numbness as `paraesthesia`);
  - burning 27/84;
  - shooting/electric 33/72.
- Stenosis: burning around the buttocks on walking, 6/99 (Suri 2010, Table 3; primary study Konno 2007).
- Not used: Vroomen "dermatomal paraesthesiae" (OR 0.7) and "subjective sensory loss" (OR 0.9). Both are non-significant, and Konstantinou's items cover the same ground with CIs.
- Self-test prompts still say "your usual pain", because the source studies defined a positive test as reproduction of the patient's typical pain.

## Obturator and PFCN deep search (2026-11-02)
**Searched:**
- PubMed with synonyms: obturator neuropathy/entrapment/neuralgia; obturator + EMG/nerve conduction/adductor; obturator nerve block; obturator + neurography; PFCN + neuralgia/neuropathy/entrapment/sitting; "inferior cluneal"; PFCN perineal branch.
- Europe PMC full text.
- Two extended web searches.

**Found (descriptive, no comparison group):**
- **PFCN:** Dellon 2015 (n = 17) and Kachniarz 2021 (n = 52) surgical series; all patients had sitting pain, and 50% had MRI hamstring injury. Jottard 2022 review (blocks to separate from pudendal). Plus Meng 2015 and Joshi 2017 (already in).
- **Obturator:** Sorenson 2002 (n = 22, Mayo EMG lab), Brukner 1999 (athletes; pectineus stretch, EMG, block), Kitagawa 2009 (n = 6 surgical). Plus Bradshaw 1997 (already in).

**Added:**
- PFCN checklist (4 items; the sitting item is linked to the always-asked sitting question) and context.
- Obturator context, clinician-only checklist items, and nerve block as a confirmatory test.

**Not used:** the Tipton 2008 review claim that EMG confirmed ~91% of athlete cases. The full text is PDF-only, so it could not be verified.

**Conclusion:** No study reports sensitivity/specificity, or symptom frequencies against a comparison group, for either nerve, so neither can be scored without inventing the comparison rates.

## PFCN cross-study estimate (2026-11-02, user decision)
`pfcn` is now scorable through one low-certainty entry on the sitting question:
- **Cases:** sitting pain in 69/69 surgical patients (Kachniarz 2021, n = 52; Dellon 2015, n = 17). Wilson CI 0.947–1.0. Patients were selected for sitting pain, so this is inflated by design.
- **Comparison:** 57% of primary-care leg-pain patients without root compression reported more pain on sitting (Vroomen 2002, Table 2, 69/122).
- **Positive-only.** A "no" leaves PFCN level with "other".
- **Effect.** Against the engine's averaged non-target rate (0.505), a "yes" multiplies the odds by ~1.97. Because the sensitivity can't exceed 1, this is the largest effect the data allow; the true effect can only be smaller.
- **Example** (buttock + back of thigh): 11% at start → 19% after a "yes" to sitting.

Obturator was not given an equivalent estimate: no study reports the frequency of exercise-related inner-thigh pain in people with other groin conditions.

## Isolating the PFCN (2026-11-02)
- **Sensory-only rule.** Applied to `pfcn` (Meng 2015: "a sensory nerve") and `lfcn` (Paneyala 2024: "a sensory branch of the lumbar plexus"). Findings marked `motor` (sit-to-stand, heel raise, heel walk): if any is positive, the result shows a note that this nerve can't explain weakness alone. It is a display note only, never a probability.
- **Skin-sensation self-check** added to the PFCN checklist, cited to Joshi 2017 (paresthesia over the lower buttock, posterior thigh and popliteal region). Checklist only.
- Checklists now show from 5% (previously 10%).
- **Pending, user to supply PDFs:** Dellon 2015 (10.1002/micr.22422) and Kachniarz 2021 (10.1055/s-0041-1726027), for exam findings that could become cross-study items.

## Narrowing questions: meralgia triggers (2026-11-02)
- **Tight clothing/belts.** Named as a risk factor by Chalk 2024 (PMID 38697741) and other reviews (Gurbuz 2021, Kesserwani 2021), but no study gives its frequency vs other causes of thigh symptoms.
- **Pregnancy.** van Slobbe 2004, OR 12 vs GP population.
- **Diabetes.** Parisi 2011, 28% vs 17% of non-symptomatic BMI-matched controls.
- These are added as **information-only follow-ups** (`lfcn`, minP 0.10) feeding a new meralgia checklist, not scored: none has a symptomatic comparison group.
- **Pelvic compression test.** CIs added from Paneyala Table 4 counts (26/30, 28/30).
- **Paneyala inconsistency.** Tinel: the abstract and Table 5 report 85.7/87.5, but Table 4 counts imply 86.7/93.3 (identical counts listed for all three tests). The more conservative reported figures are kept.

## Narrowing-question sweep (2026-11-02)
**Scored (hip OA, Metcalfe 2019):**
- pain on first steps after rest 92/26 (Table 1);
- limp 85/43 (Table 2; observed by examiner, so adapted as self-report);
- family history of OA 34/84 (Table 1).

**Surgery history (always asked, with sub-questions if yes; context notes only):**
- Front-approach hip replacement or resurfacing → LFCN: 81% at 1 year (Goulding 2010, PMID 20532717).
- Lower-back surgery → LFCN: listed as a cause (Chalk 2024).
- Inguinal hernia repair → groin nerves: 23.5% persistent groin pain (Ergönenç 2017, PMID 28890413).
- Pelvic, gynaecological or urological surgery → obturator: recognised cause (Kitagawa 2009, PMID 19927074).

**Not added:** pudendal triggers (cycling, relief sitting on a toilet seat). Not found in any source read in full; Ahmed 2026 does not state them.

## Known gaps (excluded, shown as "cannot be estimated")
- **Pudendal.** The Nantes criteria are consensus criteria with no accuracy study.
- **Superior cluneal.** Only how often patients met the criteria is reported, not diagnostic accuracy.
- **Obturator, ilioinguinal/iliohypogastric/genitofemoral, femoral (outside the spine).** No diagnostic accuracy studies found.
- **Deep gluteal.** Partly closed on 2026-11-02 (see "Coverage pass" below): the two Martin 2014 piriformis tests are now helper-performed self-tests.
- **PFCN.** Only sitting pain (positive-only). The deep search (above) found surgical series only, so nothing can count against it.

## Coverage pass (2026-11-02)
User goal: every option should have questions that can support it and questions that can count against it. Strongest LR+ and lowest LR− per option were tabulated. The gaps were deep gluteal (no rule-out: LR− 0.89), PFCN (positive-only sitting) and SIJ (weak rule-in). The five unscorable nerves were already searched (see "Known gaps").
- **Deep gluteal: added `st_active_piriformis` and `st_seated_piriformis`**, both helper-performed (`performedBy: "clinician"`, `adapted: true`).
  - Accuracy from the Martin 2014 abstract: active test sens 0.78, spec 0.80 (LR− 0.27); seated stretch sens 0.52, spec 0.90. Counts (18/23, 8/10, 12/23, 9/10) are derived from the group sizes, with Wilson CIs.
  - Procedures from Martin 2015 (open access, PMC4718497) Figs 2–3. Examiner palpation is replaced by "does it bring on your usual deep buttock pain".
  - The active test is a `followUp` for `deep_gluteal` at minP 0.1.
  - Both share `dependenceGroup` `piriformis_provocation` with the Beatty test: the active test is a resisted version of Beatty's knee lift. A positive-only Beatty "no" doesn't enter the group, so the active test's "no" still counts.
  - Caveats: only 10 controls (spec CI 0.49–0.94); all patients were endoscopy candidates (spectrum bias); retrospective.
- **SIJ:** Laslett 2005 single-test figures are not in the abstract (paywalled), so no helper versions of thigh thrust/distraction were added.
- **PFCN:** nothing new.
- The PFCN follow-up vignette test now answers interleaved follow-ups from other options "unsure", instead of pre-answering each one by id.

## Excluded candidates
- **Majlesi 2008** (PMID 18391677). Its slump test target is "disc herniation on MRI", which doesn't map onto a single root-level hypothesis.
- **van der Windt 2010 pooled SLR.** Surgical populations with 58–98% prevalence.

## Literature mining run (2026-11-02)
`npm run mine-literature` (scripts/mine-literature.ts) searched Europe PMC title/abstract for each hypothesis plus a multi-diagnosis query. It kept 349 hits with accuracy figures in the abstract (104 open access) and wrote reports to `mining/` (gitignored). Obturator, femoral and PFCN returned no hits, consistent with the earlier deep search.

**Open-access papers read; nothing added:**
- **Jensen 2020** (PMID 32904080, PMC7450213): 13-item LSS screening questionnaire, 153 cases vs 230 spine-clinic controls aged ≥50 (case–control; reference = clinician diagnosis). Per-item sens/spec are in Table 3; item wording is in the Table 1 image (read from the publisher's copy).
  - Items not already asked are weak: relief when cycling .36/.73, stooping while walking .48/.64, leg weakness while walking .76/.42 (all LR+ ≤ 1.5).
  - Relief with a shopping cart (.68/.56) duplicates `h_bend_forward`. The other items duplicate existing Suri 2010 questions.
- **Konno 2007** (PMID 17967201, PMC2176057): LSS vs lumbar disc herniation (Table 4). "Worse when walking, relieved by rest": 94.2% vs 18.6%. It duplicates `h_walking_claudication`, and the groups differ greatly in age (68 vs 41 years), so Suri 2010 is kept.
- **Not relevant:**
  - Salman 2022 and Koç 2015: inflammatory sacroiliitis.
  - Shimpi 2018: SIJ "dysfunction", no injection reference.
  - Estrázulas 2020: applied kinesiology.
  - Nayeb Aghaei 2015: LSS subtypes only.
  - Mistry 2020 and Tawa 2016: reviews.
  - Kaltenborn 2014 and Quintana 2025: abductor tears, examiner-only.
  - Kim 2015: hip pain vs radiographic OA in non-patients.
  - The rest were imaging, AI or surgical-outcome studies.

**Engine limitation found:** the validator allowed one evidence entry per finding and hypothesis. This was resolved the same day by pooling (see Modelling rules). Jensen and Konno were still not pooled into existing findings:
- Konno 2007's comparison group is not comparable (see above).
- Jensen 2020 is a case–control study. Its per-item case/control split for items 4–9 (N = 345) isn't reported, so CIs can't be derived. Without them, pooling would weigh it equally with Suri 2010's review.

**Paywalled, most promising** (full list in `mining/wanted.md`):
- Saueressig 2021 (PMID 34210160): SIJ provocation meta-analysis.
- Kinsella 2024 (PMID 37561820): GTPS clinical tests meta-analysis.
- Verwoerd 2014 (PMID 24325881): history taking for nerve root compression.
- Wright 2021 (PMID 33930328): patient history for hip-related pain, systematic review.
- Lyu 2023 (PMID 37192234): SIJ vs disc herniation tests.
- Mekhail 2021 (PMID 32965780): SIJ.
- Laslett 2003 (PMID 12775204): SIJ.
- Lequesne 2008 (PMID 18240186): GTPS.
- Martin 2018 (PMID 29203381): proximal hamstring tears with sciatic involvement.
- Trainor 2011 (PMID 21295239): slump knee bend, upper lumbar roots.

## Obturator self-checks and Howship–Romberg search (2026-11-02)
**Searched (PubMed):** Howship–Romberg / "Romberg sign" + obturator (59 hits; 35 after filtering for series, reviews and patient studies); obturator + sensory/hypoaesthesia/numbness/cutaneous + sensitivity/specificity/controls (11 hits, none relevant).

**Howship–Romberg not used.** Every source is obturator *hernia* (case reports, series, reviews). It was present in 11/30 (37%) of the Mayo series (Nasir 2012, PMID 22138700) and in 56.2% of 146 pooled cases (Schizas 2021, PMID 32772276). The only two-group study (Zhang 2021, PMID 33141258) compares hernia with vs without bowel obstruction, so it has no comparison rate either. It also covers a single cause, usually in an acute presentation, so it does not fit a self-guided chronic-pain check.

**Added to the obturator checklist (display only, each with its own citation):**
- `obt_pectineus_stretch`: a self-version of the pectineus stretch after exercise (Brukner 1999, Abstract). Clinician-performed in the source and worded as a self-version in the prompt. The clinician version stays in `clinicianOnly`.
- `obt_skin`: an inner-thigh skin self-check. Kitagawa 2009 (Abstract) lists numbness among the symptoms that resolved after surgery but doesn't give its location; the inner thigh comes from the nerve's territory. This is a weak citation; replace it if a source states the distribution.

Neither has a comparison group, so obturator stays unscorable.

## Upper limb (2026-11-03)
User request: add tests for the nerves of the arm. Scope chosen by the user: cervical roots C5–C8, median, ulnar, radial, thoracic outlet and the shoulder-girdle nerves, plus shoulder and elbow mimics. Sources found by `npm run mine-literature` (new upper-limb terms in the script) and targeted Europe PMC searches. Values come from abstracts unless a full text is named; nothing was entered from memory.

**Regions.** 13 arm regions were added (`neck` … `hand_dorsal_radial`). The hand is split by the median, ulnar and superficial radial territories. Lower-limb questions that had no region gate (the stenosis history items, sitting, surgery history, PSIS tenderness) are now gated to the 12 lower-limb regions, so arm-only patients never see them.

**Scored (all self-tests are adapted clinician tests, `performedBy: "clinician"`, `adapted: true`):**
| Finding | Hypothesis | Values | Source |
|---|---|---|---|
| `st_shoulder_abduction_relief` (hand on head eases arm symptoms) | `root_cervical` | 0.49 (0.39–0.60) / 0.76 (0.66–0.84) | Thoomes 2026, PMID 41680685, Table 4 (pooled, 2 studies; very low certainty) |
| `st_spurling_self` (head tilt + slight extension, no downward pressure) | `root_cervical` | 0.53 (0.29–0.78) / 0.92 (0.88–0.96) | Lin 2025, PMID 39938056, Abstract (pooled, 8 studies) |
| `st_arm_squeeze` (helper squeezes the mid upper arm vs two shoulder spots, ≥3/10 difference) | `root_cervical` | 295/305 vs 43/1,262 shoulder-disease patients: 0.967 / 0.966, Wilson CIs | Gumina 2013, PMID 23604976, Abstract. Specificity is against shoulder disease, not the 350 healthy volunteers. Thoomes 2026 rates the design close to case-control. |
| `st_phalen_self` | `cts` | 0.57 (0.44–0.68) / 0.67 (0.52–0.79) | Dabbagh 2023, PMID 37366626, Abstract (7 studies, 604 patients) |
| `st_tinel_wrist_self` (fingertip tapping) | `cts` | 0.400 (0.309–0.498) / 0.861 (0.708–0.940) | Hill 2026, PMID 42254332, Abstract: fingertip-percussion subgroup, since that is what a patient can do. Tendon-hammer figures (62.1/78.9) are not used. |
| `st_tinel_elbow_self` | `cubital` | 0.62 / 0.527 (85/137, 29/55 derived), Wilson CIs | Beekman 2009, PMID 19553231, Abstract (consecutive suspected-UNE patients; the realistic comparator) |
| `st_siref_self` (shoulder internal rotation elbow flexion, 5 s) | `cubital` | 0.87 / 0.98 (48/55, 121/123 derived), Wilson CIs | Ochi 2012, PMID 22217643, Abstract. Case-control; control type not stated, so specificity is likely inflated. |
| `st_painful_arc_self` | `rotator_cuff` (mimic) | LR+ 3.7 (1.9–7.0), LR− 0.36 (0.23–0.54) | Hermans 2013 JAMA RCE, PMID 23982370, Abstract. Entered as LRs (the schema carries no LR CIs, so uncertainty isn't propagated). |

Counts derived from percentages and group sizes follow the Martin 2014 precedent. No dependence groups were added: each test is a different manoeuvre.

**Unscorable (listed as "cannot be estimated"):** `median_proximal` (pronator / anterior interosseous), `guyon`, `radial_tunnel`, `superficial_radial`, `tos`, `suprascapular`, `long_thoracic`, `axillary`, `musculocutaneous`, `neuralgic_amyotrophy`. Axillary, musculocutaneous and superficial radial have descriptions only: no source was read for them.

**Confirmatory (clinician / investigations):** clinician Spurling (Lin 2025); four-ULNT cluster 0.97/0.51 (Thoomes 2026 Table 4); NCS+EMG 0.89/0.77 and ultrasound 0.80/0.90 for CTS (Zaki 2022, PMID 36415360); short-segment NCS 0.89/0.80 and ultrasound 0.71/0.82 for UNE (Omejec 2015, PMID 25541522; specificity in asymptomatic controls); ulnar conduction across the wrist 0.90/1.00 (Seror 2013, PMID 23540258); MAC nerve conduction 0.73/0.99 for TOS (Machanic 2008, PMID 18346579; healthy controls); radial tunnel ultrasound 0.926/0.80 (Kerasnoudis 2024, PMID 39397287; see below); suprascapular MRI oedema 0.945/1.00 (Ludig 2001, PMID 11702155); serratus EDX 0.65/1.00 (Silkjær Bak 2022, PMID 34801963); neuralgic amyotrophy ultrasound sensitivity 0.74 (Arányi 2017, PMID 28556181); MR neurography for AIN syndrome 1.00/1.00, 20 vs 20 (Pham 2014, PMID 24415574); rotator cuff lag tests (Hermans 2013, no sens/spec).

**Context (display only):** Thoomes 2026 (all neck tests very low certainty); Lin 2025 (Spurling better for confirming); Hill 2026 (fingertip less accurate than hammer); Beekman 2009 (provocation adds little); Nord 2008, PMID 18435210 (Roos positive in 47% of normal subjects and 77% of CTS patients); Arányi 2017 (AIN most often affected). Mechanism for `median_proximal` from Pham 2014.

**Red flags (new):**
- `rf_chest_arm` (emergency): arm/shoulder/neck pain with chest pain. Panju 1998, PMID 9786377, Abstract (chest pain radiating to the arms raises the probability of MI).
- `rf_myelopathy` (urgent): new bilateral hand clumsiness or unsteady walking. Kobayashi 2010, PMID 21092213, Introduction (manual clumsiness and walking disturbance; delayed treatment may cause irreversible consequences).
- Not added: a progressive arm-weakness flag. `rf_progressive_weakness` still names the leg and foot, and its source (Chou 2007) is a low back guideline. Feller 2024 (PMID 39639931) reviews neck-pain red flags but finds no agreement between guidelines, and its specific items aren't in the open tables.

**Checked and not used:**
- **Kerasnoudis 2024** palpation over the radial tunnel (75.7/50). The abstract calls the 34 participants both "patients with lateral elbow pain" and "healthy controls". Its ultrasound figure is shown as a confirmatory test with that caveat.
- **Wainner 2003** cervical cluster (LR+ 30.3) and **Wainner 2005** CTS rule. Paywalled; the individual items need the full text.
- **Sleijser-Koehorst 2021** (PMID 33309074): patient interview items for cervical radiculopathy. Paywalled, and the most promising source of arm history questions.
- **Katz 1990** hand diagram (80/90; PMID 2324471) and **Schulze 2021** (72/90). They need the diagram and its rating rules, not a single question.
- **Hansen 2004** flick sign: "false-positive results" in the abstract is ambiguous (rate among negatives or among positives?). Needs the full text.
- **Hegmann 2018**, **Szabo 1999**: night symptoms, sensitivity only.
- **Beekman 2009** flexion–compression test (61/40, LR+ ≈ 1.0): non-discriminative.
- **Gillard 2001**: TOS provocative tests reported only as a mean (72/53). **Nord 2008** has no TOS patients.
- **Goubau 2014** WHAT test for de Quervain's (0.99/0.29): no de Quervain hypothesis yet.
- **Gumina 2013** rotator-cuff-specific split (35/903 positive). Not entered: the one-vs-rest model already gives other options the mean false-positive rate.
- **Kobayashi 2010** myelopathy questionnaire (93.5/67.3). Myelopathy is a red flag, not a scored option.
- **ULNT for CTS** (Trillos 2018, Vanti 2011–2012, Bueno-Gracia 2016/2024, Ciuffreda 2024): inconsistent criteria and they need a trained examiner.

**Known gaps (arm):** no history questions at all (the self-tests carry everything); radial, thoracic outlet and shoulder-girdle nerves unscored; no lateral epicondylalgia or de Quervain mimic. Paywalled papers worth getting: Sleijser-Koehorst 2021 (10.1016/j.physio.2020.07.007), Wainner 2003 (10.1097/00007632-200301010-00014), Wainner 2005 (10.1016/j.apmr.2004.11.008), Hansen 2004 (10.1097/01.phm.0000124439.14757.99), Novak 1994 (10.1016/0363-5023(94)90193-7).

**DOI audit.** `npm run audit-sources`: all DOIs match their PMIDs (Nord 2008 has no DOI).

## Upper limb: stopping rule and mimics (2026-11-03)
**Problem (user test).** An arm interview asked two questions and ended on "something not covered". Simulation per region showed two causes:
- Most arm regions had only 2–3 eligible self-tests, and the 0.01-bit gain cutoff ended the interview after them.
- A single "yes" to the arm squeeze (Gumina) or the SIREF test (Ochi) reached 96–97% and triggered the 85% stop after one question. Both studies likely overstate accuracy (case-control designs).

**Stopping rule (user decision).** Applies to legs and arms.
- `MIN_INFORMATION_GAIN_BITS` is now 1e-6: every question that can still change anything is asked.
- The 85% early stop now also needs `MIN_SUPPORTING_FINDINGS` = 2 answered findings whose answer is more likely under the leader than under "other" (`supportingFindings` in `selection.ts`). It never fires when "other" leads.
- Effect: leg interviews now usually run to the 25-question budget; arm interviews ask 4–9 questions.

**Mimics added (user decision: tennis/golfer's elbow, shoulder impingement/frozen/biceps, de Quervain, thumb-base OA, trigger finger).**
| Hypothesis | Scored | Source |
|---|---|---|
| `rotator_cuff` (renamed "Rotator cuff or subacromial shoulder pain") | + helper Hawkins 0.79/0.59, helper Neer 0.72/0.60 (no CIs; `dependenceGroup` `subacromial_provocation`) | Hegedus 2012, PMID 22773322, Abstract (pooled; target subacromial impingement, not identical to Hermans' rotator cuff disease, so the painful-arc figures were not pooled) |
| `de_quervain` | WHAT test, self-resisted, 0.99/0.29 | Goubau 2014, PMID 23340762, Abstract. PPV 0.95 means few non-cases, so the specificity rests on a small group; LR− ≈ 0.03 makes a "no" strong on thin data. |
| `thumb_cmc_oa` | helper grind test 0.53/0.80 | Merritt 2010, PMID 20452743, Abstract: the more conservative of two testers (the other had 0.42/0.93) |
| `lateral_epicondylalgia`, `medial_epicondylalgia` | none | Zwerus 2018, PMID 28249855: one accuracy study for lateral, none for medial (context) |
| `frozen_shoulder` | none | Hegedus 2012: shoulder shrug sign "sensitive" but no figures (context) |
| `biceps_tendinopathy` | none | Holtby 2004, PMID 15007311: Speed/Yergason LR ≈ 1.3–2.1, target mixes biceps and SLAP lesions (context) |
| `trigger_finger` | none | no accuracy study found |

**Information-only arm history questions (`alwaysAsk`, gated, empty evidence).** These never change a probability. They feed `logic` items, which are uncited reasoning by the user's earlier decision:
- `h_arm_numbness`: `usual` for cts, cubital, guyon, superficial_radial; `unexplained` note for every tendon or joint mimic and rotator_cuff.
- One `usual` trigger question per mimic: `h_grip_lateral_elbow` (tennis elbow), `h_grip_medial_elbow` (golfer's elbow), `h_shoulder_stiff` (frozen shoulder), `h_front_shoulder_pain` (biceps), `h_wrist_thumb_motion` (de Quervain), `h_thumb_base_pinch` (thumb OA), `h_finger_catching` (trigger finger).
- Unscored mimics therefore appear in the logical-fit view (e.g. outer-elbow grip pain without numbness puts tennis elbow first there) but stay out of the probabilities.

**Searched, nothing usable:** lateral epicondylitis accuracy (581 hits, treatment trials and outcome measures); medial epicondylitis (ultrasound only, Park 2008); trigger finger (none); Dinnes 2003 HTA (PMID 14567906, open access; reports clinical-test pooling only qualitatively in the abstract, full report not read). Cardoso 2019 and Taylor 2017 (biceps, surgical populations, paywalled) were not used.

## Scope widened to tissue causes: phase 1 look-alikes (2026-11-03)
**User decisions.**
- The tool now covers any source of pain, not only a trapped or irritated nerve. Every pain signal travels along nerves; "mimic" options are those where the problem starts in a tendon, joint, disc or muscle.
- Renamed to Pain Source Navigator. The badge now reads "Tendon, joint or muscle (nerves only carry the signal)".
- Phase 1 covers tissue problems commonly confused with the nerve problems already modelled.
- Priors stay equal. The results page now warns that a rare cause starts level with a common one.

**Regions.** `wrist_radial` and `wrist_ulnar` were added. They were added to the neck root, De Quervain's, superficial radial, thumb-base OA and Guyon territories, and to the matching self-test gates.

**Scored:**
| Hypothesis | Finding | Values | Source |
|---|---|---|---|
| `proximal_hamstring` | `st_resisted_knee_flex` (helper resists knee bending at ~30°) | 0.73 / 0.97 (no CIs) | Martin 2018, PMID 29203381, Abstract (A-30 test; 27 tears vs 15 other posterior hip pain; retrospective). The abstract doesn't give the test position; prone is assumed. Target is tears, not tendinopathy (Cacchio 2012, PMID 22219215, reports no figures in its abstract). |
| `disc_pain` | `st_centralisation_self` (10 prone press-ups; pain retreats toward the spine) | 0.40 / 0.94 (no CIs) | Laslett 2005 (id `laslett2005disc`; `laslett2005` is the SIJ paper), PMID 15996606, Abstract; discography reference; 69 specialist-referred chronic LBP patients. |
| `tfcc` | `st_fovea_self` | 0.89 / 0.48 (no CIs) | Ou Yang 2021, PMID 34459533, Abstract (prospective, 110 ulnar-sided wrist pain patients). Procedure from Tay 2007 (PMID 17398352). Tay's 95.2/86.5 (surgical series, narrower target) is context only, not pooled. |

Modelling caveat for `disc_pain`: the nerve-root hypotheses have no centralisation data, so they receive the 6% false-positive rate. A "yes" therefore weighs strongly against them, although centralisation is also described with radiculopathy. Revisit if a source gives centralisation rates in radiculopathy.

**Listed, logical fit only:**
- `facet_lbp`: Hancock 2007 (PMID 17566796) found no informative clinical test.
- `hip_fai`: Reiman 2015 (PMID 25515771) gives pooled FADIR sensitivity 0.94–0.99 but no specificity.
- `adductor_groin`: Falvey 2016 and Verrall 2005 give squeeze-test sensitivity only, or flawed specificity.
- `ac_joint`: Walton 2004 (PMID 15069148) doesn't report specificities in the abstract; Chronopoulos 2004 is case-control, also without specificities in the abstract.
- `shoulder_oa`, `neck_joint`: no source found.

**New information-only questions (`alwaysAsk`, gated), feeding uncited `logic` items:** `h_groin_deep_flexion` (hip_fai), `h_groin_adductor` (adductor_groin), `h_ac_point` (ac_joint), `h_neck_movement_pain` (neck_joint). `h_shoulder_stiff` is reused for shoulder_oa. Every new tissue option carries an `unexplained` numbness note (`h_leg_numbness` or `h_arm_numbness`).

**Not added in phase 1:**
- Scaphoid fracture (Parvizi 1998): acute injury; a fracture-screening red flag belongs with the red flags.
- Knee OA (no usable source found).
- Phase 2 candidates: knee, ankle and foot regions and their problems; Achilles and patellar tendinopathy; muscle strains.

## Top of the forearm / RSI (2026-11-03)
User question: does the tool cover top-of-forearm tendinitis from RSI? It didn't: there was no back-of-forearm region, and none of the conditions was modelled.

**Region.** `forearm_dorsal` ("Back (top) of forearm"), drawn in the middle of the back-of-arm forearm. Added to every whole-arm territory and gate (neck root, `h_arm_numbness`, neck self-tests) and to `lateral_epicondylalgia`, `radial_tunnel` and `h_grip_lateral_elbow`.

**Searched (Europe PMC):** intersection syndrome (51 hits: imaging and case material), extensor tenosynovitis / forearm tendinopathy (15 hits: rheumatoid imaging), non-specific arm pain / RSI / work-related upper limb disorder (21 hits), upper-limb diagnostic examination schedules (7 hits). No study gives the accuracy of a patient-doable test. The Southampton examination schedule (Palmer 2000, PMID 10627419) is a nurse examination with a diagnostic algorithm; it isn't a self-test, and its per-diagnosis figures aren't in the abstract.

**Added (listed, logical fit only):**
- `intersection_syndrome`: mechanism and context from Grundberg 1985 (PMID 3980951, Abstract: stenosing tenosynovitis of the radial wrist extensor sheath, 13 operated cases). `usual` logic on new `h_forearm_creak` (swelling or creaking above the wrist, thumb side).
- `nonspecific_arm_pain` ("Non-specific or work-related arm pain (often called RSI)"). Context: Moloney 2010 (PMID 20113518: 45% of occupational diseases, diagnosed by absence of specific findings), Moloney 2013 (PMID 23370077: widespread hypersensitivity without the hypoaesthesia of radiculopathy), Walker-Bone 2003 (PMID 14671727: criteria rely on clinical opinion). `usual` logic on new `h_repetitive_use`. No numbness note: whether nerves are involved is unresolved (Moloney 2010).
- `lateral_epicondylalgia` now covers the back of the forearm. Context from Ihm 2008 (PMID 19468898): wrist-extensor tendinopathy also occurs with repetitive work.

## Evidence tiers (user decision, 2026-11-03)
The user asked that the tool use studies even when they don't report sensitivity/specificity. Three tiers, each labelled in the UI:
1. **Accuracy studies → probabilities** (unchanged): sens/spec or LRs from one study comparing people with and without the condition.
2. **Two-study estimates → low-certainty probabilities** (`specFrom`, the PFCN precedent): a feature's frequency in the condition from one study, plus its frequency in comparable people without it from another. Labelled "Low certainty: built from different studies". Both halves must be cited; never use the average rate across other conditions as the comparison.
3. **Case series, reviews and consensus → cited reasoning and checklists** (no probability): `logic` items carry `sourceId`/`locator` when a source states the feature, and published criteria become `criteria` checklists. Uncited reasoning stays allowed and labelled.

**First application: tennis elbow / top of the forearm (Ihm 2008, PMC2684153, "Clinical presentation", read in full):**
- `lateral_epicondylalgia` gets a cited criteria checklist: outer-elbow pain, epicondylar tenderness, pain on resisted wrist extension. All three should be present. Ihm cites these to its own reference 7.
  - Linked to new `h_outer_elbow_main`, `st_epicondyle_tender_self` and `st_resisted_wrist_ext_self` (a self-resisted Cozen-type test), all information-only and `alwaysAsk`.
  - Mill's test and resisted middle-finger extension are listed as clinician-only.
- Its grip trigger (`usual`) and numbness note (`unexplained`) are now cited to Ihm.
- `intersection_syndrome`: the swelling check is now cited to Grundberg 1985 (Abstract: pain and swelling where the muscles cross). Added uncited items: resisted wrist extension (`usual`) and outer-elbow pain (`unexplained`).
- `nonspecific_arm_pain`: new `h_forearm_widespread` (`usual`, uncited).
- Tier 2: no two-study estimate is possible yet. No source read gives the frequency of resisted-extension pain, epicondylar tenderness or crepitus in comparable people without the condition.

**Pending, user to supply the PDF:** Palmer 2000, Southampton examination schedule (PMID 10627419, doi 10.1136/ard.59.1.5). It is the only validated examination schedule for soft-tissue arm disorders: 58–100% sensitivity and 84–100% specificity per diagnosis, nurse versus specialist clinic. Its per-diagnosis criteria and figures are in the PDF only.

## Evidence-tier sweep over listed-only conditions (2026-11-03)
**Method.** Europe PMC searches for open-access reviews, consensus papers and case series on each unscored condition, then reading the full texts (`fullTextXML`).

**Tier 2 (two-study probabilities): none possible.** No source read gives a feature's frequency in comparable people *without* the condition. The one candidate pairing was thoracic outlet syndrome, but it couldn't be built:
- Comparison half: Roos false-positive rate of 77% in CTS patients (Nord 2008).
- Case half: Balderman 2017, the frequency of each criterion in neurogenic TOS. Its full text isn't open, so it couldn't be read.

**Tier 3 (cited checks, criteria, context):**
| Condition | Added | Source |
|---|---|---|
| `adductor_groin` | Criteria checklist (Doha): adductor tenderness AND pain on resisted adduction, via new `st_adductor_tender_self`, `st_adductor_squeeze_self` | Weir 2015, PMID 26031643 (PMC4484366) |
| `trigger_finger` | `h_finger_catching` cited ("popping and locking is typically all that is needed") | Makkouk 2008, PMID 19468879 |
| `neuralgic_amyotrophy` | New `h_sudden_severe_arm_pain` (`usual`, 96%) and `h_scapula_winging` (`usual`, about two-thirds); context on misdiagnosis | van Alfen 2007, PMID 17446996 |
| `long_thoracic` | `h_scapula_winging` (`usual`) | Martin RM 2008, PMID 19468892 |
| `cubital` | numbness check cited | McGurk 2023, PMID 37521550 |
| `guyon` | **Correction:** uncited numbness `usual` removed, because compression in Guyon's canal can be purely motor; context added | McGurk 2023 |
| `musculocutaneous` | numbness `usual` cited; context on surgical and needle causes | Memon 2022, PMID 35747042 |
| `median_proximal`, `facet_lbp`, `tos`, `suprascapular`, `radial_tunnel` | Context only | Balcerzak 2022 (36292122), Perolat 2018 (30090998), Li 2021 (33804565), Kostretzis 2017 (28400882), Engin 2023 (36861868) |
| `lfcn`, `obturator`, `cts`, `de_quervain` | Existing uncited `usual` checks now cited | Paneyala 2024 (Introduction), Bradshaw 1997 (Abstract), Zaki 2022 (Abstract), Fakoya 2023 (PMID 37252462) |

**Still uncited:**
- 15 `usual` checks: meralgia burning; ilioinguinal surgery link; femoral motor and sensory pattern; superficial radial numbness; golfer's elbow grip; frozen shoulder and shoulder OA stiffness; biceps front-of-shoulder pain; thumb-base pinch; hip impingement deep flexion; adductor trigger history; AC point; neck movement; intersection resisted extension; RSI repetitive use and diffuse pain.
- About 40 `unexplained` anatomical notes (these never count against an option).
- Nothing found for frozen shoulder, shoulder OA, the axillary nerve, the femoral nerve or neck joint pain in open-access full text. Gutkowska 2020 (axillary injury after dislocation) was read but gave nothing usable in the passages retrieved.

## Clean-up and diagrams (2026-11-03)
- **Removed** `h_forearm_widespread` and its uncited `usual` check on `nonspecific_arm_pain` (user decision). "One spot" was undefined, and no source says non-specific arm pain is diffuse. Moloney 2013 found widespread *sensitivity* on testing, not widespread pain. A vague uncited "no" was counting against the option.
- **Renamed** `nonspecific_arm_pain` to "Non-specific work-related arm pain (no specific cause found)". Its description now says RSI is an umbrella term covering specific conditions, such as intersection syndrome, De Quervain's, tennis elbow and CTS, which are their own options; this one is for repetitive-use pain when none fits.
- **Diagrams.** Every self-test has an illustrative line drawing (`src/ui/TestDiagram.tsx`), shown above its instructions with a caption. They are illustrations, not evidence; the written instructions remain what the sources describe. A vignette test fails if a self-test has no diagram.

## Type of stress on the nerve (user decision, 2026-11-03)
**Idea (user).** All pain travels on nerves. If the app identifies the nerve *and* the kind of stress on it, the likely cause, how to confirm it and how to treat it follow. Treatment is deferred: it isn't in the app.

**What was built.** A display-only layer beside the probability and the logical fit:
- A "Describe your pain" screen (session phase `profile`, between the body map and the interview) with 20 `kind: "profile"` questions: 10 sensation words (burning, tingling, buzzing, numb, dull/aching, throbbing, tight, shooting, stabbing, heavy/weak) and 10 timing/behaviour questions (`p_*` in `findings.json`). They have no evidence, are never picked by the question selection and don't use up `QUESTION_BUDGET`.
- `evidence/stress.json`: 9 stress types (compression, tension, friction, ischaemia, inflammation, immune, injury, sensitisation, tissue overload where the nerve only carries the pain), each with clues (answers that fit) and the conditions it usually acts in. `src/engine/stress.ts` counts clues as fit / against / unknown, like `logic.ts`.
- Results: "What kind of stress fits your pain?", ranked by fit minus against, plus the stresses the leading options usually involve, with ✓ where the patient's description matches.
- Listed as not assessed: thermal, toxic, metabolic, infection, arterial disease.

**Modelling rules.**
- Like `logic`, clues and condition links may be uncited clinical reasoning (a `reason`, never a number) and are labelled "reasoning, uncited". Nothing in this layer feeds `bayes.ts`; a vignette test checks that answering every profile question "yes" leaves the posterior unchanged.
- A `usual` clue (the stress's defining feature: stretch for tension, activity-then-rest for ischaemia, rest/night pain for inflammation, sudden severe onset for immune, an injury for trauma, a pressable or loadable spot for tissue) counts against when answered the other way. A `supports` clue only fits. A stress "matches" only if its defining clue fits, so weakness alone doesn't suggest an immune attack.
- A clue over several findings (`anyOf`) is "yes" if any is yes. Tingling and buzzing share one clue so they aren't counted twice.
- Profile "no" answers logically imply the leg descriptor questions (`p_burning` no → `h_leg_burning` and `h_buttock_burning_walking` no; `p_shooting` → `h_leg_shooting`; `p_tingling` → `h_leg_tingling`), since the profile asks about every marked area. A "yes" implies nothing: the leg question is still asked, because the word may describe an arm.

**Citations reused (no new sources).** Condition links cite the hypothesis's existing `mechanism` source where its text states the stress: compression for 10 nerves (Mostofi 2018, van der Windt 2010, Suri 2010, Filler 2005, Paneyala 2024, Ahmed 2026, Kuniya 2014, Bradshaw 1997, Knockaert 1989, Joshi 2017); friction for IFI (Martin 2015); immune for AIN (Pham 2014); tissue for hip OA, SIJ, GTPS, IFI, intersection syndrome. Injury links cite the existing surgery context flags (Goulding 2010, Ergönenç 2017, Kitagawa 2009). Every other link and every clue is uncited reasoning.

**Why the clues are reasoning and not probabilities.** Pain words discriminate weakly where they have been studied (Konstantinou 2012: burning 27% in root pain; DN4/painDETECT LR+ ≈ 1.3–1.5, Epping 2017), and no study found maps a descriptor to a *mechanism* (compression vs ischaemia vs chemical) with accuracy data. Next step: a `mine-literature` pass for descriptor and behaviour studies per condition; anything with sens/spec goes into the probabilities through the usual process.

### Descriptor literature pass (2026-11-03)
Europe PMC searches: pain descriptors/quality × radiculopathy, CTS night/diagram, neurogenic vs vascular claudication, neuropathic vs nociceptive descriptors, cubital symptoms, tendinopathy vs nerve.
- **Scholz 2009** (StEP, PMID 19360087, already a source; full text PMC2661253). Results/Table 2: a burning or cold pain quality (weight −1) and brush allodynia (−2) count *against* radicular vs axial LBP; "limited discriminatory power of pain qualities". Discussion: brush allodynia likely reflects dorsal-horn excitability; the same mechanisms occur across diseases. Used for the sensitisation clue (`p_light_touch`) and two cited caveats in the stress section. No per-item sens/spec is reported, so nothing feeds the probabilities.
- **Förster 2013** (PMID 23844179, new source, full text PMC3699535). 1,083 people with axial LBP, painDETECT: clinically relevant burning 16.2%, prickling 10.9%, allodynia 5.6%, numbness 4.9%, pressure-evoked pain 22.8% (Table 2); Discussion describes nociceptive back pain as dull, aching and pressure-tender. Cited on four tissue-overload clues and one caveat. Case-only frequencies (no comparison group), so tier 3: display only.
- **Nadeau 2013** (PMID 24284143, *Can J Surg*, PMC3859778, not OA in Europe PMC). Symptom attributes for neurogenic vs vascular claudication with sens/spec/LRs, e.g. no pain on standing alone sens 0.97, NLR 0.05 for stenosis; the constellation shopping-cart sign + above-knee + standing trigger + sitting relief PLR 13. Candidate for when arterial (vascular) claudication is added as an option; not usable now because PVD isn't modelled. Values above are from the abstract and need the table before entry.
- **Leads not followed up:** Schmid 2022 "Disentangling 'sciatica'" (PMID 34333881, somatosensory profiles, not OA); Bouhassira 2005 DN4 development (PMID 15733628, per-item frequencies in nerve vs somatic lesions, mixed non-spinal population, wording copyrighted); the CTS diagram/questionnaire review (PMID 32938312; scale scores, not single descriptors).
- **Conclusion:** no study found gives sensitivity/specificity of a single pain word or timing feature for a *mechanism*. The descriptor → stress mapping stays reasoning plus tier-3 citations.

## Ischiofemoral impingement helper test; candidate-question search (2026-11-04)
- **Added `st_ifi_helper`** (helper-performed IFI test, `adapted`):
  - accuracy from Gómez-Hoyos 2016 (Abstract, Results): sens 0.82 (14/17), spec 0.85 (11/13); Wilson CIs computed as for the long-stride test;
  - procedure from Martin 2015, Fig. 5: side-lying, passive hip extension in neutral or adduction reproduces the pain, extension with abduction does not;
  - shares the new `ifi_provocation` dependence group with `st_long_stride_walk` (same study, same mechanism), so only the stronger answer counts.
- **Prompted by** dev case c42597769, whose report states a positive IFI test. Its fact was coded once the question existed (normal coding, no tuning).
- **No accuracy data found** (Europe PMC, 4 searches):
  - "pain lying on the affected side" for gluteal tendinopathy: only reviews and case reports;
  - "clicking/snapping" for ischiofemoral impingement: nothing.
  - Neither was added.
- **Candidates for a later pass** (clinician tests for gluteal tendon pathology, not yet read):
  - broken wing sign (PMID 40938961, not open access);
  - hip drop test (PMID 40980250, OA);
  - modified resisted internal rotation test (PMID 31019887, OA).

## CHECK cohort publications (2026-11-04)
Europe PMC search for CHECK papers on hip clinical signs and diagnostic accuracy.
- **Rondas 2022** (PMID 36127152, BJGP, PMC9512408), new source. In primary care at ages 45-65, definite hip ROA (KL >= 2) was present in 105/789 painful hips (13.3%) vs 9.5% of pain-free hips (OR 1.51).
  - Added as cited `context` on `hip_oa`. No single-feature accuracy, so no probability.
  - Our own count from the open CHECK release reproduced the 105 hips.
- **PMID 38862243** (2024, open access): multivariable odds ratios for developing clinically relevant hip OA 5-10 years later (WOMAC stairs/night/rest items, painful or restricted flexion/abduction). Prognostic, not the accuracy of a sign for present disease, so not usable as likelihood ratios.
- **PMID 33576373** (incident hip OA) and **PMID 39074968** (FAIS → OA): prognostic; not used.
- **PMID 37933434:** knee criteria; out of scope.

## Chest and upper back (2026-11-04)
User request: expand to the chest and upper back. Sources found with `npm run mine-literature -- root_thoracic intercostal zoster chest_wall thoracic_spine multi_chest` (new terms in the script; the earlier `mining/wanted.md` is kept as `wanted-before-chest.md`), then targeted Europe PMC searches. Full texts were read where open access. Nothing was entered from memory.

**Regions.** `chest_front`, `chest_side`, `upper_back` (between the shoulder blades) and `mid_back` (lower ribs at the back), drawn as two trunk figures. `upper_back` was added to `root_cervical` and `neck_joint`, because the neck refers pain between the shoulder blades (an anatomical territory, not a number).

**Safety notice.** Chest pain can be cardiac, pulmonary, aortic or gastrointestinal, and none of those is modelled. Red flags stay removed (user decision, 2026-11-03), so nothing is asked and nothing stops. Instead, when a chest region is marked, the region screen and the results show a fixed notice: what the tool doesn't cover, chest pain spreading to the arms raising the likelihood of MI (Panju 1998, Abstract), and when to call emergency services. "Other" stays the catch-all, so a set of chest answers that doesn't fit chest wall pain ends up mostly in "other".

**Scored:**
| Finding | Hypothesis | Counts (TP/FP/FN/TN) | Source |
|---|---|---|---|
| `st_chest_press_self` (pressing reproduces the pain; adapted from GP palpation) | `chest_wall` | 351/193/214/454 → 0.621 / 0.702 | Wertli 2013 (PMID 24207111), Table 7, Bösner et al. rows |
| `h_chest_movement` | `chest_wall` | 221/119/344/528 → 0.391 / 0.816 | same |
| `h_chest_stinging` | `chest_wall` | 299/184/266/463 → 0.529 / 0.716 | same |
| `h_cough_now` | `chest_wall` | 31/129/534/518 → 0.055 / 0.801 (a "yes" points away) | same |
| `h_chest_breathing` | `chest_wall` | 138/123/427/524 → 0.244 / 0.810 (weak) | same |
| `h_known_heart_disease` | `chest_wall` | 56/122/509/525 → 0.099 / 0.811 (a "yes" points away) | same |
| `h_back_sudden_onset` | `vertebral_fracture` | 77/142 vs 43/179 → 0.542 / 0.760 | Sawicki 2021 (PMID 33597390), Table 3 |
| `h_back_limits_activity` | `vertebral_fracture` | 118/149 vs 82/183 → 0.792 / 0.552 | same |

- The Bösner 2010 cohort (PMID 20406787; paywalled, abstract read) had 1,212 GP patients aged 35 or over with chest pain, 565 of them chest wall syndrome by an interdisciplinary reference panel. The counts come from Wertli's Table 7, which tabulates it. CIs are Wilson intervals from the counts.
- The comparison group is every other cause of chest pain in primary care (cardiac, GI, respiratory, psychogenic), so the other chest options get that group's false-positive rate. That is the usual one-vs-rest rule.
- Sawicki 2021 compares osteoporotic women with and without a vertebral fracture on densitometric assessment. The fracture is prevalent, not necessarily the cause of the current pain, and most pain was lumbar. Treat it as low-to-moderate certainty. `low_back` was not added to the fracture's territory, so lumbar scoring is unchanged; revisit if wanted.

**Not pooled or not used:**
- **Stochkendahl 2012** (via Wertli Table 7): acute chest pain after cardiac rule-out in an emergency cardiology department. Its population differs from Bösner's, so it was not pooled. "Worse on movement of torso" was 0.29/0.92 there.
- **Bösner "localized muscle tension"**: needs an examiner's hands.
- **Bösner "pain >24 h"**: ambiguous wording.
- **Ronga 2012** (PMID 22866824): odds ratios only, plus palpation sensitivity 201/284; context only. It notes that palpation is not pathognomonic.
- **Van Tongel 2014** (sternoclavicular joint): only 4 patients without the condition, so its specificities (25–100%) are meaningless; its frequencies feed a cited `logic` item.
- **Gräni 2015**: chest wall tenderness to rule out acute coronary syndrome. That is a cardiac target, not ours.
- **Slipping rib dynamic ultrasound** (Van Tassel 2019, Schultz 2025): imaging; a confirmatory candidate.
- **Xiao 2026**: an intercostal neuralgia prediction model after vertebral fracture; prognostic.

**Listed, logical fit only (new information-only `alwaysAsk` questions):**
| Hypothesis | Checks | Sources |
|---|---|---|
| `root_thoracic` | `h_trunk_band` usual (uncited; the wording allows part of the strip, because Stewart 1989 found partial patterns in about two-thirds of diabetic episodes) | Quint 2012 mechanism; Brown 1992, Stewart 1989 context |
| `intercostal` | `h_chest_surgery_injury`, `h_trunk_band` usual (uncited) | Arends 2020 context (28.6% PTPS, 63% neuropathic) |
| `zoster` | `h_band_rash`, `h_trunk_band` usual (cited) | Jeon 2015 (rash, unilateral dermatome, 75% prodrome, antivirals within 72 h), Sinha 2023 (thoracic 59.7%), Zhou 2020 (no-rash form) |
| `notalgia` (sensory only) | `h_back_itch` usual (cited) | Robinson 2023 |
| `slipping_rib` | `h_rib_click` usual (cited) | McMahon 2018; Foley 2019 context |
| `thoracic_joint` | `h_back_movement` usual (uncited); numbness note | Young 2008, Briggs 2009 context |
| `sc_joint` | `st_sc_protraction_self` usual (cited, 86%); numbness note | Van Tongel 2014 |
| `chest_wall`, `vertebral_fracture` | `h_trunk_numbness` unexplained note | Fam 1985 mechanism; Bösner, Verdon, Ronga, Sawicki context |

**Stress links:**
- compression: root_thoracic (Quint), notalgia (Robinson), slipping_rib (McMahon), intercostal (uncited);
- injury: intercostal (uncited);
- inflammation: zoster (Jeon);
- tissue: chest_wall, thoracic_joint, vertebral_fracture, sc_joint.

**Known gaps (chest):**
- No accuracy data for any thoracic nerve option. Shingles, notalgia, the intercostal nerve, the thoracic root and slipping rib are all logic-only.
- No case reports in `cases/cases.json` yet for these regions.
- **DOI audit.** `npm run audit-sources`: all 124 DOIs match their PMIDs (Fam 1985 has no DOI).
- Worth fetching: Stochkendahl 2012 full text (chest pain of musculoskeletal origin), Bösner 2010 full text (to check the Wertli counts against the original), Han 2023 / Williams 2013 Cochrane (vertebral fracture red flags, low back populations).

## What eases or worsens the pain (user decision, 2026-11-03)
**Idea (user).** Use facts about how the body works as well as study data. Example: a warm bath easing the pain fits tight muscle.

**Agreed limits.**
- Mechanism gives a direction, not a size. These rules go into the logical fit and the stress view, never into `bayes.ts`.
- Most reliefs and triggers are shared. Warmth also eases the muscle spasm around a disc problem, so "eased by warmth" fits muscle without counting against a disc. A new `logic` type, **`supports`**, encodes this: "yes" fits, "no" drops the check (it isn't counted as unknown either). `usual` stays the only reasoning that can count against an option.

**Added (all uncited reasoning, labelled so):**
- New profile block "What makes it better or worse?" (`profileGroup: "behaviour"`):
  - `p_heat_eases`, `p_movement_eases` (no region gate);
  - `p_lying_eases`, `p_flexion_worse`, `p_extension_worse` (gated to the 12 lower-limb and back regions). The profile screen now respects `gateRegions`.
- New option **`muscle_lbp`** ("Muscle strain or tight back muscles", mimic, low back and buttock), logic only: `supports` on warmth, tightness and easing with movement; `usual` on a pressable or loadable spot; `unexplained` notes for leg numbness and pain below the knee. No source has been read for it, so it has no mechanism or context.
- `supports` items: `disc_pain` (worse bending forward, eased lying down), `root_low` (same two), `facet_lbp` and `stenosis` (worse leaning back).
- Stress view, tissue overload: `supports` clues for warmth and for easing with movement; `muscle_lbp` linked.

**Already scored from studies, not duplicated:** sitting (Vroomen 2002, Tonosu 2018), cough/sneeze (Vroomen 2002), walking claudication, bending forward relief and worse standing for stenosis (Suri 2010). The profile questions on bending are separate, display-only questions about the back pain itself.

**Not added:** "eased by cold" (no clear mechanism that separates the options); morning stiffness over 30 minutes as inflammatory back pain (no inflammatory back pain option exists yet).

### Literature pass on easing and aggravating factors (same day)
Europe PMC and PubMed. Full texts were read where open access, and the counts below were re-checked against the downloaded XML.

**Removed after reading (user decision).** Two of the first set of reasoning rules don't separate back problems, so a "fit" on them was nearly universal:
- "Worse leaning backward" (`p_extension_worse`; `supports` on `facet_lbp` and `stenosis`). In Manchikanti 2000 (double facet block), pain was increased by hyperextension in 90% of facet patients and 86% of the others (Petersen 2017, PMID 28499364, PMC5429540, Table 2; secondary, original not read). Konno 2007 "induced by bending backward" 0.62/0.48 (same table).
- "Eased lying down" (`p_lying_eases`; `supports` on `disc_pain` and `root_low`). Relief lying down: Manchikanti 2000 0.94/0.17 (LR 1.1). The single-block studies Revel 1998 (0.96/0.48) and Revel 1992 (0.63/0.76) were modestly positive (Petersen 2017, Table 2).

**Scored (user decision, low certainty): `h_lbp_half_bent` for `disc_pain`.**
- "Low back pain while half-bent forward, e.g. washing your face": 31/42 discogenic vs 6/30 controls, so 0.738 (0.589–0.847) / 0.800 (0.627–0.905), with Wilson CIs. Source: Tonosu 2016 (PMID 27820861, PMC5098755), Table 1.
- Caveats:
  - case-control design;
  - the controls are stenosis patients (mean age 71 vs 53), in whom bending forward tends to ease symptoms, so specificity is likely inflated (compare Konno 2007, which was rejected for an age gap);
  - as with centralisation, the other back options get this study's false-positive rate (0.20), so a "yes" also counts against the nerve roots, although disc herniation is also often worse with bending.
- It replaces the uncited `supports` rule on `disc_pain`. The profile question `p_flexion_worse` stays (`supports` on `root_low`, uncited); its "no" implies `h_lbp_half_bent` "no", since half-bent is a forward bend.
- Not entered from the same table: the sitting items (they overlap `h_pain_sitting_chair`) and "LBP standing with flexion", 22/42 vs 2/30 (the same movement as the half-bent item).

**Read, not used:**
- **Poddubnyy 2018** (PMID 30713715, PMC6336095), Table 4: inflammatory back pain items self-reported by 403 rheumatology referrals. Morning stiffness ≥ 30 min 69.4/30.1, improvement with exercise 83.0/18.6, night pain 77.6/26.9, no improvement with rest 81.1/30.8; every LR ≈ 1. There is no axial spondyloarthritis option, and these items wouldn't help if there were.
- **Nadeau 2013** (PMID 24284143, PMC3859778), Tables 3–4, read in full (replacing the abstract values above). Stenosis vs vascular claudication, 30 vs 23: triggered by standing alone 0.97/0.70; relieved by sitting 0.83/0.78; shopping-cart sign 0.80/0.52. Still waits for a vascular claudication option.
- **Laslett 2004** (PMID 15546487, PMC534802), Table 2: Revel criteria vs single facet block, 116 patients; sensitivity 0.11, specificity 0.91. Not informative.
- **Revel 1998** (PMID 9779530; the authors say its criteria are not diagnostic), **Young 2003** (PMID 14609690; pain rising from sitting is associated with disc and SIJ pain, abstract without numbers), **Peters 2026** review (PMID 42253287; flexion and prolonged sitting of "modest" value for discogenic pain, Valsalva unsupported) and **Sieper 2009** ASAS criteria (PMID 19147614): context, not entered.
- **Heat or cold relief, myofascial back pain:** no diagnostic study found. `muscle_lbp` and the warmth rules stay uncited reasoning.

**Paywalled, worth getting:** Rudwaleit 2006 (10.1002/art.21619; inflammatory vs mechanical back pain items, under-50s), Sugioka 2008 (10.1093/fampra/cmn031), Laslett 2006 (10.1016/j.spinee.2006.01.004), Kurosawa 2017 per-item counts, Manchikanti 2000 full text.

**DOI audit.** `npm run audit-sources`: all 125 DOIs match their PMIDs.

## Pain description asked on a need-to-know basis (user request, 2026-11-04)

- The "Describe your pain" page is gone. Its `kind: "profile"` questions are asked at the end of the interview, one at a time, by `nextAfterScored` (`src/engine/selection.ts`), only while they can tell the options still in play apart. In play means scored options at `IN_PLAY_P` (5%) or above, plus unscored options whose logical fit isn't ruled out. A question qualifies if it is a `logic`/criteria check for an option in play, or a clue to a stress type linked to some but not all of them that hasn't been settled. A stress with a "usual" clue is settled once that clue is answered, and only that clue is asked; one without is settled by the first clue that fits.
- No evidence changed and no probability is affected (profile questions have no `evidence`). The stress view simply shows more clues as unknown.
- The profile → leg implications above still apply, but the profile answer now comes after the leg question, so they rarely save a question.
- Effect on synthetic patients: about 22 description questions up front down to about 7 at the end; whole interview about 33 down to about 18. Dev case reports: interview top-3 unchanged (18/23).
- Also on 2026-11-04: `MIN_INFORMATION_GAIN_BITS` raised from 1e-6 to 0.03, and an information-only question is skipped once every option it checks has more "against" than "fit" (`ruledOutOptions`). Dev interview top-3 unchanged at 18/23; holdout interview top-3 8/11 → 7/11.
- Fix (same day): the 0.03-bit threshold stopped `h_worst_medial_thigh` being asked. It is scored only for hip OA (weakly), and it is the obturator nerve's only logical-fit check, so obturator showed nothing for or against. `nextAfterScored` now also asks, after the scored questions, every logical-fit or criteria-linked check for an unscored option still in play.
- Checklist items linked to questions (user decision, same day: "if an option is still in play we should ask about it; if there is enough evidence against it, we shouldn't"). The 15 unlinked `criteria` items for obturator (Bradshaw 1997; stretch from Brukner 1999, numbness from Kitagawa 2009), pudendal (Nantes, Labat 2008), cluneal (Kuniya 2014) and ilio_genito (Knockaert 1989) each got an information-only finding with the item's wording: `h_obt_*`, `st_obt_stretch_self`, `st_obt_skin_self`, `h_pn_*`, `st_scn_tender_self`, `st_scn_reproduce_self`, `h_ii_pain`, `h_ii_sensory`, `st_ii_trigger_self`. They are gated to the option's regions and have no `alwaysAsk`. `nextAfterScored` asks them while the option is in play and stops once its logical fit has more against than fit. "Unsure" never counts against, so it keeps the option in play. The results checklist now fills in from these answers. No number changed and nothing is scored.
- The rule that an information-only finding must be followUp/askIf/alwaysAsk/profile moved from `schema.ts` to `checkIntegrity`, which also accepts a finding that a criteria or non-"unexplained" logic item links to.
- Effect: dev cases about 1.7 more questions on average (most cases code few of these facts, so they answer "unsure"); accuracy unchanged. `cases.json` doesn't code the new findings yet.

## Forefoot: Morton's neuroma and its alternatives (user request, 2026-11-04)
User question: does the tool cover Morton's neuroma? It didn't: there was no forefoot region and no forefoot condition. The user chose the "proper" scope: a forefoot region with Morton's and the common alternatives, so the comparison group in the one usable accuracy study matches what the engine computes. Sources were found with `npm run mine-literature -- morton plantar_plate mt_stress_fracture hallux_rigidus tarsal_tunnel multi_foot` (new terms in the script). Full texts were read where open access. Nothing was entered from memory.

**Region.** `forefoot` ("Ball of foot / between the toes"), drawn at the toe end of both foot outlines. It was added wherever `foot_sole_lateral` already was: the `root_low` and `stenosis` territories and every finding gated on the sole (an anatomical rule: the S1/L5 skin areas include the sole and toes). `foot_sole_lateral` was relabelled "Sole (arch or heel) or outer edge of foot", with no change of meaning.

**Scored (`morton`, low certainty).** All three come from Dando 2018 via Pitcher 2024 (PMID 39564390, PMC11574893), Table 3. Dando is a Southampton doctoral thesis without a PMID or DOI, so it is cited through the review's table, as with Bösner via Wertli.
| Finding | Counts (TP/FP/FN/TN) | Sens / spec as reported |
|---|---|---|
| `h_ff_click` | 4/1/3/22 | 0.57 (0.18–0.90) / 0.96 (0.78–1.00) |
| `h_ff_tight_shoes` | 6/10/1/13 | 0.86 (0.42–1.00) / 0.57 (0.35–0.77) |
| `h_ff_im_space` (2nd/3rd intermetatarsal space) | 6/12/1/11 | 0.86 (0.49–0.97) / 0.48 (0.29–0.67) |

- Dando: prospective, 30 adults with forefoot pain (rearfoot and midfoot pain excluded), one podiatrist, ultrasound reference; 7 with a neuroma, 23 without. Only 7 cases, so every sensitivity CI is wide. The review rated only 1 of its 9 studies at low risk of bias.
- The comparison group is people with *other forefoot pain*. Under one-vs-rest, the other scorable options in the territory (`root_low`, `stenosis`) get these false-positive rates, which is a spectrum mismatch; the forefoot tissue options are unscored and sit in "other".
- **Not entered from Dando:** burning (LR 1.1), pebble feeling (0.9), shooting pain (1.17), forefoot pain (1.15; it is the region itself), and the two paraesthesia rows. In the extracted table those two rows ("paraesthesia into toes" 4/12/3/11 and "pins and needles" 6/13/1/10) sit under merged labels, so which row is which needs checking against the PDF. The exam items (Mulder 0.29/0.87, webspace tenderness 0.57/0.30, lateral compression 0.14/0.78) are clinician tests.

**Cited reasoning and checklists (no probability):**
| Hypothesis | Added | Source |
|---|---|---|
| `morton` | `p_activity_rest` usual (worse walking 91–92%, eased by rest 81–89%, three case-only studies); new `h_ff_shoes_off_eases` usual (57–71%) | Pitcher 2024, Table 3 |
| `morton` | Criteria checklist: 14 patient items of the Delphi protocol, plus Mulder's click, diagnostic injection, ultrasound and X-ray as clinician-only. Linked to `h_ff_im_space`, `h_ff_click`, `h_ff_tight_shoes` and the new `st_ff_squeeze_self` (thumb–index pinch of the gap). The pinch had sensitivity 0.95–1.00 in three studies (0.68 in a retrospective fourth), so a "no" fairly counts against. Burning, shooting pain and pins and needles stay unlinked: their sensitivity is only 0.54–0.71 | Dando 2017 (PMID 29299065, PMC5745595), Table 1; Pitcher Table 4 |
| `plantar_plate` | `h_ff_gradual_onset` (93%), `h_ff_2nd_head` (98%), `h_ff_swelling` (95.8%) usual; `h_ff_toe_drift` supports (crossover toe, specificity 88.9%); numbness note (uncited) | Klein 2013 (PMID 23696184), Abstract: all 109 feet had surgery, so its specificities are not used for probabilities |
| `hallux_rigidus` | `h_big_toe_tender` (98/98), `h_big_toe_bump` (97/98), `h_big_toe_bend` (74/98) usual; context: burning 24.5%, numbness 12.2%, possible or likely neuropathic pain 30.6%. No numbness note, because numbness occurs | Menz 2023 (PMID 37013633, PMC10952225), Tables 1–2 |
| `mt_stress_fracture` | `h_ff_load_increase`, `h_ff_bone_point` usual; numbness note. All uncited | none found |
| `tarsal_tunnel` | `h_leg_numbness`, new `h_sole_wide` usual (uncited). Territory: sole and forefoot | none found |

**Confirmatory:**
- Forefoot ultrasound 0.91/0.854 and MRI 0.90/1.00 (Bignotti 2015, PMID 25809742, Abstract; surgical reference).
- Mulder's click: Dando 0.29/0.87; Cloke 0.94/0.17; Mahadevan sensitivity 0.64, with only 1 foot without a neuroma (Pitcher Table 4). Recommended by Dando 2017 (15/16 votes).
- Plantar plate MRI 0.89/0.83 and dynamic ultrasound 0.95/0.52 (Albright 2022, PMID 35533558, Abstract).
- Drawer test 0.806/0.998 (Klein 2013, surgical cohort).
- Triple compression stress test for tarsal tunnel, 0.859/1.00 (Abouelela 2012, PMID 22405941, Abstract; healthy controls, so specificity is overstated).

**Stress links:** compression: `morton`, `tarsal_tunnel` (uncited); tissue: `plantar_plate`, `mt_stress_fracture`, `hallux_rigidus`.

**Read, not used:**
- Klein 2014 (PMID 25239377): high vs low grade tears only.
- Imaging-only studies: Zaleski 2021 radiographic angle, Galley 2022 radiographic sign, Sussan 2026 elastography, Torres-Claramunt 2012, Xu 2015 (paywalled; Bignotti used instead).
- Ottawa foot rules and the Shetty test: acute injury.

**Effect.** Dev case reports unchanged (top-3 19/23, interview 18/23, logical fit 32/46); there are no forefoot cases yet. Synthetic Morton's patient (click, tight shoes, positive pinch, worse walking): 14 questions, Morton's 0.89, logic +5/−0, plantar plate −2.

**Worth getting:**
- Dando 2018 thesis (https://eprints.soton.ac.uk/427315/; the download needs a browser). It would confirm the paraesthesia rows, show the diagnoses in the 23 people without a neuroma, and could add history items.
- Mahadevan 2015 (PMID 25432459) and Pastides 2012 (PMID 22325999) full texts; Owens 2011, Cloke 2006.

**Mining output.** The miner rewrites `mining/wanted.md` on each run. The chest list was regenerated as `wanted-chest.md`, the forefoot list is `wanted-forefoot.md`, and `wanted.md` is currently the forefoot list.

**DOI audit.** `npm run audit-sources`: all 132 DOIs match their PMIDs.

### Dando 2018 thesis read (user-supplied PDF, 2026-11-04)
- **Rows check.** Table 14 (p. 107–108) matches the Pitcher Dando rows already used: click 57/96, tight shoes 86/57, 2nd/3rd IM space 86/48. It also settles the merged rows: "paraesthesia radiating distally in the toes" is 57/48 (LR 1.1, not used) and "pins and needles reported by the patient" is 86/43 (LR+ 1.5, LR− 0.3).
- **Added:** `h_ff_pins_needles` for `morton`, 0.86 (0.42–1.00) / 0.43 (0.23–0.64), via Pitcher Table 3. "No numbness or pins and needles" (`h_leg_numbness` no) implies "no". It is not in the `paraesthesia` dependence group, because that group's members carry root-level evidence, and grouping would let one answer drop the other's information for a different hypothesis. Linked to the Delphi checklist item `ms_pins`.
- **Comparison group (p. 100–101, Table 12).** The 23 people without a neuroma had bursitis, degenerative joint changes, joint hypertrophy, capsulitis, synovitis, ganglion, tendonitis, fat pad atrophy, fibroma, or no pathology on ultrasound. Capsulitis and synovitis belong under `plantar_plate`. Intermetatarsal bursitis, fat pad atrophy and ganglion are not modelled and sit in "other".
- **Thesis accepted as a source (user decision, 2026-11-04).** A doctoral thesis without a PMID or DOI may be cited by its university repository record (`thesis: {institution, url}` on the source). The validator warns on every entry that uses one; the UI shows a "thesis" badge on the citation and a low-certainty note on the option. `audit-sources` can't check it (no PMID).
- **Added from it:** `h_ff_met_spread` for `morton`, "pads, a metatarsal dome or insoles that spread the bones apart ease it". Table 14 reports 86% / 70%; the counts 6/7 and 16/23 are derived from the percentages (16/23 = 69.6%, the only count that rounds to 70%), and the CIs are Wilson intervals: 0.86 (0.49–0.97) / 0.70 (0.49–0.84). Pitcher doesn't tabulate this item. It is linked to the Delphi checklist item `ms_spread`.
- **Not entered:** the whole-protocol result (7/7 and 22/23 against ultrasound, 5.7.3), because it is a podiatrist's overall judgement, not a question; and the near-useless items (paraesthesia into the toes, burning, pebble, LR about 1).
- Dev case reports unchanged (top-3 19/23, logical fit 32/46).
