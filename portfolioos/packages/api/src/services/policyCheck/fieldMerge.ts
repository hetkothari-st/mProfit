/**
 * Merge per-chunk extractions into one, with provenance and conflict detection.
 *
 * A policy usually arrives as several documents: the wording (generic terms),
 * the schedule (what applies to THIS policy) and endorsements (later
 * amendments). They can disagree. We never silently pick one:
 *
 *  - Document-type precedence: ENDORSEMENT > POLICY_SCHEDULE > POLICY_WORDING >
 *    OTHER. An endorsement amends the policy; the schedule states this policy's
 *    particulars over the wording's generic text.
 *  - A lower-precedence value that differs is recorded as RESOLVED_BY_PRECEDENCE
 *    so the report can say "an endorsement changed this".
 *  - Equal precedence that disagrees (two endorsements, two schedules, or two
 *    places in one document) is UNRESOLVED — we have no document dates to say
 *    which is later, so the highest-confidence value is kept provisionally and
 *    the user is asked to confirm it.
 *  - List fields (exclusions, benefits) are unioned; sub-limit maps are merged
 *    key by key with the same precedence rules.
 *
 * Pure: no I/O.
 */

import type { PolicyConflictSource, PolicyDocClassification, PolicyFieldConflict } from '@everypaisa/shared';
import type { PolicyExtraction } from './extractionSchema.js';

export interface ChunkExtraction {
  docId: string;
  classification: PolicyDocClassification;
  extraction: PolicyExtraction;
}

export const DOC_PRECEDENCE: Record<PolicyDocClassification, number> = {
  ENDORSEMENT: 3,
  POLICY_SCHEDULE: 2,
  POLICY_WORDING: 1,
  OTHER: 0,
};

/** Naming variants across documents are not contradictions. */
const NO_CONFLICT_KEYS = new Set(['insuredName', 'planName', 'continuityCreditNote', 'restorationConditionsText']);
const UNION_KEYS = new Set(['permanentExclusions', 'specificExclusions', 'otherBenefits']);

type AnyField = {
  value: unknown;
  confidence: number;
  sourceDocId: string | null;
  sourcePage: number | null;
  clauseHeading: string | null;
  status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND';
};

function norm(v: unknown): string {
  if (typeof v === 'string') return v.toLowerCase().replace(/[₹,\s]+/g, ' ').trim();
  if (Array.isArray(v)) return JSON.stringify([...v].map(norm).sort());
  if (v && typeof v === 'object') {
    return JSON.stringify(
      Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => [norm(k), norm(x)])
        .sort(),
    );
  }
  return JSON.stringify(v);
}

function show(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

interface Candidate {
  field: AnyField;
  docId: string;
  classification: PolicyDocClassification;
  rank: number;
}

function source(c: Candidate): PolicyConflictSource {
  return {
    value: show(c.field.value),
    docId: c.field.sourceDocId ?? c.docId,
    page: c.field.sourcePage,
    classification: c.classification,
    clauseHeading: c.field.clauseHeading,
  };
}

const byRankThenConfidence = (a: Candidate, b: Candidate) =>
  b.rank - a.rank || (b.field.confidence ?? 0) - (a.field.confidence ?? 0);

function pickScalar(key: string, cands: Candidate[]): { chosen: Candidate; conflicts: PolicyFieldConflict[] } {
  const sorted = [...cands].sort(byRankThenConfidence);
  const top = sorted[0]!;
  if (NO_CONFLICT_KEYS.has(key)) return { chosen: top, conflicts: [] };

  const topValue = norm(top.field.value);
  const conflicts: PolicyFieldConflict[] = [];
  const reported = new Set<string>();

  // Disagreement within the top rank → unresolved.
  const peer = sorted.find((c) => c.rank === top.rank && norm(c.field.value) !== topValue);
  if (peer) {
    conflicts.push({
      field: key,
      status: 'UNRESOLVED',
      chosen: source(top),
      other: source(peer),
      reason:
        'Two documents of the same kind give different values and none of them carries a date we can rely on. ' +
        'The higher-confidence value is shown — please confirm it.',
    });
    reported.add(norm(peer.field.value));
  }

  // Lower-rank values that differ → overridden by precedence.
  for (const c of sorted) {
    const v = norm(c.field.value);
    if (c.rank >= top.rank || v === topValue || reported.has(v)) continue;
    reported.add(v);
    conflicts.push({
      field: key,
      status: 'RESOLVED_BY_PRECEDENCE',
      chosen: source(top),
      other: source(c),
      reason: `A ${top.classification.replace('_', ' ').toLowerCase()} takes precedence over a ${c.classification.replace('_', ' ').toLowerCase()}.`,
    });
  }
  return { chosen: top, conflicts };
}

export function mergeWithProvenance(chunks: ChunkExtraction[]): {
  merged: PolicyExtraction;
  conflicts: PolicyFieldConflict[];
} {
  if (chunks.length === 0) throw new Error('No extractions to merge');

  const merged: Record<string, unknown> = { ...(chunks[0]!.extraction as Record<string, unknown>) };
  const conflicts: PolicyFieldConflict[] = [];
  const keys = new Set<string>();
  for (const c of chunks) for (const k of Object.keys(c.extraction)) keys.add(k);

  for (const key of keys) {
    const cands: Candidate[] = [];
    let fallback: AnyField | undefined;
    for (const c of chunks) {
      const f = (c.extraction as Record<string, AnyField | undefined>)[key];
      if (!f) continue;
      fallback ??= f;
      if (f.status === 'EXTRACTED' && f.value !== null && f.value !== undefined) {
        cands.push({ field: f, docId: c.docId, classification: c.classification, rank: DOC_PRECEDENCE[c.classification] });
      }
    }
    if (cands.length === 0) {
      if (fallback) merged[key] = fallback;
      continue;
    }

    if (UNION_KEYS.has(key)) {
      const sorted = [...cands].sort(byRankThenConfidence);
      const all = Array.from(new Set(sorted.flatMap((c) => (Array.isArray(c.field.value) ? (c.field.value as string[]) : []))));
      merged[key] = { ...sorted[0]!.field, value: all, status: 'EXTRACTED' };
      continue;
    }

    if (key === 'diseaseSubLimits') {
      const sorted = [...cands].sort(byRankThenConfidence);
      const out: Record<string, string> = {};
      const owner = new Map<string, Candidate>();
      // Lowest precedence first so higher ranks overwrite per disease.
      for (const c of [...sorted].reverse()) {
        for (const [disease, limit] of Object.entries((c.field.value ?? {}) as Record<string, string>)) {
          const prev = owner.get(disease);
          if (prev && norm(out[disease]) !== norm(limit)) {
            conflicts.push({
              field: `diseaseSubLimits.${disease}`,
              status: prev.rank === c.rank ? 'UNRESOLVED' : 'RESOLVED_BY_PRECEDENCE',
              chosen: { ...source(c), value: limit },
              other: { ...source(prev), value: out[disease]! },
              reason:
                prev.rank === c.rank
                  ? 'Documents of the same kind give different limits for this condition — please confirm.'
                  : 'The higher-precedence document sets this limit.',
            });
          }
          if (!prev || c.rank >= prev.rank) {
            out[disease] = limit;
            owner.set(disease, c);
          }
        }
      }
      merged[key] = { ...sorted[0]!.field, value: out, status: 'EXTRACTED' };
      continue;
    }

    const { chosen, conflicts: cs } = pickScalar(key, cands);
    merged[key] = chosen.field;
    conflicts.push(...cs);
  }

  return { merged: merged as unknown as PolicyExtraction, conflicts };
}
