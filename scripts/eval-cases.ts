// Scores the engine against published case reports (cases/cases.json).
// Dev cases are listed one by one; holdout cases are only ever reported in aggregate.
// `npm run eval-cases -- --log` also appends the summary to cases/RESULTS.md.
// `--dev-only` skips holdout entirely: use it while trying changes, so the holdout is checked
// only once a change is final. `--budget N` simulates interviews with a different question limit.
import { appendFileSync, readFileSync } from "node:fs";
import { z } from "zod";
import { loadEvidence } from "../src/engine/db";
import { CaseSchema, checkCases, evaluateCase, splitOf, summarise, type Summary } from "../src/engine/evaluate";

const db = loadEvidence();
const cases = z.array(CaseSchema).parse(JSON.parse(readFileSync("cases/cases.json", "utf8")));
const errors = checkCases(db, cases);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}

const devOnly = process.argv.includes("--dev-only");
const budgetArg = process.argv.indexOf("--budget");
const budget = budgetArg > 0 ? Number(process.argv[budgetArg + 1]) : undefined;
const dev = cases.filter((c) => splitOf(c.pmid) === "dev");
const holdout = devOnly ? [] : cases.filter((c) => splitOf(c.pmid) === "holdout");
const devResults = dev.map((c) => evaluateCase(db, c, budget));
const holdoutResults = holdout.map((c) => evaluateCase(db, c, budget));

const fmt = (r?: number) => (r === undefined ? "-" : String(r));
const pct = (p?: number) => (p === undefined ? "-" : `${Math.round(p * 100)}%`);
console.log("DEV CASES");
console.log("case        diagnosis               conf  territory  rank(all) p(all)  rank(interview) asked  logic-rank  combined");
for (const r of devResults) {
  console.log(
    [
      r.id.padEnd(11),
      r.diagnosis.padEnd(23),
      (r.confirmation === "reference" ? "ref" : "clin").padEnd(5),
      (r.inTerritory ? "in" : "OUT").padEnd(10),
      (r.scorable ? fmt(r.rankAll) : "unscored").padEnd(9),
      pct(r.pAll).padEnd(7),
      fmt(r.rankInterview).padEnd(15),
      String(r.questionsAsked).padEnd(6),
      fmt(r.logicRank).padEnd(10),
      fmt(r.combinedRank),
    ].join(" "),
  );
}

const line = (name: string, s: Summary) =>
  `${name}: ${s.cases} cases · out of territory ${s.outOfTerritory} · scored ${s.scorable} · ` +
  `top-1 ${s.top1All}/${s.scorable} · top-3 ${s.top3All}/${s.scorable} · ` +
  `interview top-3 ${s.top3Interview}/${s.scorable} · mean p ${pct(s.meanPAll)} · "other" ahead ${s.otherAhead} · ` +
  `logical-fit top-3 ${s.logicTop3}/${s.inTerritory} · combined top-1 ${s.combinedTop1}/${s.inTerritory}, top-3 ${s.combinedTop3}/${s.inTerritory}`;
const devSummary = line("dev", summarise(db, dev, devResults));
const asked = devResults.map((r) => r.questionsAsked);
console.log(`\n${devSummary}\ndev interview length: mean ${(asked.reduce((a, b) => a + b, 0) / asked.length).toFixed(1)}, max ${Math.max(...asked)} questions`);
if (devOnly) process.exit(0);
const holdoutSummary = line("holdout", summarise(db, holdout, holdoutResults));
console.log(holdoutSummary);

if (process.argv.includes("--log")) {
  const date = new Date().toISOString().slice(0, 10);
  appendFileSync("cases/RESULTS.md", `| ${date} | ${devSummary} | ${holdoutSummary} |\n`);
  console.log("logged to cases/RESULTS.md");
}
