// Network: searches Europe PMC for diagnostic-accuracy studies per hypothesis and writes
// candidate reports to mining/ for manual extraction. It never edits evidence/: every number
// found here still has to be checked against the paper's table and logged in CURATION.md.
// Run with `npm run mine-literature` (optionally `-- sij lfcn` to limit hypotheses).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sources from "../evidence/sources.json";

const OUT = "mining";
const API = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const PAGE = 50; // hits per request (larger "core" pages time out)
const MAX_HITS = 300; // hits per hypothesis
const FULLTEXT_PER_HYP = 25; // open-access full texts fetched per hypothesis

// Condition synonyms, searched in title + abstract.
const TERMS: Record<string, string> = {
  root_mid: `"upper lumbar radiculopathy" OR "L2 radiculopathy" OR "L3 radiculopathy" OR "L4 radiculopathy" OR "upper lumbar disc herniation" OR "femoral nerve stretch test" OR "L4 nerve root"`,
  root_low: `sciatica OR "lumbar radiculopathy" OR "lumbosacral radiculopathy" OR "lumbar disc herniation" OR "nerve root compression" OR "L5 radiculopathy" OR "S1 radiculopathy"`,
  stenosis: `"lumbar spinal stenosis" OR "neurogenic claudication" OR "lumbar canal stenosis"`,
  deep_gluteal: `"piriformis syndrome" OR "deep gluteal syndrome" OR "sciatic nerve entrapment"`,
  lfcn: `"meralgia paresthetica" OR "lateral femoral cutaneous nerve"`,
  pudendal: `"pudendal neuralgia" OR "pudendal nerve entrapment" OR "pudendal neuropathy"`,
  cluneal: `"cluneal nerve"`,
  obturator: `"obturator neuropathy" OR "obturator nerve entrapment" OR "obturator neuralgia"`,
  ilio_genito: `"ilioinguinal neuralgia" OR "genitofemoral neuralgia" OR "iliohypogastric" OR "ilioinguinal nerve entrapment"`,
  femoral: `"femoral neuropathy" OR "femoral nerve entrapment" OR "femoral nerve palsy"`,
  hip_oa: `"hip osteoarthritis" OR "osteoarthritis of the hip" OR "hip OA"`,
  sij: `"sacroiliac joint pain" OR "sacroiliac joint dysfunction" OR "sacroiliac joint-related pain" OR "sacroiliac pain"`,
  gtps: `"greater trochanteric pain syndrome" OR "gluteal tendinopathy" OR "trochanteric bursitis" OR "lateral hip pain"`,
  pfcn: `"posterior femoral cutaneous nerve" OR "posterior cutaneous nerve of the thigh"`,
  ifi: `"ischiofemoral impingement"`,
  // Cohorts that report several final diagnoses give accuracy for many findings at once.
  multi: `"buttock pain" OR "groin pain" OR "hip pain" OR "leg pain" OR "low back pain" OR "posterior hip pain"`,
  // Upper limb.
  root_cervical: `"cervical radiculopathy" OR "cervical nerve root" OR "C6 radiculopathy" OR "C7 radiculopathy" OR "C8 radiculopathy" OR "Spurling" OR "upper limb tension test" OR "upper limb neurodynamic test"`,
  cts: `"carpal tunnel syndrome" OR "median neuropathy at the wrist"`,
  median_proximal: `"pronator syndrome" OR "pronator teres syndrome" OR "anterior interosseous" OR "proximal median neuropathy"`,
  cubital: `"cubital tunnel syndrome" OR "ulnar neuropathy at the elbow" OR "ulnar nerve entrapment"`,
  guyon: `"Guyon" OR "ulnar tunnel syndrome" OR "ulnar neuropathy at the wrist"`,
  radial: `"radial tunnel syndrome" OR "posterior interosseous nerve" OR "radial neuropathy" OR "radial nerve palsy" OR "Wartenberg" OR "superficial radial nerve" OR "cheiralgia paresthetica"`,
  tos: `"thoracic outlet syndrome" OR "neurogenic thoracic outlet" OR "Roos test" OR "elevated arm stress test"`,
  shoulder_nerves: `"suprascapular neuropathy" OR "suprascapular nerve entrapment" OR "long thoracic nerve" OR "scapular winging" OR "axillary nerve" OR "quadrilateral space syndrome" OR "musculocutaneous nerve" OR "lateral antebrachial cutaneous" OR "neuralgic amyotrophy" OR "Parsonage-Turner"`,
  shoulder_mimic: `"subacromial pain" OR "rotator cuff tear" OR "rotator cuff tendinopathy" OR "subacromial impingement" OR "frozen shoulder" OR "adhesive capsulitis"`,
  elbow_wrist_mimic: `"lateral epicondylitis" OR "lateral epicondylalgia" OR "tennis elbow" OR "de Quervain" OR "trigger finger" OR "thumb carpometacarpal osteoarthritis"`,
  multi_arm: `"arm pain" OR "hand numbness" OR "hand paresthesia" OR "upper limb pain" OR "neck and arm pain" OR "upper extremity entrapment"`,
  // Chest and upper back.
  root_thoracic: `"thoracic radiculopathy" OR "thoracic disc herniation" OR "thoracic nerve root" OR "diabetic truncal radiculopathy" OR "thoracic myelopathy"`,
  intercostal: `"intercostal neuralgia" OR "intercostal nerve entrapment" OR "post-thoracotomy pain" OR "anterior cutaneous nerve entrapment" OR "notalgia paresthetica" OR "dorsal scapular nerve"`,
  zoster: `"herpes zoster" AND (thoracic OR "chest" OR trunk OR prodrom*) OR "postherpetic neuralgia" OR "zoster sine herpete"`,
  chest_wall: `"chest wall syndrome" OR "chest wall pain" OR "musculoskeletal chest pain" OR costochondritis OR "Tietze" OR "slipping rib" OR "costovertebral" OR "costotransverse" OR "sternoclavicular"`,
  thoracic_spine: `"thoracic spine pain" OR "thoracic back pain" OR "mid back pain" OR "upper back pain" OR "thoracic facet" OR "thoracic zygapophyseal" OR "interscapular pain" OR "thoracic compression fracture" OR "vertebral fracture"`,
  multi_chest: `"chest pain" AND ("primary care" OR "general practice" OR "palpation" OR "reproducible") OR "non-cardiac chest pain" OR "noncardiac chest pain"`,
  // Foot.
  morton: `"Morton neuroma" OR "Morton's neuroma" OR "interdigital neuroma" OR "intermetatarsal neuroma" OR "Morton metatarsalgia" OR "Mulder click" OR "interdigital neuritis" OR "plantar digital neuritis"`,
  plantar_plate: `"plantar plate" OR "lesser metatarsophalangeal" OR "metatarsophalangeal instability" OR "metatarsophalangeal synovitis" OR "predislocation syndrome" OR metatarsalgia OR "crossover toe"`,
  mt_stress_fracture: `"metatarsal stress fracture" OR "metatarsal fracture" OR "foot stress fracture" OR "march fracture" OR "metatarsal stress injury" OR "navicular stress fracture"`,
  hallux_rigidus: `"hallux rigidus" OR "hallux limitus" OR "first metatarsophalangeal joint osteoarthritis" OR "first metatarsophalangeal osteoarthritis" OR "big toe osteoarthritis" OR sesamoiditis`,
  tarsal_tunnel: `"tarsal tunnel" OR "medial plantar nerve" OR "lateral plantar nerve" OR "Baxter nerve" OR "plantar nerve entrapment" OR "posterior tibial nerve entrapment" OR "tibial neuropathy at the ankle"`,
  multi_foot: `"forefoot pain" OR "foot pain" OR "plantar foot pain" OR "ball of the foot"`,
};
const ACCURACY = `(sensitivity OR specificity OR "likelihood ratio" OR "diagnostic accuracy" OR "diagnostic value")`;
const CLINICAL = `(clinical OR examination OR history OR "physical exam" OR test OR questionnaire OR symptom)`;
const MULTI_EXTRA = ` AND TITLE_ABS:("differential diagnosis" OR "final diagnosis" OR "diagnostic study")`;

type Hit = {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  isOpenAccess?: string;
  abstractText?: string;
  pubTypeList?: { pubType: string[] };
};

const known = new Set((sources as { pmid?: string }[]).map((s) => s.pmid).filter(Boolean));
// PMIDs already discussed in the curation log (used or rejected) are flagged, not hidden.
const logged = new Set(readFileSync("evidence/CURATION.md", "utf8").match(/\b\d{7,8}\b/g) ?? []);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const NUMBERED = /(sensitivity|specificity|likelihood ratio|LR\+|LR-|AUC|area under)[^.]{0,60}\d/i;
const INVESTIGATION = /\b(MRI|magnetic resonance|ultrasound|ultrasonograph|CT\b|computed tomography|electromyograph|EMG|nerve conduction|neurograph|radiograph|x-ray|injection|block)\b/i;
const BEDSIDE = /\b(history|symptom|physical exam|clinical exam|clinical test|provocation|palpation|questionnaire|self-report|patient-reported|sign)\b/i;

/** Europe PMC returns 503 under load; retry with backoff. */
async function get(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok || res.status === 404 || attempt === 4) return res;
    await sleep(2000 * 2 ** attempt);
  }
}

async function search(query: string): Promise<Hit[]> {
  const hits: Hit[] = [];
  let cursor = "*";
  while (hits.length < MAX_HITS) {
    const url = `${API}/search?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${PAGE}&cursorMark=${encodeURIComponent(cursor)}`;
    const res = await get(url);
    if (!res.ok) throw new Error(`Europe PMC search ${res.status}`);
    const body = (await res.json()) as { nextCursorMark?: string; resultList: { result: Hit[] } };
    hits.push(...body.resultList.result);
    if (body.resultList.result.length < PAGE || !body.nextCursorMark || body.nextCursorMark === cursor) break;
    cursor = body.nextCursorMark;
    await sleep(300);
  }
  return hits;
}

/** Rank: numbers in the abstract, then bedside (history/exam) over investigations, then recency. */
function score(h: Hit): number {
  const a = `${h.title} ${h.abstractText ?? ""}`;
  let s = 0;
  if (NUMBERED.test(a)) s += 4;
  if (BEDSIDE.test(a)) s += 2;
  if (INVESTIGATION.test(a)) s += 1;
  if (/systematic review|meta-analysis/i.test(a)) s += 1;
  if (/case report/i.test(a)) s -= 4;
  return s;
}

/** Sentences from the abstract that carry accuracy figures. */
function numberedSentences(abs: string): string[] {
  return strip(abs)
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .filter((x) => NUMBERED.test(x))
    .slice(0, 6);
}

/** Tables from the open-access full text that look like accuracy or 2x2 tables, as plain rows. */
async function accuracyTables(pmcid: string): Promise<string[]> {
  const res = await get(`${API}/${pmcid}/fullTextXML`);
  if (!res.ok) return [];
  const xml = await res.text();
  const tables: string[] = [];
  for (const m of xml.matchAll(/<table-wrap\b[\s\S]*?<\/table-wrap>/g)) {
    const t = m[0]
      .replace(/<\/t[dh]>/g, " | ")
      .replace(/<\/tr>/g, "\n")
      .replace(/<label>([\s\S]*?)<\/label>/, "$1: ")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ");
    if (/sensitiv|specific|likelihood|PPV|NPV|\bLR\b|true positive|false positive/i.test(t)) tables.push(t.trim());
  }
  return tables;
}

function cite(h: Hit): string {
  const first = (h.authorString ?? "").split(",")[0];
  return `${first} ${h.pubYear ?? ""}. ${strip(h.title)} *${h.journalTitle ?? ""}*`;
}

function ids(h: Hit): string {
  const parts = [h.pmid && `PMID ${h.pmid}`, h.pmcid, h.doi && `doi:${h.doi}`].filter(Boolean);
  const flags = [h.pmid && known.has(h.pmid) && "**already a source**", h.pmid && logged.has(h.pmid) && "in CURATION.md"].filter(Boolean);
  return [parts.join(" · "), ...flags].join(" · ");
}

const only = process.argv.slice(2);
const targets = Object.keys(TERMS).filter((k) => only.length === 0 || only.includes(k));
mkdirSync(OUT, { recursive: true });
const wanted: { hyp: string; hit: Hit; s: number }[] = [];

for (const hyp of targets) {
  const q = `TITLE_ABS:(${TERMS[hyp]}) AND TITLE_ABS:${ACCURACY} AND TITLE_ABS:${CLINICAL}${hyp.startsWith("multi") ? MULTI_EXTRA : ""} AND NOT PUB_TYPE:"Case Reports"`;
  const hits = (await search(q)).map((h) => ({ h, s: score(h) })).filter((x) => x.s >= 4);
  hits.sort((a, b) => b.s - a.s || Number(b.h.pubYear ?? 0) - Number(a.h.pubYear ?? 0));
  const open = hits.filter((x) => x.h.isOpenAccess === "Y" && x.h.pmcid);
  const closed = hits.filter((x) => !(x.h.isOpenAccess === "Y" && x.h.pmcid));

  const lines = [`# ${hyp}: literature candidates`, "", `Query: \`${q}\``, "", `${hits.length} hits with accuracy figures in the abstract (${open.length} open access).`, ""];
  lines.push("## Open access (tables extracted from full text)", "");
  for (const [i, { h }] of open.entries()) {
    lines.push(`### ${cite(h)}`, ids(h), "");
    for (const sent of numberedSentences(h.abstractText ?? "")) lines.push(`> ${sent}`);
    if (i < FULLTEXT_PER_HYP) {
      const tables = await accuracyTables(h.pmcid!);
      for (const t of tables) lines.push("", "```", t, "```");
      if (tables.length === 0) lines.push("", "_No accuracy table in the full text (figures may be in the text or images)._");
      await sleep(150);
    }
    lines.push("");
  }
  lines.push("## Paywalled (abstract figures only; full text needed for counts)", "");
  for (const { h, s } of closed) {
    lines.push(`### ${cite(h)}`, ids(h), "");
    for (const sent of numberedSentences(h.abstractText ?? "")) lines.push(`> ${sent}`);
    lines.push("");
    if (!(h.pmid && known.has(h.pmid))) wanted.push({ hyp, hit: h, s });
  }
  writeFileSync(`${OUT}/${hyp}.md`, lines.join("\n"));
  console.log(`${hyp.padEnd(13)} ${String(hits.length).padStart(4)} candidates, ${String(open.length).padStart(3)} open access`);
  await sleep(300);
}

wanted.sort((a, b) => b.s - a.s);
const w = ["# Paywalled papers worth fetching", "", "| Hypothesis | Paper | IDs |", "|---|---|---|"];
for (const { hyp, hit } of wanted) w.push(`| ${hyp} | ${cite(hit).replace(/\|/g, "/")} | ${ids(hit)} |`);
writeFileSync(`${OUT}/wanted.md`, w.join("\n"));
console.log(`\nReports in ${OUT}/ (${wanted.length} paywalled candidates in ${OUT}/wanted.md)`);
