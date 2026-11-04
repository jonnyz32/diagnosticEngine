// Network check: every source's DOI must match the DOI that OpenAlex records for its PMID.
// Run with `npm run audit-sources` after adding sources (DOIs typed by hand are error-prone).
import sources from "../evidence/sources.json";

let bad = 0;
for (const s of sources as { id: string; pmid?: string; doi?: string }[]) {
  if (!s.pmid) continue;
  const res = await fetch(`https://api.openalex.org/works/pmid:${s.pmid}`, { headers: { "User-Agent": "evidence-audit" } });
  if (!res.ok) {
    console.warn(`! ${s.id}: OpenAlex returned ${res.status}`);
    continue;
  }
  const work = (await res.json()) as { doi?: string };
  const recorded = (work.doi ?? "").replace("https://doi.org/", "").toLowerCase();
  if (recorded !== (s.doi ?? "").toLowerCase()) {
    bad++;
    console.error(`✗ ${s.id}: file has ${s.doi}, PMID ${s.pmid} has ${recorded}`);
  }
  await new Promise((r) => setTimeout(r, 200));
}
console.log(bad ? `${bad} mismatched DOI(s)` : `✓ all ${sources.length} DOIs match their PMIDs`);
process.exit(bad ? 1 : 0);
