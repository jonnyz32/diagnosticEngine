// Fails the build if any number in evidence/ is not traceable to a PMID/DOI source.
import { scorableHypotheses, unscorableHypotheses } from "../src/engine/bayes";
import { checkIntegrity, rawEvidence } from "../src/engine/db";
import { EvidenceDbSchema } from "../src/engine/schema";

const parsed = EvidenceDbSchema.safeParse(rawEvidence);
if (!parsed.success) {
  for (const issue of parsed.error.issues) console.error(`✗ ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}
const db = parsed.data;
const { errors, warnings } = checkIntegrity(db);
for (const w of warnings) console.warn(`! ${w}`);
for (const e of errors) console.error(`✗ ${e}`);

const entries = db.findings.reduce((n, f) => n + f.evidence.length, 0);
console.log(
  `\n${db.sources.length} sources · ${db.findings.length} findings (${entries} accuracy entries) · ${db.redFlags.length} red flags · ${db.confirmatory.length} confirmatory tests`,
);
console.log(`scorable:   ${scorableHypotheses(db).map((h) => h.id).join(", ")}`);
console.log(`unscorable: ${unscorableHypotheses(db).map((h) => h.id).join(", ")} (no accuracy data)`);
if (errors.length) process.exit(1);
console.log("✓ evidence valid");
