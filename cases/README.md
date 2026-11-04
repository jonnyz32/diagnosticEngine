# Case-report test set

Published case reports, used to judge how well the engine ranks the true diagnosis. Run `npm run eval-cases` (add `-- --log` to append the summary to [RESULTS.md](RESULTS.md)).

## Holdout rule (user decision, 2026-11-03)
- Each case is assigned to **dev** or **holdout** by an FNV-1a hash of its PMID (`splitOf` in `src/engine/evaluate.ts`, about 30% holdout). Nobody chooses the split, and it never changes for a case.
- **Dev** cases may be inspected one by one and used to find and fix problems. `tests/cases/cases.test.ts` evaluates them, and `baseline.json` is their floor: raise it after a real improvement, never lower it to make a change pass.
- **Holdout** cases are scored only in aggregate. Never print, inspect or debug a holdout case's result, and never change evidence, reasoning, regions or conventions to fix one. If holdout is ever looked at case by case, it is spent: move those cases to dev and gather new ones.
- Changing the split rule or the hash would reshuffle the sets. Don't.

## Selection protocol
1. Europe PMC search per condition: condition synonyms in title/abstract, `PUB_TYPE:"case reports"`, open access, with abstract. Results are taken **in the search engine's relevance order**.
2. Per search, the first two **eligible** cases are taken. A case found by one condition's search whose final diagnosis is another option goes in under its real diagnosis.
3. Eligible when:
   - a single patient, aged 16 or over;
   - the final diagnosis maps to one hypothesis;
   - at least 3 facts map to findings;
   - pain or sensory symptoms are present (the app works from them);
   - not an evidence source (`checkCases` rejects that);
   - no cauda equina or spinal cord syndrome, and no second cause producing the same symptoms.
4. `confirmation`: `reference` (surgery, nerve conduction/EMG, imaging, diagnostic block) or `clinical` (a clinician's diagnosis from history and examination, or a confirmation method not in the section read).

## Case series (protocol change, 2026-11-04)
- Several patients may come from one paper. Their ids are `c<PMID>-<patient number>`. The PMID decides the split, so a paper's patients all land in dev or all in holdout.
- Every eligible patient is taken in table order, up to `MAX_PER_PAPER` (10). Patients are never hand-picked.
- A patient's region may come from the series' inclusion criteria when the table gives no location (for example, pain in the pudendal territory). This is noted on the case.

**Yield (first run).**
- Searched: 26 searches across 23 conditions, about 2,000 hits. Papers with a numbered per-patient table were found automatically.
- Most such tables list only demographics and outcome scores (age, sex, side, ODI, VAS). Others were anatomy counts or meta-analysis summaries.
- Usable patients: 8 from 3 papers: 5 femoral palsies after anterior hip replacement (Patton 2018), 1 Parsonage-Turner after vaccination (Shields 2022, 5 of 6 patients had too few facts), and 2 classic pudendal neuralgia (Yu 2026, the rest post-herpetic or too few facts).
- Conclusion: published per-patient tables rarely record symptoms and examination findings, so this route doesn't scale either.

## Public data repositories (searched 2026-11-04)
DataCite search covering Zenodo, Dryad, Figshare, Mendeley Data, Harvard Dataverse and others: 22 queries across the app's conditions, about 350 dataset records.
- **No dataset** holds patient-level symptoms and examination findings with a confirmed diagnosis across competing causes.
- **What exists:** single-condition treatment-trial outcomes (VAS, ODI, EQ-5D), MRI/ultrasound image sets, and conditions outside the app's scope.
- **The one diagnostic-accuracy study** (666 pain-clinic patients, neuropathic vs non-neuropathic) deposited only supplementary documents and figures.
- **Two files downloaded and read as data:**
  - 10.17632/m7wfbxhfg3.1, carpal tunnel thermography: skin temperatures only, controls asymptomatic;
  - 10.17632/r39zrsfm6j, lumbar radiculopathy trial: pain scores, SLR angles and Oswestry for about 20 patients, root level not recorded.
  - Neither can be mapped to cases.
- **PhysioNet:** the catalogue API didn't respond with data; it holds mainly physiological signals.
- **Request-only sources:** Vivli (industry trials, including painful lumbar radiculopathy) and cohort data on request from study authors.

## CHECK cohort (assessed 2026-11-04, not used as a test set)
Open, CC BY 4.0, DANS 10.17026/dans-xex-hzww; 1002 Dutch adults aged 45-65 with early hip and/or knee pain.
- **Conditions of use:** cite the cohort profile (Wesseling 2014, Int J Epidemiol, doi:10.1093/ije/dyu177), include the CHECK acknowledgment, name CHECK in the title of a CHECK-only article, and preferably send manuscripts to checkreu@umcutrecht.nl.
- **Linkage:** the baseline and X-ray files were joined on `nsin` (all 1002 matched).
- **Counts (painful hips, baseline):**
  - 791 painful hips;
  - X-ray KL grade 0/1/2/3 = 443/202/96/9;
  - trochanteric bursitis 118, adductor tendinitis 12; radicular syndrome in 6 people;
  - single diagnosis only: hip OA (KL >= 2) 88, trochanteric bursitis 100.
  - Rondas 2022 reports 105/789 painful hips with KL >= 2, matching our count.
- **Why not used:**
  - The public release holds only WOMAC subscale totals; no single items (stairs, night, walking pain) are in any file (variable guide, "eng var quest corr 6.pdf").
  - Only about 3 facts per hip map onto app findings (both sides, straight leg raise, age always under 65).
  - The trochanter exam is part of the bursitis diagnosis, so it can't be a fact for those cases.
  - The test would measure mostly the starting odds.
- **Item-level WOMAC exists in the CHECK team's own data** (used in PMID 38862243). A request to checkreu@umcutrecht.nl could make CHECK a usable hip test set.

## Coding conventions
- Only facts the report states. Anything unstated stays unanswered, never "no".
- A clinician's examination is mapped onto the matching self-test and flagged `clinician: true`:
  - positive straight-leg raise → `st_slr_helper` yes;
  - foot drop or ankle/toe extensor weakness → `st_heel_walk` yes;
  - quadriceps weakness → `st_sit_to_stand` yes;
  - "sensation intact" → every skin-numbness check "no";
  - "strength normal" → every weakness test "no".
- Stated laterality ("left leg") answers `h_bilateral` "no". Age answers `h_age_over_65`.
- Regions come from where the patient's pain or numbness is described, never from the diagnosis:
  - unlocated "radiating leg pain" / sciatica → back of thigh + calf;
  - unlocated "hip pain" → groin + buttock + outer thigh;
  - unlocated "arm pain" → outer upper arm + outer forearm;
  - unspecified fingers → median-nerve fingers;
  - unlocated "foot" → top of foot + outer sole;
  - ball of the foot, between the toes or a named intermetatarsal space → forefoot.
- Facts are paraphrased with a locator (section), never copied text.

## Known limitations
- Case reports over-represent unusual presentations and rare causes (tumours, varices, post-surgical injuries), so accuracy here is not accuracy in a clinic.
- Most examinations were done by clinicians; a patient's self-test is likely less accurate.
- Many conditions have no accuracy data, so their cases count only in the logical-fit rank.
- Small numbers: one case moves a rate by several percentage points.

## Baseline findings from dev (2026-11-03)
- **Territory misses (3):** an L2-3 root causing buttock pain only (atypical, as the authors say); pudendal entrapment described as "hip pain"; anterior interosseous syndrome with unlocated "arm" pain. The last two come from the region conventions as much as from the engine.
- **Low ranks on buttock and hip tissue cases** (ischiofemoral impingement, outer-hip tendons, one deep gluteal case). The facts in these reports have accuracy data only for *other* options: "stairs" is studied for hip OA, "better sitting" for stenosis. So one studied finding decides the ranking while the true diagnosis stays at its starting value. This is evidence asymmetry, which more evidence fixes and tuning would not.

## Exclusion log (first pass, 2026-11-03)
| PMID | Searched as | Reason |
|---|---|---|
| 42597798 | root_low | age 13; cauda equina |
| 42688858 | root_low | cauda equina (bladder/bowel) |
| 41541451 | root_low | disc herniation plus schwannoma, two causes |
| 42694793 | root_mid | operative video, no case details |
| 42904114 | stenosis | final diagnosis Guillain-Barré |
| 42602926 | stenosis | trial analysis, not a case report |
| 42131677 | deep_gluteal, pfcn | cadaver |
| 41700247 | deep_gluteal | final diagnosis axial spondyloarthritis |
| 42941375, 39950542, 34513103, 26391128 | hip_oa | final diagnosis other, or hip OA incidental |
| 42932859 | hip_oa | technique guide, no case |
| 42597710 | hip_oa | fewer than 3 mappable facts |
| 42151902 | sij | septic sacroiliitis (infection) |
| 40255922 | sij | not confirmed by a sacroiliac joint block |
| 33598061 | gtps | final diagnosis atypical femoral fracture |
| 31245309 | gtps | series of 11 |
| 39834501 | gtps | fewer than 3 mappable facts |
| 41947244, 40737821 | pfcn | unrelated (thyroid schwannoma; anaesthesia) |
| 41070289 | ifi | age 8 |
| 41150494 | proximal_hamstring | comparative study |
| 42699943 | disc_pain | presumed diagnosis with radiculopathy |
| 39687812 | disc_pain | fewer than 3 facts at the time of diagnosis |
| 39583519 | disc_pain | working diagnosis, not confirmed |
| 39968219 | disc_pain | paraplegia (sensation questions invalid) |
| 39049100 | cluneal | fewer than 3 mappable facts |
| 41281146 | obturator | two cases |
| 42910045 | femoral | symptoms not in the section read |
| 36189159 | facet_lbp | three cases |
| 28228895 | adductor_groin | final diagnosis obturator internus strain |
| 42670523 | root_cervical | spinal cord syndrome |
| 40882962 | root_cervical | final diagnosis metastasis |
| 42937735 | root_cervical | fewer than 3 mappable facts |
| 42751717 | root_cervical | weakness only, no pain or sensory symptoms |
| 42965185 | root_cervical | spinal cord ischaemia as well |
| 42621598 | root_cervical | trial |
| 41112395 | root_cervical | fewer than 3 mappable facts |
| 42729100 | cts | two cases |
| 41992685 | cts | no case text available |
| 42875417 | cubital | spinal cord injury |
| 42598027 | cubital | congenital cleft hand |
| 42597442 | rotator_cuff | fewer than 3 mappable facts |
| 42283752 | rotator_cuff | no tear (isolated atrophy) |
| 42273483 | rotator_cuff | final diagnosis synovial chondromatosis |
| 42732290 | thumb_cmc_oa | pain after previous surgery |
| 41970790 | thumb_cmc_oa | fewer than 3 mappable facts |
| 41969331 | thumb_cmc_oa | abstract only, no case details |
| 42829546 | tfcc | final diagnosis glomangioma |
| 25878929 | tfcc | ulnar nerve compression the presenting problem |
| 41029133 | tfcc | fewer than 3 mappable facts |
| 41911205 | guyon | abstract only, fewer than 3 facts |
| 41466776 | guyon | tumours at two sites along the nerve |
| 34754557 | radial_tunnel | fewer than 3 mappable facts |
| 42023676 | tos | dog |
| 42733681, 42824855 | neuralgic_amyotrophy | phrenic nerve only, no limb symptoms |
| 41846715 | frozen_shoulder | fewer than 3 mappable facts |

## Second pass (2026-11-04)
The next unseen results (up to 3 per search) for the gap conditions and the common ones. 12 cases added.

| PMID | Searched as | Reason |
|---|---|---|
| 42164219, 42571481, 42830963 | disc_pain | unrelated (myelopathy, CSF leak, subdural haematoma) |
| 41492623 | thumb_cmc_oa | rheumatoid arthritis as well |
| 31448205 | thumb_cmc_oa | pain after two previous operations |
| 42597506, 41815650 | rotator_cuff | calcific tendinitis outside the rotator cuff |
| 41728495 | tfcc | ganglion cyst, not a TFCC tear |
| 40981088 | tfcc | pain location and too few facts in the section read |
| 42181421 | tfcc | DRUJ dislocation |
| 40470464, 42011470 | guyon | tortuous ulnar artery; pisiform dislocation |
| 41346918 | guyon | carpal tunnel syndrome as well |
| 42713058 | axillary | three cases |
| 42164213 | axillary | diagnosis only suspected |
| 42181414 | axillary | rotator cuff re-tear as well |
| 42091522, 42374309, 42699136 | musculocutaneous | animal; arterial trauma; cadaver |
| 39380124 | biceps_tendinopathy | gout and SLAP tear; too few facts |
| 26758855 | biceps_tendinopathy | tendon rupture |
| 42327504 | trigger_finger | Dupuytren's disease as well |
| 40161098 | trigger_finger | no pain or sensory symptoms |
| 42255892 | trigger_finger | age 3 |
| 41728461 | medial_epicondylalgia | lateral epicondylitis as well |
| 41847568 | medial_epicondylalgia | case series |
| 38333238 | medial_epicondylalgia | final diagnosis ulnar nerve dislocation |
| 41874144, 42266323, 42005172 | ac_joint | septic arthritis; dislocations (two cases); sternoclavicular joint |
| 41552105, 42273509 | shoulder_oa | suprascapular neuropathy / subscapularis tear as well |
| 42688916 | shoulder_oa | post-fracture deformity |
| 42428375, 42535077, 40174270 | neck_joint | fixation failure; angina-like cervical pain; dislocation |
| 37128523, 35415554 | intersection_syndrome | multi-case reports |
| 41246728, 42948553, 41859570 | gtps | tuberculosis; abscess; cadaver |
| 41542025, 42910238 | cts | cadaver; amyloidosis with hip OA |
| 42343424 | cts | recurrence after two releases (amyloid) |
| 41239690 | root_low | piriformis syndrome on top of earlier radiculopathy (two causes) |
| 42597684 | root_low | final diagnosis herpes zoster |
| 42375322 | root_cervical | myeloradiculopathy |
| 42707450 | stenosis | trial |
| 41952741 | stenosis | final diagnosis ligamentum flavum haematoma |
| 42255824 | cubital | after thoracic outlet surgery (second cause) |
| 38665699 | sij | ankle sprain as well |
| 35849889 | sij | confirmation and facts not in the section read |
| 35211233 | sij | no case text |
| 41583607, 42317917 | hip_oa, deep_gluteal | case series |
| 42798664 | hip_oa | fibrous dysplasia |
| 41013718 | lfcn | age 12 |
| 41209914 | lfcn | resolved condition |
| 39667120 | deep_gluteal | after hip replacement, lipomatosis, previous operations |

**Still no eligible case:** `disc_pain`, `tfcc`, `guyon`, `axillary`, `musculocutaneous`, `trigger_finger`, `medial_epicondylalgia`, `ac_joint`, `shoulder_oa`, `neck_joint`, `nonspecific_arm_pain`.

**One case only:** `gtps`, `cts`, `thumb_cmc_oa`, `rotator_cuff`, `biceps_tendinopathy`, `intersection_syndrome`.

For these common conditions, open-access single case reports are mostly rare causes, combined conditions or multi-patient papers. The next source should be case series that report each patient separately.
