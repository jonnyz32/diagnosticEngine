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
  - `flexion_walking`: claudication / bending forward / easing on standing still / no pain sitting / better sitting / worse standing (the posture items were a separate `posture_sitting` group until 2026-11-06; merged, see "Stenosis posture items merged")
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

## Leg look-alikes: narrowed arteries, peroneal nerve, polyneuropathy (user request, 2026-11-04)
User request: start on the coverage gaps, beginning with the three conditions that compete directly with the lumbar roots and stenosis. New miner terms `peroneal`, `polyneuropathy`, `pad`; run with `npm run mine-literature -- peroneal polyneuropathy pad` (18, 171 and 175 candidates). The previous `wanted.md` (forefoot) was copied to `wanted-before-leg-mimics.md`; `wanted.md` is now the leg-mimics list. Nothing was entered from memory.

**Scored: `pad` (narrowed leg arteries, vascular claudication; category mimic).** Nadeau 2013 (PMID 24284143, PMC3859778), Tables 3–4, re-read in the PMC full text: 53 claudicants, 30 with stenosis on MRI and 23 with ABI < 0.9; concurrent disease, neuropathy, hip/knee OA and previous surgery excluded. Table 3 has stenosis as the target and Table 4 vascular claudication, so the rate in the vascular group for a Table 3 item is 1 − its specificity (CI likewise).
| Finding | PAD rate | Comparison rate | Source of comparison |
|---|---|---|---|
| new `h_walk_stand_still_ease` (walking pain eases within minutes on standing still, without sitting or bending) | 0.78 (0.56–0.92) | spec 0.90 (0.72–0.97) | same study: stenosis patients only |
| `h_worse_standing` | 0.30 (0.14–0.53), from 'Trigger: standing (1)' spec 0.70 | spec 0.70 (0.65–0.76) | `specFrom` Suri 2010, Table 3 |
| `h_bend_forward` | 0.48 (0.27–0.69), from 'Shopping cart sign (4)' spec 0.52 | spec 0.92 (0.88–0.95) | `specFrom` Suri 2010, Table 3 |

- `h_walk_stand_still_ease` is Nadeau's 'Alleviator: standing (3)', "standing still/no walking" (Results). Its comparison group is stenosis only, so every other leg option gets the stenosis rate (0.10) as its false-positive rate: a spectrum mismatch, as with Morton's. No stenosis entry was added from Table 4, because a stenosis entry with the vascular group as comparator would pull the non-target average to 0.44. The prompt names the walking trigger, so a "no" also covers people without walking pain; in Nadeau every patient had walking pain. It is in the `flexion_walking` dependence group, because a yes almost always comes with walking pain (the same patients as `h_walking_claudication`).
- The two `specFrom` entries borrow Suri's leg-pain patients without stenosis as "comparable people without PAD". Low certainty, labelled. They only set the PAD rate; borrowed rates don't vote in the non-target average.
- **Not mapped:**
  - `h_walking_claudication`: its prompt says the symptoms ease "when you stop and sit or bend forward", the neurogenic definition. A PAD patient may fairly answer no, so Nadeau's walking-trigger rate (0.96) doesn't apply to that wording. Rewording would change what Suri/Konno's figure means, so it was left alone.
  - `h_improve_seated`: Nadeau's 'Alleviator: sitting (3a)' has only 22% of the vascular group "yes". The questionnaire wording (appendix) is not online, and the item probably means sitting is *needed* for relief, so mapping it to "better when you sit" could understate PAD.
  - Numbness, cramping, burning, weakness, uphill, time to relief: LR about 1. Calf location (context only): the body map already gates by region.
- Regions: buttock, back/front/outer thigh, calf. Context: calves 78% vs 27% (Table 4); the calf + standing-still constellation LR+ 20. Mechanism: Nadeau Introduction and Methods.

**Unscored, cited reasoning: `peroneal` (common peroneal/fibular nerve at the fibular head).** Saber 2026 (PMID 42769875, PMC13591402), narrative review, sections 3a, 3b and 4. Regions: front of shin, top of foot.
- `supports`: `st_heel_walk` (foot drop), `h_leg_numbness` (outer leg, top of foot), new `h_peroneal_setting` (leg crossing, weight loss, long positioning, outer-knee injury).
- `unexplained`: `st_heel_raise` (plantar flexion spared), `h_bilateral_sole_numbness` (sole spared), `st_slr_helper` (nerve-tension signs point to the root), `h_cough_sneeze` (uncited, as for the other nerves outside the spine).
- Confirmatory: nerve ultrasound 0.90 (0.797–0.973) / 0.92 (0.7745–0.961) (Bignotti 2017, PMID 27668978, Abstract; healthy controls, so specificity is overstated); nerve conduction and EMG recommended by Saber, section 5, without accuracy figures.
- **Read, not used:** Jeon 2013 (PMID 22805342, Abstract). Hip abductor weakness in 85.7% of L5 radiculopathy vs 3.6% of peroneal neuropathy (61 foot-drop patients, sens 85.7 / spec 96.4 for radiculopathy). It's a clinician strength test, and there's no self-test for hip abduction yet; it's a candidate for a `root_low` vs `peroneal` question if one is designed. Gillenwater 2011 (scratch collapse / Tinel, clinician, paywalled). The rest of the peroneal hits are imaging or trauma.

**Unscored, uncited reasoning: `polyneuropathy`.** Regions: top of foot, sole, forefoot, shin, calf. Every accuracy study found screens people with diabetes against people with diabetes without neuropathy, and none compares patient-answerable items against radiculopathy or stenosis (targeted Europe PMC search, 39 hits). The one item table (Abuzinadah 2021 MNSI) has "legs and/or feet numb" at sensitivity 27.5%, too low for a cited `usual`. So all items are reasoning, uncited:
- `usual`: new `h_poly_toes_up` (started in the toes or soles of both feet and spread upward).
- `supports`: `h_bilateral_sole_numbness`, `h_leg_burning`, `h_diabetes` (an existing meralgia follow-up question, now also a polyneuropathy check).
- `unexplained`: `h_cough_sneeze`, `st_slr_helper`.

**Stress view.** `pad` → ischaemia (cited, Nadeau Introduction; the condition text says it is the muscles, not a nerve, that run short of blood). `peroneal` → compression (cited, Saber 3b). New type `metabolic` ("Damage from within", uncited): clues `h_poly_toes_up` (usual), `h_bilateral_sole_numbness`, `h_diabetes` (supports); condition `polyneuropathy`. Every option must link to a stress type (vignette test).

**Confirmatory for `pad`:** oscillometric ABI 0.65 (0.57–0.74) / 0.96 (0.93–0.99) against Doppler ABI (Herráiz-Adillo 2017, PMID 28851093, Abstract; recommendation: Doppler ABI is the non-invasive gold standard). Absent foot pulse (nurse) 0.868 (0.748–0.989) / 0.827 (0.780–0.873) (Herráiz-Adillo 2018, PMID 30222240, Abstract; mainly symptom-free primary-care patients).

**Read, not used (PAD):** the Edinburgh Claudication Questionnaire has poor sensitivity in symptomatic and screening samples: Ibeggazene 2023 (PMID 35143731) 47%/63% in claudicants; Boylan 2021 (PMID 33401955) 52.5/87.1 in general practice; MacLean 2024 (PMID 39525342) 6.7/97.6 in a community screen. None asks about relief by posture, so they add nothing beyond Nadeau. Most PAD hits are ABI/Doppler variants or populations with diabetic foot ulcers.

**Effect.** Scorable options 22 → 23. Dev case reports unchanged (top-3 19/23, interview 18/23, logical fit 32/46). Holdout aggregate: interview top-3 7/11, unchanged. There are no PAD, peroneal or polyneuropathy cases yet. Vignettes: calf pain easing on standing still ranks `pad` first; classic neurogenic claudication keeps stenosis above `pad`.

**Worth getting:** Nadeau 2013 appendix (exact questionnaire wording, to settle items 3 and 3a); Jeon 2013 full text; any study of patient-reported items for polyneuropathy vs lumbar root or stenosis.

**DOI audit.** `npm run audit-sources`: all 138 DOIs match their PMIDs.

## Tissue options without accuracy data: second mining pass (user request, 2026-11-04)
New miner terms for the listed-only tissue options that had none: `hip_fai`, `adductor_groin`, `ac_joint`, `facet_lbp`, `neck_joint`, `shoulder_oa`, `frozen_shoulder`, `biceps` (84, 4, 23, 10, 36, 7, 50 and 107 candidates). The leg-mimics `wanted.md` was copied to `wanted-leg-mimics.md`; `wanted.md` is now this pass's list.

**Scored: `ac_joint`.** Cadogan 2013 (PMID 23634871, PMC3646690), Table 5. 153 consecutive primary-care patients with a new episode of shoulder pain; reference = at least 80% relief from a fluoroscopic AC joint block (22 positive). The comparison group is other primary-care shoulder pain, which matches what the engine computes against `rotator_cuff` and `frozen_shoulder`.
| Finding | Counts (TP/FN/FP/TN) | Sens / spec |
|---|---|---|
| new `h_shoulder_repetitive_onset` (began during or within 48 h of repetitive activity, no other cause; Methods definition) | 6/16/13/118 | 0.27 (0.13–0.48) / 0.90 (0.84–0.94) |
| new `h_shoulder_above_elbow` ("no pain referred below elbow") | 20/0/105/23 | 1.00 (0.84–1.00) / 0.18 (0.12–0.26) |
| new `st_ac_swelling_self` (mirror check; the study's item is the examiner's visual inspection, so `performedBy: "clinician"`, `adapted: true`) | 15/5/47/77 | 0.75 (0.53–0.89) / 0.62 (0.53–0.70) |

- Caveat: the five Table 5 variables were picked for their association with the block response in the same data (P ≤ 0.05), so their accuracy is likely optimistic.
- A "no" to `h_shoulder_above_elbow` gives sens 0, clamped to 0.005, a strong rule-out. Its CI lower bound is 0.84, so a single patient with AC pain below the elbow would change it. This is the data, but the item rests on 20 cases.
- **Not entered:**
  - the two passive-movement items (helper-performed passive abduction and 90/90 external rotation without pain: 0.36/0.86, 0.50/0.82);
  - localised AC tenderness (0.36/0.73, LR+ 1.37; `h_ac_point` stays the uncited `usual` check, since pointing is not pressing);
  - the traditional tests (cross-body adduction 0.64/0.26, O'Brien 0.14/0.92, Hawkins 0.70/0.36; none associated with the block, Table 4).
- The higher figures in Table 1 (O'Brien 1998, Chronopoulos 2004) come from surgical waiting lists and are context only.

**Scored: `frozen_shoulder`.** Carbone 2010 (PMID 19418052, PMC2899298), Methods, Results and Table 1. New `st_coracoid_self`: firm pressure in the hollow below the outer collarbone (coracoid) is clearly more painful than on the AC joint or the outer (subacromial) shoulder. The study's threshold was VAS ≥ 3 more at the coracoid than at the other two spots; it was examiner-performed, so `adapted: true`.
- Positive in 82/85 with adhesive capsulitis: sens 0.96 (0.90–0.99), Table 1.
- Positive in 67/595 with the four other conditions (rotator cuff tear 52/465, calcifying tendinitis 7/48, glenohumeral arthritis 1/16, AC arthritis 7/66; Results): spec 528/595 = 0.887, Wilson CI 0.859–0.910. Table 1 gives 0.87–0.89 per condition.
- The healthy-control figures (Table 2: 0.99/0.98) are not used.
- Caveats: known-diagnosis groups; one examiner who knew the diagnosis; the capsulitis diagnosis used stiffness and MRI, not the test; very obese patients excluded (the coracoid is hard to reach).
- Diagrams added for both new self-tests.

**Read, not used:**
- **Hip impingement.** Caliesch 2020 (PMID 32411383, PMC7213881), Table 1: every test against cam/pincer *morphology* has specificity 0.11–0.56 and LR+ 0.75–1.39. That includes Nogier's patient-reported "pain predominantly in flexion/internal rotation", 0.70/0.44. Pålsson 2020 (PMID 32335699): FADIR 0.80/0.25. Dhillon 2025 review (PMID 40692936): highly variable, mostly imaging references. Morphology is common without symptoms, so these don't map onto symptomatic FAI. `hip_fai` stays logical fit only.
- **Biceps.** Rosas 2017 (PMID 28479256) and the SLAP literature: clinician test clusters in surgical populations. Bélanger 2019 review (PMID 31243466) is paywalled.
- **Facet / neck joint.** Nothing open access with patient-answerable items. Maas 2017 (PMID 27723170, facet history and exam review), Mizer 2017 (PMID 28644963, self-report for painful neck conditions) and Schneider 2014 (PMID 24662813, cervical facet decision guide) are paywalled and worth getting. Hancock 2007 is already in the log (no informative test).
- **Adductor groin.** Drew 2014 review (PMID 24529632) only: no new data beyond Weir 2015.
- **Shoulder OA.** No accuracy study of a bedside item.

**Effect.** Scorable options 23 → 25. Dev case reports unchanged (top-3 19/23, interview 18/23, logical fit 32/46). Holdout aggregate: scored 11 → 12, interview top-3 8/12 (was 7/11). New vignettes: a coracoid-positive patient ranks frozen shoulder first; repetitive onset + above-elbow + swollen joint ranks the AC joint first; pain below the elbow puts the AC joint under 2%.

**Worth getting:** Maas 2017, Mizer 2017, Schneider 2014, Wright 2021 (PMID 33930328, patient history for hip-related pain), Bélanger 2019, Walton 2004 full text.

**DOI audit.** `npm run audit-sources`: all 140 DOIs match their PMIDs.

## Knee (user request, 2026-11-04)
User decision: add the knee with the full proposed scope, worked autonomously overnight. Sources were found with `npm run mine-literature -- knee_oa pfp meniscus knee_ligament patellar_tendinopathy knee_lateral knee_medial knee_posterior multi_knee` (new terms). The previous `wanted.md` was copied to `wanted-tissue-pass2.md`; `wanted.md` is now the knee list. Nothing was entered from memory.

**Regions.** New `knee_front` ("Front of knee / kneecap"), `knee_medial`, `knee_lateral` and `knee_back`, drawn in a band between thigh and shin on the front and back outlines (the shin and calf shapes now start lower), and a "Knee" chip group. `shin_anterior` was "Front of shin / knee" and is now "Front of shin". Because its old meaning included the knee:
- Territories: `root_mid` and `femoral` + front/inner knee; `root_low` + outer/back knee; `stenosis` + all four; `peroneal` + outer knee (fibular head).
- Question gates: every whole-leg gate (a thigh region plus shin or calf) + all four knee regions. Root-specific checks get their sides of the knee: L2–L4 checks (`st_sit_to_stand`, `st_prone_knee_bend`, `st_sens_medial_knee`) front/inner; L5/S1 checks (`st_heel_raise`, `st_heel_walk`, `st_sens_great_toe`, `st_sens_lateral_foot`) outer/back. `h_peroneal_setting` + outer knee. Not changed: the buttock-only piriformis tests, centralisation, `h_poly_toes_up`.
- **Not added:** knee pain referred from hip OA, and the obturator nerve's classic referral to the inner knee. `hip_oa` is scorable but all its questions are gated to the hip, so it would sit in every knee interview at its prior without being asked about. Revisit with a knee-gated hip question (e.g. hip rotation pain).
- Dev cases checked: the two dev cases with `shin_anterior` describe the shin (anteromedial leg; L5 dermatome), so no recoding. Holdout cases were not inspected.

**Scored:**
| Hypothesis | Finding | Values | Source |
|---|---|---|---|
| `acl` | new `h_knee_pivot_injury` | 0.79 (0.64–0.90) / 0.84 (0.79–0.89) | Décary 2018 (PMID 29894492, PMC5997333), Table 5, partial or complete tears |
| `acl` | new `h_knee_pop` | 0.58 (0.42–0.73) / 0.92 (0.88–0.95) | same |
| `pfp` | new `st_knee_deep_squat` (adapted) | 0.91 / 0.50 (no CIs) | Cook 2010 (PMID 21197175, PMC2841549), Table 2 |
| `pfp` | new `h_knee_kneel_pain` | 0.84 / 0.50 | same |
| `pfp` | new `h_knee_sitting_pain` | 0.72 / 0.57 | same |
| `pfp` | new `h_knee_stairs_pain` | 0.75 / 0.43 | same |
| `meniscus` | `st_knee_deep_squat` (adapted) | 0.745 (0.611–0.845) / 0.424 (0.312–0.544) | Snoeker 2015 JOSPT (PMID 26161628), Abstract, examiner 1 |
| `meniscus` | new `h_knee_weightbearing_injury` | 24/51 vs 16/66: 0.471 / 0.758, Wilson CIs | Snoeker 2015 BJGP (PMID 26212848, PMC4513740), Table 1 |

- **Décary** is the Montreal cohort: 279 consecutive new knee complaints from orthopaedic and family clinics, 43 ACL tears, composite reference with MRI, and index items collected independently by a physiotherapist. Its comparison group is the other knee disorders, which matches the engine. The items were chosen by LASSO from 131 candidates (optimistic). The pivot and the pop share the dependence group `knee_injury`: Table 6 shows the pop occurs almost only with a pivot (cluster 0.58/0.94), so multiplying both would double count.
- **Cook**: 76 consecutive anterior knee pain patients, 52 patellofemoral pain (a diagnosis of exclusion) vs 24 other diagnoses on imaging. Whole percentages, no CIs. Squat and kneeling share `knee_flexion_load` (both deep-flexion loading). Sitting and stairs stay separate (moderate double counting accepted, LR+ 1.3–1.7 each). The squat entry is `adapted` (the physician did the squat or asked about it).
- **Snoeker**: the BJGP Table 1 rows "effusion" and "origin of complaints" don't add up across groups and are not used. "Locking" was less common with a tear (8/51 vs 22/66); the authors call it not interpretable, and McHugh 2022 (PMID 34600120) finds mechanical symptoms only weakly linked to tears, so locking is context only.
- **Known distortion:** the pivot injury is scored for `acl` only. Traumatic meniscal tears also pivot (Décary's meniscal cluster), but no source read gives the pivot rate in meniscal tears, so `meniscus` gets the 16% non-target rate. A twisting injury therefore favours ACL over meniscus more than it should. `meniscus` has a cited `supports` check on the pivot (Décary meniscus abstract). Fix: Décary 2018 meniscus full text (PMID 29111463).

**Logical fit only:**
- `knee_oa`: NICE criteria checklist (age ≥ 45, activity-related pain, morning stiffness ≤ 30 min). Wording from King 2025 (PMID 39542837, PMC12038217, Methods), linked to new `h_age_45` (implied by `h_age_over_65` yes), `h_knee_activity_pain`, `h_knee_morning_stiff_short`.
  - King's 0.84/0.85 is not used for a probability: its comparison group includes people without knee pain, and everyone using the tool has knee pain.
  - Context: Duong 2023 JAMA review (PMID 37874571, Abstract: 95/69 for the same criteria); Peat 2006 (PMID 16627539, PMC1798313: the ACR clinical criteria picked up 41% with specificity 71% in general-practice patients over 50).
  - No single-item accuracy study in a knee-pain population was found open access. Décary 2018 OA clusters (PMID 29781110) are paywalled.
- `patellar_tendinopathy`: `h_knee_below_kneecap` usual, cited to Maffulli 2017 (PMID 29264343, Abstract: tendon tenderness 98%). The controls had Achilles tendinopathy, so there is no probability.
- `bakers_cyst`: `h_knee_back_swelling` usual, cited to Tang 2026 (PMID 41939773, PMC13044020, Introduction).
- `itbs`, `pes_anserine`: one uncited `usual` check each (`h_knee_outer_running`, `h_knee_inner_below_joint`).
- `saphenous` (nerve; inner/front knee and shin): uncited `usual` numbness, `supports` recent surgery, cough note.
- Every knee tissue option has the numbness note.
- Stress: knee tissue options → tissue; `saphenous` → injury, compression (uncited).

**Confirmatory:** Lachman 0.81 (0.67–0.92) / 0.98 (0.95–0.99) (Décary Table 5); joint line tenderness 83/83 and McMurray 61/84 (Duong 2023 abstract, review summary); examination for a popliteal swelling 0.74 (0.49–0.89) / 0.88 (0.65–0.97) (Tang 2026, pooled, mixed populations).

**Read, not used:** Décary 2018 patellofemoral pain and OA clusters (abstracts: clusters only); King 2025 (see above); Chamorro-Moriana 2024 (PMC11023591: patellofemoral pain only, no comparison group); Leibbrandt 2017 checklist (PMC6093140; its Table 1 is Cook 2010, used directly); Harrison 2009 Thessaly (retrospective surgical series, LR+ 39) against Snoeker's primary-care Thessaly LR ≈ 1; the duck walk test (Van der Post 2017: verification bias, the authors say sensitivity is inflated); Owoeye 2018 OSTRC-P (youth basketball screening, mostly uninjured comparison group); Wagemakers 2008 meniscal history in general practice and Lukas 2022 ACL interview score (paywalled; worth getting); the lever sign and Lachman meta-analyses (clinician tests, acute settings).

**Effect.** Scorable options 25 → 28; 6 knee options listed with logical fit. Dev case reports unchanged (top-3 19/23, interview 18/23, logical fit 32/46); there are no knee cases yet. Holdout aggregate unchanged (interview top-3 8/12).
- Simulated interviews: kneecap pain (squat/kneel/sit yes) → `pfp` 65% in 12 questions; pivot + pop + fast swelling → `acl` 76%; knee OA pattern → "other" 40%, with `knee_oa` on the checklist.
- Knee patients are also asked the stenosis and root questions (walking, sitting, bending), because stenosis and the roots are in the knee territories.

**Worth getting:** Décary 2018 meniscus, patellofemoral pain and OA full texts (single-item tables would score knee OA and fix the pivot distortion); Wagemakers 2008 (PMID 18185035); Lukas 2022 (PMID 35219887); Nunes 2013 (PMID 23232069).

**DOI audit.** `npm run audit-sources`: all 151 DOIs match their PMIDs.

## Ankle, heel and lower leg (user request, 2026-11-04)
User decision: continue to the next coverage gap after the knee. Sources were found with `npm run mine-literature -- plantar_heel achilles ankle_sprain ankle_fracture ankle_medial ankle_lateral shin compartment calf ankle_oa multi_ankle` (new terms) and targeted Europe PMC searches. The previous `wanted.md` was copied to `wanted-knee.md`. Nothing was entered from memory.

**Regions.** New `ankle_lateral` ("Outer ankle"), `ankle_medial` ("Inner ankle"), `achilles` ("Back of ankle / Achilles tendon") and `heel` ("Underside of heel"). The shin and calf shapes now end higher, with an ankle band on the front view and Achilles and heel shapes on the back view. The chips are split into "Lower leg and ankle" and "Foot". `foot_sole_lateral` was "Sole (arch or heel) or outer edge of foot" and is now "Arch or outer edge of foot". Because its old meaning included the heel:
- Territories: `root_low` + outer ankle, Achilles, heel; `root_mid` + inner ankle (L4); `stenosis` and `polyneuropathy` + all four; `tarsal_tunnel` + inner ankle, heel; `peroneal` + outer ankle; `saphenous` + inner ankle.
- Question gates: every whole-leg gate (a thigh region plus shin, calf or sole) + all four new regions; gates that had the sole + heel. Root checks get their side: L2–L4 checks inner ankle; L5/S1 checks (`st_heel_raise`, `st_heel_walk`, `st_sens_great_toe`, `st_sens_lateral_foot`) outer ankle, Achilles, heel. `h_peroneal_setting` + outer ankle; `h_poly_toes_up` + all four; `h_ff_load_increase` + shin (it is now a check for the shin options). Not changed: the buttock-only piriformis tests and centralisation.
- Dev cases checked: the one dev case with `foot_sole_lateral` describes the outer sole, so no recoding. Holdout cases were not inspected.

**Injury gate.** New information-only `h_ankle_injury` (asked for every lower-leg, ankle and foot region except the forefoot). The fracture questions are asked only after a "yes" (`askIf`). With a "no", `h_ankle_cant_weight` is implied "no" (`impliedBy`: no injury, so the patient wasn't left unable to walk by one).

**Scored:**
| Hypothesis | Finding | Values | Source |
|---|---|---|---|
| `ankle_fracture` | new `h_ankle_cant_weight` | 10/19 vs 7/93: 0.526 / 0.925, Wilson CIs | Makiev 2025 (PMID 40303651, PMC12036505), Results and Table 2 |
| `ankle_fracture` | `h_ankle_cant_weight` | 0.694 / 0.616 (Wilson CIs at n = 36, 238) | Pires 2014 (PMID 24971221, PMC4071746), Abstract and Results |
| `ankle_fracture` | new `st_shetty_helper` (adapted, helper) | 13/19 vs 22/93: 0.684 / 0.763 | Makiev 2025, Table 2 |
| `ankle_fracture` | `st_shetty_helper` | 45/58 vs 67/171: 0.776 / 0.608 | Doğan 2025 (PMID 40933976, PMC12419047), Table 2 |
| `achilles_rupture` | new `st_calf_squeeze_helper` (adapted, helper) | 0.96 (0.93–0.99) / 0.93 (0.75–0.99) | Maffulli 1998 (PMID 9548122) via Reiman 2014 (PMID 25243736), Table 4 |
| `plantar_fasciitis` | new `st_windlass_helper` (adapted, helper) | 7/22 vs 0/23: 0.318 / 1.00 (Wilson 0.857–1.00) | De Garceau 2003 (PMID 12793489), Abstract |
| `tibial_stress_fracture` | new `st_shin_focal_self` (adapted) | 17/35 vs 19/32 legs: 0.486 / 0.406 | Rosenthal 2022 (PMID 36147792, PMC9486277), Table 1 |
| `tibial_stress_fracture` | new `st_heel_percussion_helper` (adapted, helper) | 6/35 vs 3/32 legs: 0.171 / 0.906 | Rosenthal 2022, Table 1 |

- **Fracture.** Both studies are consecutive emergency patients with a foot or ankle injury, compared with the injured patients without a fracture (mostly sprains), which matches the engine. Makiev's counts are reconstructed from 112 patients and 17% fractures; every percentage fits. Pires's weight-bearing specificity, PPV and accuracy don't fit one whole-number table, so the reported values are used. The two studies disagree on the weight-bearing specificity (0.925 vs 0.616; the validator warns on non-overlapping CIs); `pooled()` combines them. Doğan's positive Shetty test was "unable to press because of pain", Makiev's "pain clearly increases"; the prompt covers both. Weight-bearing and the Shetty test share `fracture_load`.
- **Ottawa ankle rules** are a criteria checklist on `ankle_fracture` (wording from Makiev, Methods), linked to `h_ankle_cant_weight` and a new information-only `st_ottawa_bone_self` (the four bone spots in one self-check). The rule as a whole is too unspecific to score (pooled 0.91 / 0.25, Gomes 2022, PMID 36151550, Abstract; in Makiev 0.947 / 0.15).
- **Achilles rupture.** Maffulli's comparison group was 28 people with a suspected tear and an intact tendon on imaging. The calf squeeze is not gated on the injury question: missed ruptures without a remembered injury occur, and a normal squeeze rules a rupture out (LR− ≈ 0.04). Matles test (0.88/0.85) and gap palpation (0.73/0.89) from the same study were not added (same dependence, weaker).
- **Plantar fasciitis.** De Garceau's specificity uses only the 23 patients with other foot pain (none positive), not the 30 healthy controls. Zero false positives clamps the likelihood to 0.005, so a positive test is a strong rule-in resting on 23 people; the Wilson lower bound is 0.857.
- **Tibial stress fracture.** Rosenthal's comparison group is the other painful legs needing imaging in the same trainees (bone scan reference), counted per leg (17 patients contributed both legs, so CIs are too narrow). A short tender spot (≤ 2.5 cm) was more common *without* a stress fracture (LR+ 0.82). This replaces an uncited "usual" check I had drafted for a single tender spot, which the data contradict. `h_shin_long_stretch` "yes" implies `st_shin_focal_self` "no" (tender over 5 cm or more is negative by the study's definition). The fulcrum test (0.457 / 0.844, the best) needs about 11 kg of bending force on the bone and was not adapted for self-testing.

**Logical fit only:**
- `achilles_tendinopathy`: `h_achilles_morning` usual and `h_achilles_spot` supports, cited to Hutchison 2013 (PMID 23548453; Reiman 2014 Tables 2 and 4: morning stiffness 0.89/0.58, pain 2–6 cm above the insertion 0.78/0.77). No probability: 5 of Hutchison's 11 comparison participants had no ankle pain (same reasoning as King 2025 for knee OA). Maffulli 2003 (palpation, arc sign, Royal London test) used Achilles-surgery waiting-list patients vs controls.
- `ankle_sprain`: injury and rolled-inward checks (uncited); context from Pires and Makiev (82–84% inversion injuries).
- `cecs`: `h_leg_exercise_tight` usual, cited to Tarabishi 2023 (PMID 38022185, Abstract); `h_bilateral` supports, cited to de Bruijn 2018 (PMID 29126337, Abstract: bilateral symptoms an independent predictor in 1411 referred patients; no accuracy figures). Stress type: ischaemia.
- `mtss`: uncited `h_shin_long_stretch` usual and `h_ff_load_increase` supports; context from Winters 2018 (PMID 28179260: reliable clinical diagnosis, 74% of athletes with non-traumatic leg pain).
- `tibial_stress_fracture` also keeps `h_ff_load_increase` usual (uncited).
- `ptt` (`h_arch_flattening`), `peroneal_tendon` (`h_ankle_behind_outer`), `calf_strain` (injury, `h_calf_muscle_spot`), `sural` (numbness usual, cough note; stress compression and injury), `plantar_fasciitis` (`h_heel_first_steps` usual): uncited.
- Every tissue option has the numbness note, except `cecs` (compartment pressure can cause pins and needles).

**Confirmatory:** Ottawa rules then X-ray (Gomes 2022, pooled); clinician calf squeeze (Maffulli 1998 via Reiman; recommendation Garras 2012, PMID 22538958: all 66 operated ruptures had all three clinical signs); Achilles palpation then ultrasound (Reiman 2014 pooled palpation 0.64/0.81); anterior drawer for the outer ankle ligament (Netterström-Wedin 2022, PMID 34286639, pooled 0.54/0.87).

**Read, not used:** Bachmann 2003 Ottawa review (PMID 12595378: pooled sensitivity and LR− only); Rodríguez-Sanz 2023 Kager's fat pad test (PMC10455944: healthy controls); van Zantvoort 2018 (lateral compartment syndrome only, case series); DeOrio 2011 tibialis posterior oedema sign (clinician sign, abstract only); Vignaud 2021 compartment syndrome models (scores, not single items); Matthews 2026 Achilles pilot (structural change, not diagnosis); imaging studies throughout. No accuracy study of history items was found for plantar heel pain, shin splints, compartment syndrome, calf strain, the tibialis posterior or peroneal tendons. The JOSPT heel pain guidelines (PMIDs 25361863, 40734587) are paywalled.

**Effect.** Scorable options 28 → 32 (`ankle_fracture`, `achilles_rupture`, `plantar_fasciitis`, `tibial_stress_fracture`); 8 more listed with logical fit only.
- Dev case reports: probabilities unchanged (top-3 19/23, interview 18/23). Logical-fit top-3 fell 32 → 31/46: in one dev stenosis case (low back, back of thigh, calf), the new calf options `cecs` (bilateral, cited) and `sural` (numbness) tie with stenosis on net fit, and stenosis has one "against" (age), so the tie-break puts them ahead. No principled change restores it; the baseline was not lowered (decision for the user). Holdout aggregate unchanged (interview top-3 8/12, logical fit 15/21).
- Simulated interviews: heel pain with a positive windlass → `plantar_fasciitis` 98% in 11 questions; push-off injury with a positive calf squeeze → `achilles_rupture` 86%; rolled ankle, unable to walk, Shetty and bone tenderness positive → `ankle_fracture` first (53%); Achilles tendinopathy pattern → "other" 91%, rupture 4%.
- **Known distortion (equal priors):** an injury-only option keeps a large share when its questions say little. A sprain with every fracture check negative still shows the fracture at about 25%; outer-ankle pain without an injury about 32% (the implied "no" halves it). Shin splints pattern → `tibial_stress_fracture` 51% because `mtss` has no probability. A deterministic "injury-only option" filter (like the territory gate) would fix the first; it needs a user decision.

**Worth getting:** the JOSPT heel pain guideline (2014/2023), Maffulli 1998 full text (Matles and gap figures in context), DeOrio 2011, Hutchison 2013 full text (per-participant data might allow a comparison against the 6 ankle-pain controls only).

**DOI audit.** `npm run audit-sources`: all 165 DOIs match their PMIDs.

## Head, face and jaw; abdominal wall (user request, 2026-11-04)
User request: "continue adding more body parts and conditions" after the ankle batch. Sources were found with `npm run mine-literature -- tmd trigeminal occipital multi_head acnes abdominal_wall` (new terms) and targeted Europe PMC searches. The previous `wanted.md` was copied to `wanted-ankle.md`. Nothing was entered from memory.

**Regions.** New `head_back` ("Back of head / base of skull"), `temple`, `face` ("Face (forehead, around the eye, cheek)"), `jaw` ("Jaw, chewing muscle or in front of the ear") on two new head figures, and `abdomen` ("Belly (front or side of the abdomen)") below the chest. No existing region changed meaning, so no existing gate changed except the trunk questions below. `root_thoracic`, `intercostal`, `zoster` and `slipping_rib` + `abdomen` (the lower thoracic nerves and ribs reach the belly wall); `h_trunk_band`, `h_band_rash`, `h_trunk_numbness` (wording now includes "belly") and `h_rib_click` + `abdomen`.

**Safety notices.** `HeadNotice` and `AbdomenNotice`, modelled on the chest notice: nothing is asked and nothing stops. They state what isn't covered (migraine, tension-type headache, teeth, sinuses, eyes; the organs inside the belly) and when to get urgent care (including jaw pain on chewing over 50, for giant cell arteritis, which can look like TMD). No numbers, so no citation.

**Questionnaires.** The interview now shows `instructions` for any question that has them, not only self-tests, so a validated questionnaire can be asked as one scored question with its items and points listed.

**Scored:**
| Hypothesis | Finding | Values | Source |
|---|---|---|---|
| `tmd` | new `h_tmd_screener` (6-item TMD pain screener, 3 or more points) | 210/212 vs 22/125: 0.991 / 0.824 | Gonzalez 2011 (PMID 21965492, PMC4527600), Table 4, Results, Figure 2 |
| `cervicogenic_headache` | new `h_ha_neck_pain` | 88/112 vs 42/112: 0.786 / 0.625 | Nowaczewska 2026 (PMID 42168854, PMC13292324), Table 1 |
| `cervicogenic_headache` | new `st_gon_tender_self` (adapted, `scoreOn: positive`) | 88/103 vs 29/96: 0.854 / 0.698 | same |
| `acnes` | new `h_acnes_questionnaire` (18 items, 10 or more points) | 40/47 vs 5/64: 0.851 / 0.922 | van Assen 2012 (PMID 23914291, PMC3730810), Tables 2-3 |

- **TMD screener.** Items and scoring copied from Figure 2. The comparison group combines the 45 people with tension-type headache in the temple (1 above threshold, long version) and the 80 with toothache (26%, taken as 21/80), the realistic look-alikes for jaw and temple pain; the 96 healthy controls and 116 painless TMJ disorders are not used. The toothache group's TMD status was not checked, so its false-positive rate is an upper bound (the comparison is conservative).
- **Cervicogenic headache.** Two diagnosed groups (112 vs 112 migraine, matched), a two-gate design, so the specificities are probably optimistic. Tenderness of the greater occipital nerve was part of the diagnostic evidence in 76 of 112 cases (incorporation bias), so only a positive answer counts. No throbbing pain in any of the 112 (79% with migraine) is context only: patients with coexisting migraine were excluded, so a "yes" would wrongly near-exclude the diagnosis. The three ICHD-3 checklist questions are `followUp`s at 25% (a scored option's checklist is not asked otherwise).
- **ACNES.** The prospective (newly diagnosed) group is used, not the retrospective operated "gold standard" group (0.94), which had recall bias. Comparison: gastroenterology outpatients with IBS, the usual misdiagnosis. Items translated from Dutch by the authors (Table 2); the cut-off is reported as "10 points" (Table 3) and "at least the 10-point cutoff" (van Assen 2013, PMID 24204070, Abstract).

**Logical fit only (ICHD-3 checklists, PMID 29368949, read at ichd-3.org):**
- `trigeminal` (13.1): one side, attacks of a fraction of a second to 2 minutes, severe, electric/shooting/stabbing, set off by harmless touch or movement.
- `occipital_neuralgia` (13.4): brief attacks, severe, shooting/stabbing (at least two of three), scalp allodynia, tenderness over the nerve (linked to `st_gon_tender_self`). Clinician-only: relief by nerve block.
- `cervicogenic_headache` (11.2.1) as above, plus its scored items.
- `abdominal_hernia`: uncited `h_abd_bulge` usual.
- Stress: `tmd`, `cervicogenic_headache`, `abdominal_hernia` → tissue; `trigeminal`, `occipital_neuralgia`, `acnes` → compression (uncited reasons).

**Confirmatory (no accuracy figures):** DC/TMD examination (Schiffman 2014, PMID 24482784: the abstract reports only bounds, sensitivity ≥ 0.86, specificity ≥ 0.98, so no figure is entered); occipital nerve block (ICHD-3 13.4 D); diagnostic block of a neck structure (ICHD-3 11.2.1 C4).

**Read, not used:** Darracq 2020 (Carnett's sign in emergency abdominal pain: neither sensitive nor specific, PMID 32507573); Takada 2011 (Carnett's test for psychogenic pain); van der Meer 2019 review (flexion-rotation test 0.83/0.82, clinician test, very low evidence; PMID 30997838); Anarte-Lazo 2024 (flexion-rotation test in whiplash); Ertl 2025 (TMD clinical screening tests); headache red-flag tools (SNNOOP10) and giant cell arteritis models (not modelled).

**Effect.** Scorable options 32 → 35 (`tmd`, `cervicogenic_headache`, `acnes`); `trigeminal`, `occipital_neuralgia`, `abdominal_hernia` listed with logical fit. Dev and holdout case results unchanged (no head or abdomen cases). Simulated interviews: jaw pain with a positive screener → `tmd` 85% (2 questions); back-of-head headache with neck pain and a tender skull base → `cervicogenic_headache` 85%; typical trigeminal neuralgia → `trigeminal` 5/0 on the checklist (probability in "other"); belly questionnaire positive → `acnes` 92%.

**Worth getting:** Takada 2011 and Thomson 1991 (Carnett's sign in chronic abdominal pain); a validated self-report screen for trigeminal neuralgia; Hall 2008/2010 flexion-rotation test studies (could become a helper test).

**DOI audit.** `npm run audit-sources`: all 170 DOIs match their PMIDs.

**Follow-up (user decisions, 2026-11-04).** The user declined both lowering the dev logical-fit floor (32) and a deterministic injury-only filter. Added a `usual` check on `sural` for `st_sens_lateral_foot` (its own skin area, consistent with its `usual` numbness check), because a sural problem that causes numbness should reduce feeling on the outer foot. The dev stenosis case moved from 5th to 4th in logical fit (`cecs` still ties ahead on net fit with no "against"); dev logical-fit top-3 stays 31/46, so `tests/cases` keeps failing against the floor of 32. No further change was made only to restore that case.

## Coverage pass: every remaining musculoskeletal gap (user request, 2026-11-04)
User request: add every musculoskeletal condition listed as "not in the app" earlier the same day, working autonomously. 34 options were added (`category: "mimic"`), all **logical fit only**: none has an accuracy study usable for a probability, so scorable options stay at 35 and no probability changed. Sources were found with `npm run mine-literature -- coccyx spondylolysis axial_spa whiplash pelvic_girdle hip_bone iliopsoas thigh_strain shoulder_other elbow_wrist_other hand_other knee_other foot_other gout inflammatory_arthritis pmr fibromyalgia` (new terms) and targeted Europe PMC searches. The previous `wanted.md` was copied to `wanted-head-abdomen.md`. Nothing was entered from memory.

**Options added (regions in brackets):**
- Spine and pelvis: `coccydynia` (buttock, low back), `spondylolysis` (low back, buttock, back of thigh), `axial_spa` (low/mid/upper back, buttock, neck), `whiplash` (neck, shoulder blade, back of head, upper back, shoulder), `pelvic_girdle` (pregnancy; buttock, low back, groin, back of thigh), `osteitis_pubis` (groin, inner thigh, belly).
- Hip and thigh: `hip_stress_fracture` (femoral neck, sacrum or pubic bone; groin, front of thigh, buttock, low back), `hip_avn` (groin, front of thigh, buttock, front of knee), `iliopsoas` (incl. snapping hip; groin, front of thigh), `thigh_strain` (hamstring or quadriceps).
- Shoulder: `shoulder_instability`, `slap_tear`, `calcific_tendinitis`.
- Elbow, wrist and hand: `olecranon_bursitis` (both elbow halves; the back view's elbow shapes sit over the point of the elbow, so no new region), `scaphoid_fracture`, `wrist_ganglion`, `hand_oa`, `mallet_finger`, `dupuytren`.
- Knee: `knee_collateral` (MCL/LCL), `pcl`, `patellar_dislocation`, `osgood`, `knee_ocd`.
- Ankle and foot: `ankle_oa`, `high_ankle_sprain`, `hallux_valgus`, `sesamoiditis`, `insertional_achilles` (insertional tendinopathy, retrocalcaneal bursitis, Haglund's), `sever`.
- Whole body: `gout`, `inflammatory_arthritis`, `pmr`, `fibromyalgia`.

**Question structure (interview length).** A first draft gave every option two or three standalone checks; the dev interview mean rose from 31.4 to 47.9 questions, because `nextAfterScored` asks every check of an unscored option still in play, and the case simulation answers "unsure" to anything a report doesn't state (so nothing is ruled out). Rebuilt so each option has one screening question and its other checks are `askIf` that screen's "yes":
- one shared whole-body screen, `h_many_places_both_sides`, for `fibromyalgia`, `pmr` and `inflammatory_arthritis` (a "no" rules out all three);
- `h_knee_injury` before the knee injury mechanisms; `h_ankle_injury` (existing) before `h_ankle_twist_out`; `h_age_growing` before the growth-plate checks; `h_hip_weight_pain` before the stress-fracture and AVN risk questions.
- Checks that would have widened an existing question into unrelated regions were dropped (`h_big_toe_tender` for gout, `h_ff_load_increase` for the hip, `p_light_touch` for fibromyalgia, `h_morning_stiff_long` for PMR and axial SpA).
- New age questions `h_age_50` and `h_age_growing` are tied to `h_age_45` and `h_age_over_65` by `impliedBy` (the validator's "both yes and no" warning is expected: the ranges can't overlap).
- Result: dev interview mean 39.7 (was 31.4), max 70 (was 59). Most of the increase is one screen per new option in play.

**Cited:**
| Option | What | Source |
|---|---|---|
| `axial_spa` | `h_back_gradual_onset` usual (insidious onset 76.2%, patient-reported) and `h_back_exercise_better` usual (improvement with exercise 83.0%); context: every item LR+ 0.9-1.4 among referred chronic back pain | Poddubnyy 2018 (PMID 30713715, PMC6336095), Abstract, Table 4 |
| `pmr` | Criteria checklist: age ≥ 50 and both shoulders aching (required), morning stiffness > 45 min (2), hip pain or limited movement (1), no other joint pain (1); clinician-only: raised CRP/ESR, RF and ACPA negative (2). New `h_both_shoulders_ache`, `h_morning_stiff_45` (implied "no" by `h_morning_stiff_long` "no"), `h_hip_pain_too`, `h_other_joints_pain`. Context: score ≥ 4 68/78 overall, specificity 88% vs shoulder conditions, 65% vs RA; "not meant for diagnostic purposes" | Dasgupta 2012 (PMID 22388996, PMC3298664), Abstract, Tables 4 and 6 |
| `fibromyalgia` | Reasons for `h_widespread_pain` and `h_fatigue_sleep` (content of the survey criteria) | Fitzcharles 2012 (PMID 22994975), Abstract (Background); reliability study only |
| `sever`, `osgood` | Context: case mix of children with heel (33/47) and front-of-knee (12/16) pain at podiatry and physiotherapy clinics | Brooks 2024 (PMID 39314841, PMC11418814), Results |
| `hallux_valgus` | Context: self-assessment against standard photographs found 85% of bunions, specificity 88% | Menz 2010 (PMID 20854678), Abstract |

Everything else is uncited reasoning (`usual`/`supports` with a `reason`), labelled so in the UI, plus the numbness note on every tissue option. Stress links: new type `joint_inflammation` ("Inflamed joints or tendons (inflammatory disease)", uncited clues: long morning stiffness, swelling or red hot attacks, pain at rest, eased by movement) for `axial_spa`, `gout`, `inflammatory_arthritis`, `pmr`; `fibromyalgia` → sensitisation; all others → tissue.

**Read, not used:**
- Poddubnyy 2018 items for a probability: LR ≈ 1 in referred patients; scoring `axial_spa` on them would mainly hand it an equal prior share. Rudwaleit 2006 (PMID 16447233; inflammatory vs mechanical back pain under 50, ≥ 2 of 4 items LR+ 3.7) is paywalled and would be the source to score it.
- Vandeputte 2025 (PMID 40388705, PMC12517839), iliopsoas tendinopathy: seated resisted hip flexion 94/89 and seated resisted external rotation 96/81 against anaesthetic-injection response in 44 patients with groin pain. Promising for a helper-performed self-test, but the "optimal cutoff" column needs the full text read to define a positive test, and a new self-test needs a diagram. Next candidate to score `iliopsoas`.
- Fagevik Olsén 2014 (PMID 24767628): agreement of home vs clinic pelvic girdle tests, no comparison group.
- Brooks 2024 accuracy: sensitivity and specificity only in Figure 3 (ROC curves); knee group has 4 controls.
- Haugen 2024 EULAR hand OA criteria (PMID 38821712): need examination and radiographs.
- Kobayashi 2022 (PMC8889301): ultrasound additions to the PMR criteria.
- PMR report: dominated by giant cell arteritis imaging. Fibromyalgia report: mostly noise (the term `FiRST` also matches the ordinary word "first"); FiRST (Perrot 2010, PMID 20488620) and the 2016 criteria (Wolfe, PMID 27916278) are paywalled.
- No accuracy study of patient-answerable items was found for coccydynia, spondylolysis, thigh strain, gout (Netherlands rule not open access), scaphoid fracture (clinician signs only) or the knee ligament and kneecap options (clinician tests or imaging).

**Tests.** The forefoot vignette's list of unscored options now includes `gout`, `hallux_valgus`, `inflammatory_arthritis` and `sesamoiditis`. New vignettes: tailbone pattern, the whole-body screen ruling out three options with one "no", the PMR checklist, a growing child fitting Osgood-Schlatter with knee OA implied against, injury details asked only after a knee injury, scaphoid pattern, and every new option having a check. Dev case results unchanged (top-3 19/23, interview 18/23, logical fit 31/46; the floor of 32 still fails as recorded above). Holdout aggregate unchanged (interview top-3 8/12, logical fit 15/21).

**Known gaps left:** `median_proximal`, `guyon`, `radial_tunnel`, `tos`, `suprascapular`, `axillary` and `facet_lbp` still have no check of any kind (older options). No confirmatory tests were added for the 34 new options.

**Worth getting:** Rudwaleit 2006, Perrot 2010 (FiRST), Janssens 2010 (Netherlands gout rule), Vandeputte 2025 full text (open), Walsworth 2008 (labral tear history and exam).

**DOI audit.** `npm run audit-sources`: all 175 DOIs match their PMIDs.


## Question order: eliminate the most possibilities (user request, 2026-11-06)

The user asked that every next question be the one that eliminates the most possibilities, as "is it a man?" halves the field in Guess Who. No evidence value changed; this is engineering in `selection.ts` only, and it never feeds a probability.

- **Before:** `alwaysAsk`/`askIf` questions first in file order, then `followUp`s, then the highest information gain over the probabilities only (history before self-tests), then logic and criteria checks for unscored options and pain descriptions in file order.
- **Now:** one score for every question, `expectedEliminated`: the expected drop in the entropy (bits) of the possibilities still in play. Scored options keep their probability; "other" is split between the unscored options and a residual "not covered" share; options the logical fit has ruled out are dropped; each share is weighted ×2 per criteria or reasoning check that fits and ÷2 per one against (studied findings already moved the probability). For a question without study data, the chance of "yes" comes from the options in play (0.8 where a check expects "yes", 0.2 where it expects "no", 0.5 otherwise). `askIf`/`followUp` became gates, a context-only `askIf` detail follows its trigger, and context-only `alwaysAsk` questions (recent surgery) come at the end. All are engineering constants.
- **First attempt rejected:** counting possibilities directly (effective number of scored options plus a head-count of unscored ones). It mixed units, could rise after an answer, and stopped too early (dev interview top-3 fell 18 → 17).
- **Results** (`eval-cases`; holdout aggregate only, run once on the final version): dev interview top-3 18 → 19 of 23 (now equal to all-facts top-3); dev mean interview length 39.7 → 27.1 questions (max 70 → 42); holdout interview top-3 8/12 before and after. Logical-fit top-3 from interview answers only (not a reported metric) 30 → 29 of 46. `cases/baseline.json` top3Interview raised to 19. The logicTop3 floor (32) was already failing at 31 before this change and is untouched.
- Tests that pinned the old order (always-ask first, history before self-tests, pain description last) now check the new rule instead.


## Body-map screens: symptoms higher up than the foot or hand (user request, 2026-11-06)

The user reported that marking only the foot brought many unrelated leg questions. Cause: with uniform priors, the lower-back root (`root_low`) and stenosis started level with the foot options, so the picker spent about half the interview on back and leg questions (bending forward, walking, both legs, straight-leg raise). No evidence value changed.

- **New information-only questions,** gated to the foot/ankle or hand/wrist: `h_symptoms_above_foot` ("Besides your foot or ankle, do you also have pain, numbness or tingling anywhere higher up...?") and `h_symptoms_above_hand`. New schema field `impliedByRegions`: the answer is filled in as "yes" (shown as "follows from the areas you marked") when a higher area is marked, so only patients who marked just the foot or hand are asked.
- **New uncited `usual` logic items** (reasoning, labelled as such): `root_low` and `stenosis` on `h_symptoms_above_foot`; `root_cervical`, `tos` and `neuralgic_amyotrophy` on `h_symptoms_above_hand`. A "no" counts against them in the logical fit; it never changes a probability.
- **Selection:** a body-map follow-up is asked before any clinical question (it completes where the symptoms are; on information alone it tied with the stenosis questions). `isRuledOut` now also covers studied questions: a question is skipped once every option it bears on (logical-fit checks plus the options its studies measured) is ruled out, like not asking about an eliminated suspect in Guess Who.
- **Effect:** forefoot-only patient answering "no": back/leg questions 11 → 0, scored questions 21 → 10. Heel-only: 6 questions. Hand-only: the neck tests drop out.
- **Results** (`eval-cases`; holdout aggregate only, run once on the final version): dev interview top-3 19/23 unchanged, logical-fit top-3 31 → 32 of 46 (back at the baseline floor); holdout interview top-3 8/12 unchanged, logical-fit top-3 15 → 16 of 21. Dev mean interview length 27.1.
- **Note:** the probability shown for `root_low`/`stenosis` isn't lowered by a "no" (that would need a cited number). Their logical fit shows the "against", and their questions are no longer asked.


## Plantar fasciitis lost to stenosis on heel pain (user report, 2026-11-06)

The user answered every question the plantar-fasciitis way and still got lumbar spinal stenosis as the best guess. No evidence value changed.

- **Cause 1, the only studied sign wasn't asked.** For heel pain, plantar fasciitis has one scored finding, the windlass test (sens 0.318, spec 1). After the body-map screen ruled out the spine options, its expected entropy drop came out negative (−0.04): the possibilities dropped ruled-out options while their probability stayed, so a likely "no" looked like it added uncertainty. **Fix:** a question's value is now the expected KL divergence of the possibilities after the answer from now, which is never negative and equals the entropy drop for a consistent update (Guess Who halving still scores 1 bit). Ruled-out options now keep 5% of their share instead of vanishing, so an answer that brings one back is a finite change.
- **Cause 2, the best guess ignored the logical fit.** With only "worst on first steps" (logic) and the screen (logic) in favour, stenosis, the back root and plantar fasciitis sat at about 26% each, and the headline named all three, stenosis first. **Fix in `verdict.ts`** (display only, no probability changes): when the top options are within the 2× ratio, options the logical fit rules out are set aside; if one is left it is named (`tiebreak`) with a note on why the others were set aside. "Closest listed option" under "not covered" skips ruled-out options. A clear probability leader is unchanged and keeps the "logical fit disagrees" note.
- **Checklist questions restored.** The KL change left some obturator checklist questions below the cut-off once the option looked settled. Per the 2026-11-04 user decision, remaining published-checklist questions for an unscored option in play are asked once nothing else eliminates enough.
- **Outcome on the user's scenario** (heel, screen "no", first steps "yes", numbness "no"): windlass yes → plantar fasciitis leading at 96%; windlass unsure → plantar fasciitis named, stenosis and back root set aside; windlass no → "not covered" (32%) ahead, with plantar fasciitis as the closest listed option. That last one is what the data supports: a negative windlass lowers it and no other question has study data for it.
- **Results** (`eval-cases`; holdout aggregate only, run once on the final version): dev interview top-3 19/23 and logical-fit 32/46, both unchanged; holdout 8/12 and 16/21, unchanged. Dev mean interview length 27.1 → 30.2 (max 55), mostly from the restored checklist questions.
- **Known gap:** plantar fasciitis needs more studied signs (first-step pain, tenderness at the inner heel). Worth a `mine-literature` pass.

## Ten described patients (user request, 2026-11-06)

The user supplied ten plain-language patient descriptions (sciatica, frozen shoulder, kneecap pain, tennis elbow, hip OA, carpal tunnel, ankle sprain, plantar fasciitis, rheumatoid-pattern arthritis, thumb-base OA). They are in `tests/vignettes/patients.test.ts`: full interview, answers only from what the description states, "unsure" otherwise. Before the changes, 2 of 10 best guesses named the expected option. After them, 9 of 10 do. No accuracy value changed.

- **`alwaysAsk` was ignored for logical-fit checks.** The end-of-interview rescue only took context-only questions, so tennis elbow's gripping question (`h_grip_lateral_elbow`, cited `usual` item, ihm2008) was never asked: one unscored option among many never clears 0.03 bits. **Fix:** `alwaysAsk` questions without study data come at the end, checks included.
- **Rheumatoid-pattern questions were unreachable.** `h_many_joints_swollen` waited for "yes" to `h_many_places_both_sides` ("apart from the areas you marked…"), which was never asked, and which a patient with the same joints affected on both hands would answer "no". **Fix:** `h_many_joints_swollen` is now `alwaysAsk` with no `askIf`, and `h_morning_stiff_long` (still after a "yes" to it) is `alwaysAsk`. `h_ankle_rolled_in` (sprain `usual` item) is `alwaysAsk` after an ankle injury.
- **The best guess ignored options without study data.** Tennis elbow, ankle sprain and inflammatory arthritis have no probability, so the headline named the scored options (neck root, stenosis, De Quervain's...) at their uniform starting value. **Fix in `verdict.ts`** (display only): when probability can't separate the options (close, or "other" ahead), the option with strictly more net logical fit than every other is named (`logic-lead`), whether it is a close scored option or one without study data. A clear (×2) probability lead stands; a scored option far behind isn't promoted; a logical-fit tie names nobody. The existing `tiebreak` keeps precedence unless the leader is unscored.
- **Thin logical fit, so ties.** Frozen shoulder vs shoulder OA, carpal tunnel vs non-specific arm pain, and thumb-base OA vs non-specific arm pain each had one check apiece. Added uncited reasoning (labelled as such in the UI; no probability):
  - `cts`: `supports` `h_hand_flick` (new: shaking/flicking eases the numbness, asked after `h_arm_numbness` yes) and `supports` `p_night_rest`.
  - `thumb_cmc_oa`: `supports` `h_thumb_base_bump` (new: squared-off bony bump or grinding at the thumb base, asked after `h_thumb_base_pinch` yes).
  - `shoulder_oa`: `usual` `h_age_60` (new, shoulder regions; implied by `h_age_over_65` yes, `h_age_50` no, `h_age_45` no).
- **Not fixed, Arthur (hip OA → stenosis 63%).** Age over 65, worse standing and walking eased by sitting are cited stenosis findings (Suri 2010). His hip clues (groin pain, socks and low car seats, morning stiffness under 30 minutes) have no accuracy data. Checked and rejected: Metcalfe 2019 Tables 1–2 (no matching row), and Brown 2004 (PMID 15021166, "seven times more likely" for limp/groin pain, no CIs or sens/spec). Kept as an `it.fails` test. A hip-vs-spine study reporting sens/spec for groin pain or pain putting on socks would close it.
- **Results** (`eval-cases`; holdout aggregate only, run once on the final version): dev interview top-3 19/23 and logical-fit 32/46, unchanged; holdout 8/12 and 16/21, unchanged. Dev mean interview length 30.2 → 33.0 (max 58), from the end-of-interview checks.

## Groin pain separates hip OA from spinal stenosis: Khan 2004 (user-supplied PDF, 2026-11-06)

Follow-up to the Arthur gap above. Searched Europe PMC for hip-vs-spine accuracy data. Full text supplied by the user (`hip-osteoarthritis.pdf`; PMC holds it as PDF only, which can't be fetched automatically).

- **Added `khan2004`** (PMID 15005931): 51 patients awaiting hip replacement for OA vs patients operated for confirmed lumbar spinal stenosis, patient-drawn pain maps. **`h_groin_pain`** scored for `hip_oa`: sens 0.843 (43/51), spec 0.703 (38/54), Wilson CIs from the counts. Table 1; Results.
- **Counts reconstructed.** Table 1 fits 51 hip and 54 stenosis patients with truncated percentages, though the text says all 60 stenosis patients responded. The posterior-thigh row fits neither (not used). Other slips: 32 + 29 = 61 hip patients; Kellgren-Lawrence mean 12.4. Two-gate audit of surgical candidates with a retrospective comparison group: **low certainty, probably overstated.**
- **Only the groin row.** The authors conclude groin pain is the only location that separates the two (Discussion). Buttock and calf were also significant, but as findings they would apply this study's stenosis-only comparison rate to every other buttock or calf condition (deep gluteal, SIJ, calf strain...), where the rate is unrelated.
- **Body map.** Filled in "yes" when the groin is marked (`impliedByRegions`); otherwise asked, gated to the hip OA regions. **Selection change:** only body-map screens without study data jump the queue; a studied location question competes by possibilities eliminated like any other.
- **Checked and rejected:** Kim 2015 BMJ (PMID 26631296; groin pain vs radiographic OA in community cohorts, not people presenting with pain, so the comparison group doesn't match); Metcalfe 2019 "morning stiffness <60 min" (range across two studies, no pooled CI); Sutlive 2008 (paywalled, mostly examiner tests); Birrell 2001 (range of movement, examiner); Lesher 2008 (frequency only); Brown 2004 (no CIs or sens/spec); the 2026 "Athena sign" review (PMID 42650919; narrative, no accuracy data, examiner-only).
- **Effect on Arthur:** hip OA 8% → 21%, stenosis 63% → 55%; still a clear stenosis lead, so the test stays `it.fails`. The remaining lever is a modelling choice, not evidence: the stenosis posture items (worse standing, better/no pain seated) are scored as independent of walking claudication.
- **Tests:** the obturator vignette (all answers "yes") now reaches hip OA at 93% before the inner-thigh question; it asserts the obturator checklist is asked instead.
- **Results** (`eval-cases`; holdout aggregate only, run once): dev top-1 13 → 14/23 (baseline raised), top-3 19/23, interview top-3 19/23, logical-fit 32/46; holdout 6/12, 8/12, 8/12, 16/21, unchanged. Dev mean interview length 33.0 → 33.4.

## Stenosis posture items merged into one dependence group (user decision, 2026-11-06)

- **Change:** `h_worse_standing`, `h_improve_seated` and `h_no_pain_seated` move from `posture_sitting` into `flexion_walking` with claudication, bending forward and easing on standing still. Only the strongest answered item now counts.
- **Why:** they describe the same mechanism (extension narrows the canal, flexion and sitting open it), so a patient with neurogenic claudication will usually say yes to all of them. Counting walking claudication and the posture items separately treated one observation as two pieces of evidence (Suri 2010 reports each item alone, not jointly).
- **Effect on Arthur:** stenosis 55% → 35%, hip OA 21% → 30%. That's within the 2× ratio, and the logical fit (hip OA +2/−0 vs stenosis +2/−1) names hip OA, so his test passes and is no longer `it.fails`.
- **Results** (`eval-cases`; holdout aggregate only, run once): dev top-1 14/23, top-3 19/23, interview top-3 19/23, logical-fit 32/46; holdout 6/12, 8/12, 8/12, 16/21. All unchanged.

## Overall ranking: one judgement across probability and logical fit (user request, 2026-11-06)

Display only: no probability, logical fit or evidence value changes.

- **Rule (`judgementRanking`, verdict.ts):** options in probability bands, a new band wherever the next option is less than half as likely as the band's top. A clear leader (×2, and ahead of "not covered") stands alone. Within a band the logical fit (fit − against) orders them, then options with a probability, then probability. Options without study data join the first band probability can't settle if they fit more than count against them; the rest come last, ordered by logical fit.
- **Consistency with the best guess.** A property test (2000 random cases) checks that the ranking's first entry is always the option the best guess names. It found two disagreements, both fixed in `bestGuess`:
  - the logical-fit leader is now chosen only among the options probability can't separate (close scored options and options without study data), so a scored option far behind can neither be promoted nor block one;
  - the tie-break (only one close option not ruled out) no longer applies when an option without study data fits better; a "close" verdict now lists the top of the ranking, which can include such options.
- **UI:** an "Overall ranking" card under the best guess (top two bands, at most 6 options; all with "Show all options"), each band labelled with why it is ordered as it is. It is described as an order, not a probability.
- **Results:** the ten described patients and the case-report metrics are unchanged (dev 14/23 top-1, 19/23 top-3; holdout unchanged).


## Second set of ten described patients (user request, 2026-11-06)

Ten more plain-language descriptions (stenosis, De Quervain's, axial SpA, outer hip tendon, hip impingement, cubital tunnel, Achilles tendinopathy, PMR, MCL sprain, and a suspected spinal metastasis that no option covers), run as before, then rerun with the patients' answers to follow-up questions, self-tests included. Before the changes 3 of the 9 coverable patients were named; with the follow-up answers 5; after the changes 6 (Victor, Hannah, Devon, Grace, Nora, Trevor, now in `tests/vignettes/patients.test.ts`). No accuracy value changed.

- **Options without study data were never asked about.** In the steering view they share the single "other" slot, so among the 25 low-back/buttock options a check on one of them scores well under 0.03 bits (axial SpA's four questions, 0.001–0.006). **Fix (user decision):** once no question clears the threshold, and while the question budget lasts, the `usual`/`supports` logical-fit checks of unscored options still in play are asked, most possibilities eliminated first, after the published checklists and before stress clues (`nextAfterScored`). Tried and rejected: giving each unscored option a full "other" share in `possibilities` (gained the MCL case, lost Arthur and Chloe, and still didn't reach axial SpA).
- **A gated checklist was unreachable past the budget.** PMR's checklist opens on `h_many_places_both_sides`, which counted against the budget. The question that opens an unanswered checklist item of an in-play unscored option now counts as part of the checklist.
- **`h_many_places_both_sides` reworded.** "Apart from the areas you marked, do you also have pain… in several other places on both sides?" made a patient who had marked every painful area answer "no", which ruled out PMR, inflammatory arthritis and fibromyalgia (all `usual` items) and closed their questions. Now: "Do you have pain, stiffness or swelling in several places on both sides of your body, for example both hands, both shoulders or both hips? Count the areas you marked." Chloe's answer in the first set changes to "yes" to match.
- **Not fixed:**
  - *Evelyn (PMR).* The checklist is now asked and fully met (+6 fit, 0 against), but hip OA leads on probability (12% vs 6%) from groin pain filled in by the body map, and a ×2 lead stands. Needs accuracy data for PMR, or a change to the verdict rule.
  - *Justin (MCL).* Meniscus leads (43%) on weight-bearing injury, squat and stairs; the collateral ligament has no study data. "Knee forced sideways" is now asked and fits (+2 fit, 0 against, level with meniscus), but the ×2 probability lead stands.
  - *Caleb (hip impingement).* Close call: sacroiliac joint / hip impingement / pubic bone stress. Missing: an age finding for hip OA, a hip clicking/catching question.
  - *Mireille (suspected metastasis).* Named a neck nerve root by tiebreak with no check fitting, "other" level with it. No safety notice for the mid-back.
- **Literature (targeted Europe PMC searches, same day).**
  - *MCL, worth getting:* Kastelein 2008 (PMID 18954845, 10.1016/j.amjmed.2008.05.041, paywalled). 134 adults with a traumatic knee injury in Dutch general practice, MRI reference, 35 MCL lesions. "Trauma by external force to leg" and "rotational trauma" were associated with MCL lesions; the abstract is cut off before the values. It comes from the same cohort as Wagemakers 2008 (meniscus, PMID 18185035, already listed above), so both could be scored in one population.
  - *PMR, nothing new:* hits are imaging, laboratory markers, GCA and EORA-versus-PMR (Hysa 2026, PMID 42858918: discriminating values need serology or ultrasound). Nielsen 2023 (PMID 37639896, systematic review of referral strategies) found no clinical strategy with consistently high accuracy. Dasgupta 2012 stays a checklist: its score requires CRP/ESR.
- **Results** (`eval-cases`; holdout aggregate only, run once on the final version): dev top-3 19/23 and logical-fit 32/46, unchanged; holdout 8/12 and 16/21, unchanged. Dev mean interview length 33.4 → 37.9 (max 61), from the extra checks.

## Best guess combines probability and logical fit (user decision, 2026-11-06)

Display only: no probability, logical fit or evidence value changes, and nothing feeds `bayes.ts`.

- **Rule (`verdict.ts`).** Combined score = probability × 2 per uncited/criteria logical-fit check that fits, ÷ 2 per one against. Studied checks are left out because they already moved the probability. An option without study data starts at the probability of "other": in `bayes.ts` every finding gives it the background rate, as for "other", so that is its probability if it were listed on its own. "Not covered" also starts there, with no checks. Options within ×2 of a band's best share a band, ordered by net logical fit. Best guess: "not covered" when it is within ×2 of the best listed option; otherwise the top-band option if it stands alone or fits strictly more than the rest; otherwise a close call. The `tiebreak` and `logic-only` verdicts are gone (both are special cases of this rule).
- **Choices.** On the twenty described patients, splitting "other" between the options without data (as the question picker does) named the right option in 11–15 of 20; starting each at "other" named it in 18. Factors 2, 3 and 4 gave the same result; 2 matches the question picker's `CHECK_WEIGHT`.
- **Results.** Described patients: 19 of 20 (Evelyn, Justin and Mireille now right; Caleb a close call with hip impingement first), against 16 under the previous rule. New `eval-cases` metric: overall-ranking top-1/top-3 after the interview, over cases in territory. Dev: 26/46 and 35/46, against 21 and 33 under the previous rule (recomputed in a scratch script); now in `cases/baseline.json`. Dev cases that fell: two LFCN cases (1 → 3, 6 → 13) and one deep gluteal case (11 → 23). Holdout aggregate, reported once: 10/21 and 13/21 (no earlier value for this metric). Probability and logical-fit metrics unchanged.

### Unmet checklist items don't count against in the best guess (same day)

Traced the three dev cases that fell under the combined rule (dev only).
- **Both LFCN cases.** "No" to tight clothing, an item on meralgia's checklist (a list of risk factors, "not scored"), counted against and halved meralgia's score. In one case that took it from a 43% probability lead to third, behind stenosis and behind PMR (doubled by its "aged 50 or older" prerequisite alone). Checklists differ: all items required (tennis elbow, adductor, knee OA), any one (Ottawa), at least k (ICHD-3 headaches), point scores (Michel, PMR), risk-factor lists (meralgia). Only the title says which. **Fix (`verdict.ts` only):** an unmet checklist item doesn't count against in the combined score, the ordering within a band or the set-aside rule; a met item still counts. The logical-fit view still shows the item as unmet. LFCN cases: 3 → 1 and 13 → 2.
- **Deep gluteal (11 → 23), not changed.** The positive straight-leg raise lowers its probability to 4%, below the untested options' starting value; the old rank came from band ordering, not from evidence.
- **Known weaknesses.** All-required checklists lose their "against" too; encoding each checklist's rule (all / any / at least k / points) and scoring it as a unit would fix both directions. Generic `supports` clues (e.g. "one spot sets off the pain" for back muscles) double a score like any other check.
- **Results.** Twenty described patients unchanged (19 of 20). Dev combined top-1 26 → 27 of 46, top-3 35 (baseline raised). Holdout aggregate, once: combined top-1 10/21, top-3 13/21, unchanged.

### Checklist rules: each published checklist judged as a whole (user request, same day)

New optional `criteria.rule` (`all` / `any` / `atLeast` n [of items] / `points` threshold [+ clinician-only points]) and item fields `required` and `points`, validated in `db.ts`. Display and best guess only, never a probability. Each rule comes from what the checklist's cited source already says (title, item wording or locator); nothing was added from memory.

| Option | Rule | Basis (already cited) |
|---|---|---|
| `lateral_epicondylalgia` | all | ihm2008: "all three should be present" |
| `adductor_groin` | all | weir2015 (Doha): "both required" |
| `knee_oa` | all | king2025 (NICE): "all three" |
| `pudendal` | all | labat2008 (Nantes): essential criteria and exclusion criteria, each must hold |
| `trigeminal` | all | ICHD-3 13.1, criteria A–C, each required |
| `ankle_fracture` | any | makiev2025 (Ottawa): "X-ray advised if any one applies" |
| `occipital_neuralgia` | at least 2 of brief / severe / quality | ICHD-3 13.4: "at least two of the first three" |
| `cervicogenic_headache` | at least 2 | ICHD-3 11.2.1: "at least two" |
| `pmr` | age and both shoulders required; then 4 points (stiffness 2, hip 1, no other joints 1) with 2 more only a clinician can add (RF/ACPA) | dasgupta2012 Table 6, as extracted on 2026-11-04 |

Left without a rule (unmet items say nothing): `lfcn` (risk factors, "not scored"), `morton` ("no cut-off defined"), `obturator`, `ilio_genito`, `pfcn` (case-series patterns), `cluneal` (the record doesn't state how many Kuniya criteria are needed) and `deep_gluteal` (Michel's per-item points aren't recorded; worth extracting from Michel 2013 Table 2).

- **Best guess (`verdict.ts`).** A checklist counts once against if an answer rules it out; otherwise its met items count, prerequisites only once it is met, and items whose finding has study data for that option are left out (already in the probability). This restores the "against" of all-required checklists, and PMR's "aged 50 or older" alone no longer counts.
- **Results page.** The checklist card now says whether, by the source's rule, it is met, can't be met, or is still open.
- **Results.** Described patients: 19 of 20, unchanged (Caleb: close call, hip impingement first). Dev combined top-1 27/46, top-3 35/46, unchanged. Holdout aggregate unchanged.

### Close calls get a clarifying question; hip catching question (user request, same day)

Caleb (hip impingement) ended on a three-way close call with pubic bone stress and the obturator nerve, after the 30-question limit. The questions that separate them existed but were never reached.
- **Close-call step (`selection.ts` `closeCallQuestion`, steering only).** When the interview would end on a close call, the open question bearing on the tied options (studied for one of them, or one of their logical-fit checks) that eliminates the most possibilities is asked, past the budget by up to `CLOSE_CALL_EXTRA` = 5 questions (an engineering constant). For Caleb it asks "Is the pain right over the pubic bone?" (`h_pubic_bone`, pubic bone stress `usual`); his "no" drops pubic bone stress.
- **New finding `h_hip_catch`** ("a painful catch, click or brief locking deep inside the hip joint, for example as you get up from a low chair or pivot on that leg"), a `supports` check for `hip_fai`. **Uncited reasoning**, labelled so in the UI, no probability: a torn or pinched labrum can catch as the ball turns in the socket. It is distinct from `h_hip_snap` (iliopsoas: a usually painless tendon clunk at the front of the hip). Gated to hip impingement's regions. Caleb reported it ("occasional painful clicking or catching deep inside the hip joint when transitioning from sitting to standing").
- **Not changed:** the obturator nerve's usual check ("worst pain on the inner thigh?") is gated to the inner thigh, which Caleb didn't mark, and its case-series pattern has no rule, so his two "no" answers to its pattern items don't count against it in the best guess.
- **Results.** Caleb: hip impingement, clear leader; all twenty described patients now named correctly (Mireille: "not covered"), and Caleb is in `patients.test.ts`. Dev combined top-1 27 → 28 of 46 (baseline raised), top-3 35; mean interview 37.9 → 38.8 questions. Holdout aggregate unchanged.

## Third set of ten described patients (user request, 2026-11-06)

Ten more plain-language patients were run through the full interview, answering only what each description states (self-tests "unsure" unless described). Five were named correctly as written (AC joint, MTSS, Morton's neuroma, cervical root, and, after the changes below, thoracic outlet); two more depended on a question the description didn't settle.
- **`h_age_growing` reworded** from "Are you aged 16 or younger (still growing)?" to "Are you still growing: a child or teenager who is still getting taller, or who has had a growth spurt in the last year?" (summary: still growing / no longer growing). Every use of it (the Osgood-Schlatter, Sever and knee OCD checks, and the growth-plate questions it opens) is about open growth plates, not an age cut-off, so no split was needed. A 17-year-old in a growth spurt (Tessa) had to answer "no", which counted against Osgood-Schlatter and named patellar tendinopathy. The age implications (still growing → not 45+, not 50+) still hold.
- **Two new findings for `tos`. Uncited reasoning**, labelled so in the UI, no probability: `h_arm_overhead_symptoms` (arm or hand symptoms with the arms raised above the shoulders, easing within minutes of lowering them) as a `usual` check, since raising the arms narrows the costoclavicular space; and `h_hand_colour_change` (hand pale, blue, blotchy, cold or puffy after use) as a `supports` check, since a "no" says nothing in the more common nerve form. Both are gated to the `tos` territory. Before this, `tos` had a single check, and Gregory (electrician, ring and little finger tingling with overhead work, cool pale hand) ended on a six-way close call with the cervical root and cubital tunnel; the overhead check, asked as a close-call question, now names thoracic outlet.
- **Not changed:** Sanjay (piriformis) ends on a close call (deep gluteal first, posterior femoral cutaneous nerve, SIJ) because his description gives no self-test results. Simone (turf toe, which no option covers) gives a close call between sesamoiditis and hallux rigidus. Walter (cauda equina, which no option covers) gets pudendal neuralgia as a clear leader because his perineal pain and pain on sitting meet the Nantes checklist; the user declined a safety notice for the perineum for now.
- **Tests.** Claire (snuffbox answered "yes"), Owen, Tessa (still growing "yes"), Gregory, Malik, Denise and Hector added to `patients.test.ts`: 27 described patients, all named correctly.
- **Results.** Dev combined top-1 28/46, top-3 35/46, unchanged; mean interview 38.8 → 39.1 questions. Holdout aggregate unchanged.
