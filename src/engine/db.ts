import sources from "../../evidence/sources.json";
import hypotheses from "../../evidence/hypotheses.json";
import findings from "../../evidence/findings.json";
import redFlags from "../../evidence/redflags.json";
import confirmatory from "../../evidence/confirmatory.json";
import stress from "../../evidence/stress.json";
import { ownEvidence, studiesDisagree, toSensSpec } from "./bayes";
import { EvidenceDbSchema, type EvidenceDb } from "./schema";

export const rawEvidence = { sources, hypotheses, findings, redFlags, confirmatory, stress };

/** Referential checks the zod schema can't express. Returns errors and warnings. */
export function checkIntegrity(db: EvidenceDb): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceIds = new Set(db.sources.map((s) => s.id));
  const hypIds = new Set(db.hypotheses.map((h) => h.id));
  const used = new Set<string>();
  const ref = (where: string, id: string) => {
    used.add(id);
    if (!sourceIds.has(id)) errors.push(`${where}: unknown sourceId "${id}"`);
  };
  const hyp = (where: string, id: string) => {
    if (!hypIds.has(id)) errors.push(`${where}: unknown hypothesis "${id}"`);
  };

  for (const [kind, items] of [
    ["source", db.sources],
    ["hypothesis", db.hypotheses],
    ["finding", db.findings],
    ["redFlag", db.redFlags],
    ["confirmatory", db.confirmatory],
    ["stress", db.stress],
  ] as const) {
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) errors.push(`duplicate ${kind} id "${it.id}"`);
      seen.add(it.id);
    }
  }

  for (const h of db.hypotheses) {
    if (h.prior) ref(`hypothesis ${h.id} prior`, h.prior.sourceId);
    h.context.forEach((c, i) => ref(`hypothesis ${h.id} context[${i}]`, c.sourceId));
    if (h.criteria) ref(`hypothesis ${h.id} criteria`, h.criteria.sourceId);
    if (h.mechanism) ref(`hypothesis ${h.id} mechanism`, h.mechanism.sourceId);
    if (h.sensoryOnly) ref(`hypothesis ${h.id} sensoryOnly`, h.sensoryOnly.sourceId);
    for (const c of h.contextFlags) {
      ref(`hypothesis ${h.id} contextFlag`, c.sourceId);
      if (!db.findings.some((f) => f.id === c.finding)) errors.push(`hypothesis ${h.id} contextFlag: unknown finding "${c.finding}"`);
    }
    for (const item of h.criteria?.items ?? []) if (item.sourceId) ref(`hypothesis ${h.id} criteria item ${item.id}`, item.sourceId);
    const findingIds = new Set(db.findings.map((f) => f.id));
    for (const item of h.criteria?.items ?? []) {
      if (item.linkedFinding && !findingIds.has(item.linkedFinding)) {
        errors.push(`hypothesis ${h.id} criteria item ${item.id}: unknown linkedFinding "${item.linkedFinding}"`);
      }
    }
    const logicSeen = new Set<string>();
    for (const l of h.logic) {
      const where = `hypothesis ${h.id} logic ${l.finding}`;
      if (l.sourceId) ref(where, l.sourceId);
      const f = db.findings.find((x) => x.id === l.finding);
      if (!f) errors.push(`${where}: unknown finding`);
      else if (f.evidence.some((e) => e.hypothesis === h.id)) errors.push(`${where}: direction already comes from accuracy data`);
      if (h.criteria?.items.some((i) => i.linkedFinding === l.finding)) errors.push(`${where}: already linked to a criteria item`);
      if (logicSeen.has(l.finding)) errors.push(`${where}: listed twice`);
      logicSeen.add(l.finding);
    }
  }
  const citedPriorSum = db.hypotheses.reduce((s, h) => s + (h.prior?.value ?? 0), 0);
  if (citedPriorSum >= 1) errors.push(`cited priors sum to ${citedPriorSum}; must be < 1`);

  const groups = new Map<string, number>();
  for (const f of db.findings) {
    // Several studies per hypothesis are pooled; the same study twice would double-count it.
    const targets = new Set<string>();
    f.evidence.forEach((e, i) => {
      const where = `finding ${f.id} evidence[${i}]`;
      ref(where, e.sourceId);
      if (db.sources.find((s) => s.id === e.sourceId)?.thesis) warnings.push(`${where}: from a thesis (not peer-reviewed); low certainty`);
      if (e.specFrom) {
        ref(`${where} specFrom`, e.specFrom.sourceId);
        warnings.push(`${where}: cross-study entry (comparison rate borrowed from ${e.specFrom.sourceId}); low certainty`);
      }
      hyp(where, e.hypothesis);
      const key = `${e.hypothesis} ${e.sourceId}`;
      if (targets.has(key)) errors.push(`${where}: ${e.sourceId} already has an entry for hypothesis "${e.hypothesis}"`);
      targets.add(key);
      const { sens, spec } = toSensSpec(e);
      if (!(sens >= 0 && sens <= 1 && spec >= 0 && spec <= 1)) errors.push(`${where}: derived sens/spec out of [0,1]`);
      if (e.performedBy === "clinician" && !e.adapted) errors.push(`${where}: clinician-performed evidence on a patient finding must be marked adapted`);
      if (!e.sensCI || !e.specCI) warnings.push(`${where}: CI not reported; uncertainty not propagated`);
    });
    for (const h of new Set(f.evidence.map((e) => e.hypothesis))) {
      const own = ownEvidence(f, h);
      if (own.length > 1 && studiesDisagree(own)) warnings.push(`finding ${f.id}: pooled studies for "${h}" have non-overlapping CIs`);
    }
    if (f.dependenceGroup) groups.set(f.dependenceGroup, (groups.get(f.dependenceGroup) ?? 0) + 1);
    if (f.followUp) hyp(`finding ${f.id} followUp`, f.followUp.hypothesis);
    if (f.askIf && !db.findings.some((g) => g.id === f.askIf!.finding)) errors.push(`finding ${f.id} askIf: unknown finding "${f.askIf.finding}"`);
    for (const r of f.impliedBy) {
      if (r.finding === f.id) errors.push(`finding ${f.id} impliedBy: refers to itself`);
      else if (!db.findings.some((g) => g.id === r.finding)) errors.push(`finding ${f.id} impliedBy: unknown finding "${r.finding}"`);
    }
    if (new Set(f.impliedBy.map((r) => r.implies)).size > 1) {
      warnings.push(`finding ${f.id} impliedBy: rules imply both yes and no; check they can't fire together`);
    }
    const isCheck = db.hypotheses.some(
      (h) =>
        h.logic.some((l) => l.finding === f.id && l.type !== "unexplained") ||
        (h.criteria?.items ?? []).some((i) => i.linkedFinding === f.id),
    );
    if (!f.evidence.length && !(f.followUp || f.alwaysAsk || f.askIf || f.kind === "profile" || isCheck)) {
      errors.push(`finding ${f.id}: information-only, so it must be a followUp, askIf, alwaysAsk or profile question, or a linked check`);
    }
    if (!f.summary) warnings.push(`finding ${f.id}: no summary phrases; the evidence summary will show the raw question`);
  }
  for (const [g, n] of groups) if (n < 2) warnings.push(`dependenceGroup "${g}" has only one finding`);

  for (const r of db.redFlags) ref(`redFlag ${r.id}`, r.sourceId);
  for (const c of db.confirmatory) {
    ref(`confirmatory ${c.id} recommendation`, c.recommendation.sourceId);
    c.hypotheses.forEach((h) => hyp(`confirmatory ${c.id}`, h));
    c.accuracy.forEach((a, i) => ref(`confirmatory ${c.id} accuracy[${i}]`, a.sourceId));
  }
  const linked = new Set<string>();
  for (const t of db.stress) {
    t.clues.forEach((c, i) => {
      const where = `stress ${t.id} clue[${i}]`;
      if (c.sourceId) ref(where, c.sourceId);
      for (const id of c.anyOf) if (!db.findings.some((f) => f.id === id)) errors.push(`${where}: unknown finding "${id}"`);
    });
    for (const c of t.conditions) {
      hyp(`stress ${t.id} condition`, c.hypothesis);
      if (c.sourceId) ref(`stress ${t.id} condition ${c.hypothesis}`, c.sourceId);
      linked.add(c.hypothesis);
    }
  }
  if (db.stress.length) {
    for (const h of db.hypotheses) if (!linked.has(h.id)) warnings.push(`hypothesis ${h.id}: not linked to any stress type`);
  }

  for (const s of db.sources) if (!used.has(s.id)) warnings.push(`source "${s.id}" is never referenced`);
  return { errors, warnings };
}

export function loadEvidence(): EvidenceDb {
  const db = EvidenceDbSchema.parse(rawEvidence);
  const { errors } = checkIntegrity(db);
  if (errors.length) throw new Error(`Evidence database invalid:\n${errors.join("\n")}`);
  return db;
}
