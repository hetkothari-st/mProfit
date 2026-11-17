/**
 * Insurer intelligence service.
 *
 * Reads InsurerMetrics reference data (IRDAI Annual Report) for a named
 * insurer. CSR ≠ ICR — both are returned with per-metric explanations so
 * the user is never shown a bare number without context.
 *
 * Missing data → "unavailable" (never zero). Never represent an insurer
 * stat as an individual claim probability.
 */

import { prisma } from '../../lib/prisma.js';
import type { InsurerMetricsDTO, Money } from '@everypaisa/shared';

export interface InsurerIntelligence {
  found: true;
  metrics: InsurerMetricsDTO;
  explanations: {
    claimSettlementRatio: string;
    incurredClaimRatio: string;
  };
}

export interface InsurerIntelligenceMissing {
  found: false;
  insurerName: string;
  reason: string;
}

export type InsurerIntelligenceResult = InsurerIntelligence | InsurerIntelligenceMissing;

const CSR_EXPLANATION =
  'Claim Settlement Ratio (CSR) is the percentage of claims settled out of total claims received in a year. ' +
  'A higher CSR indicates more claims are being settled. ' +
  'This is NOT the probability that YOUR individual claim will be settled — ' +
  'it is a fleet-level statistic that reflects the insurer\'s general claims handling.';

const ICR_EXPLANATION =
  'Incurred Claim Ratio (ICR) is the ratio of claims paid to net premiums earned, expressed as a percentage. ' +
  'A very high ICR (>100%) can indicate financial stress; a very low ICR (<60%) may indicate under-claim or over-pricing. ' +
  'ICR is NOT the same as CSR — it measures the insurer\'s loss ratio, not how often claims are settled.';

type InsurerRow = {
  id: string;
  insurerName: string;
  financialYear: string;
  claimSettlementRatio: string | null;
  incurredClaimRatio: string | null;
  claimsTotal: number | null;
  claimsSettled: number | null;
  claimsPending: number | null;
  segment: string;
  claimsPaidInr: string | null;
  claimSettlementRatioByAmount: string | null;
  claimsRepudiated: number | null;
  claimsIncurredInr: string | null;
  netEarnedPremiumInr: string | null;
  claimsScope: string | null;
  methodology: string | null;
  complaints: unknown;
  source: string;
  retrievedAt: Date;
};

const GENERIC_WORDS = new Set([
  'insurance', 'general', 'health', 'allied', 'and', 'co', 'ltd', 'limited', 'company', 'pvt', 'private', 'the', 'of',
]);

/** Distinguishing words of an insurer name ("HDFC Ergo General Insurance" → hdfc, ergo). */
export function insurerCoreTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0 && !GENERIC_WORDS.has(t)),
  );
}

/**
 * Pick the row for the named insurer, or null. A match needs every
 * distinguishing word of one name to appear in the other, so "HDFC Life" never
 * resolves to "HDFC Ergo". If the name is ambiguous (matches more than one
 * distinct insurer) we return null rather than guess.
 */
export function matchInsurerRow<T extends { insurerName: string }>(
  rows: T[],
  userInsurerName: string,
): T | null {
  // Pass 1 keeps "general"/"health" so "Reliance General" ≠ "Reliance Health";
  // pass 2 drops them so "HDFC Ergo Health Insurance" still finds "HDFC ERGO General".
  for (const keepSegment of [true, false]) {
    const tok = (n: string) => {
      const t = insurerCoreTokens(n.replace(/life insurance corporation( of india)?/i, 'LIC'));
      if (keepSegment) {
        const words = n.toLowerCase().split(/[^a-z]+/);
        for (const w of ['general', 'health']) if (words.includes(w)) t.add(w);
      }
      return t;
    };
    const want = tok(userInsurerName);
    if (want.size === 0) return null;
    const hits = rows.filter((r) => {
      const have = tok(r.insurerName);
      if (have.size === 0) return false;
      const [small, big] = want.size <= have.size ? [want, have] : [have, want];
      return [...small].every((t) => big.has(t));
    });
    const distinct = new Set(hits.map((h) => h.insurerName));
    if (distinct.size === 1) return hits[0]!;
    if (distinct.size > 1 && keepSegment) continue;
    if (distinct.size > 1) return null;
  }
  return null;
}

/** Latest-financial-year row per insurer, for one segment ('HEALTH' or 'LIFE'). */
export async function loadLatestInsurerRows(segment: 'HEALTH' | 'LIFE' = 'HEALTH'): Promise<InsurerRow[]> {
  return prisma.$queryRawUnsafe<InsurerRow[]>(
    `SELECT DISTINCT ON ("insurerName")
            id, "insurerName", "financialYear", segment, "claimSettlementRatio"::text,
            "claimSettlementRatioByAmount"::text, "claimsPaidInr"::text,
            "incurredClaimRatio"::text, "claimsTotal", "claimsSettled",
            "claimsPending", "claimsRepudiated", "claimsIncurredInr"::text,
            "netEarnedPremiumInr"::text, "claimsScope", methodology,
            complaints, source, "retrievedAt"
       FROM "InsurerMetrics"
      WHERE segment = $1
      ORDER BY "insurerName", "financialYear" DESC`,
    segment,
  );
}

/**
 * Retrieve insurer intelligence by name (latest financial year).
 *
 * Returns "unavailable" if no unambiguous match exists — never zero or null.
 */
export async function getInsurerIntelligence(
  insurerName: string,
  segment: 'HEALTH' | 'LIFE' = 'HEALTH',
): Promise<InsurerIntelligenceResult> {
  if (!insurerName || insurerName.trim().length === 0) {
    return { found: false, insurerName: '', reason: 'No insurer name provided' };
  }

  const normalised = insurerName.trim();
  const rows = await loadLatestInsurerRows(segment);

  const row = matchInsurerRow(rows, normalised);
  if (!row) {
    return {
      found: false,
      insurerName: normalised,
      reason: `No IRDAI data found for "${normalised}". Data is available for major health insurers only.`,
    };
  }

  return {
    found: true,
    metrics: {
      id: row.id,
      insurerName: row.insurerName,
      financialYear: row.financialYear,
      claimSettlementRatio: row.claimSettlementRatio ?? null,
      incurredClaimRatio: row.incurredClaimRatio ?? null,
      claimsTotal: row.claimsTotal,
      claimsSettled: row.claimsSettled,
      claimsPending: row.claimsPending,
      segment: row.segment === 'LIFE' ? 'LIFE' : 'HEALTH',
      claimsPaidInr: row.claimsPaidInr as Money | null,
      claimSettlementRatioByAmount: row.claimSettlementRatioByAmount,
      claimsRepudiated: row.claimsRepudiated,
      claimsIncurredInr: row.claimsIncurredInr as Money | null,
      netEarnedPremiumInr: row.netEarnedPremiumInr as Money | null,
      claimsScope: row.claimsScope === 'HEALTH_ONLY' || row.claimsScope === 'ALL_LINES' ? row.claimsScope : null,
      methodology: row.methodology,
      complaints: (row.complaints as Record<string, unknown> | null) ?? null,
      source: row.source,
      retrievedAt: row.retrievedAt.toISOString(),
    },
    explanations: {
      claimSettlementRatio: CSR_EXPLANATION,
      incurredClaimRatio: ICR_EXPLANATION,
    },
  };
}
