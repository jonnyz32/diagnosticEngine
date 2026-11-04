import type { EvidenceDb } from "../engine/schema";

export function sourceUrl(db: EvidenceDb, sourceId: string): string | null {
  const s = db.sources.find((x) => x.id === sourceId);
  if (!s) return null;
  if (s.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`;
  return s.doi ? `https://doi.org/${s.doi}` : (s.thesis?.url ?? null);
}

export function isThesis(db: EvidenceDb, sourceId: string): boolean {
  return !!db.sources.find((x) => x.id === sourceId)?.thesis;
}

export function shortCitation(db: EvidenceDb, sourceId: string): string {
  const s = db.sources.find((x) => x.id === sourceId);
  if (!s) return sourceId;
  // "van der Windt DA, ..." -> "van der Windt"; year is the publication year before ";" ("2011;36(1)").
  const author = s.citation.match(/^(.+?) [A-Z]{1,3}[,.]/)?.[1] ?? s.citation.split(/[ ,]/)[0];
  const year = s.citation.match(/\b((?:19|20)\d{2});/)?.[1] ?? "";
  return `${author} ${year}`;
}

export function SourceLink({ db, sourceId, locator }: { db: EvidenceDb; sourceId: string; locator?: string }) {
  const url = sourceUrl(db, sourceId);
  return (
    <>
      <a className="cite" href={url ?? undefined} target="_blank" rel="noreferrer" title={locator}>
        [{shortCitation(db, sourceId)}
        {locator ? `, ${locator}` : ""}]
      </a>
      {isThesis(db, sourceId) && (
        <span className="badge warn small" title="A doctoral thesis: not peer-reviewed">
          thesis
        </span>
      )}
    </>
  );
}
