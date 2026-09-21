/**
 * The signed-off methodology, and the rule that nothing unsigned advises.
 *
 * A methodology version is the firm's answer to "why these weights?". It is
 * versioned rather than edited so a recommendation made in March stays
 * explainable after the weights change in June, and it carries a human's name
 * because a regulator asking who approved it will not accept "the repository".
 *
 * Not user-scoped: firm-level reference data, no RLS (see CONTEXT.md §5).
 */

import { prisma } from '../../../lib/prisma.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import type { MethodologyConfig } from './types.js';

export interface SignedMethodology {
  id: string;
  version: number;
  config: MethodologyConfig;
  signedOffBy: string;
  signedOffAt: Date;
}

/**
 * Stamp the seeded methodology with the configured principal officer.
 *
 * The migration seeds v1 unsigned on purpose — SQL cannot read the env var,
 * and writing a signatory the deployment never named would make the audit
 * trail a fiction. This runs at job start and signs the highest unsigned
 * version, but only when named-fund advice is actually switched on.
 *
 * Idempotent: a version already signed is left exactly as it was, because
 * re-stamping would rewrite who approved advice that has already gone out.
 */
export async function ensureSignedMethodology(): Promise<void> {
  if (env.RIA_VERDICTS_ENABLED !== 'true') return;
  const officer = env.RIA_PRINCIPAL_OFFICER?.trim();
  if (!officer) {
    // env.ts makes this fatal at boot; if we somehow get here, refusing to
    // sign is the safe half of the failure.
    logger.warn(
      '[fundRanking] RIA_VERDICTS_ENABLED is on but RIA_PRINCIPAL_OFFICER is empty — methodology stays unsigned, advice stays category-level',
    );
    return;
  }

  const unsigned = await prisma.rankingMethodologyVersion.findFirst({
    where: { signedOffAt: null },
    orderBy: { version: 'desc' },
  });
  if (!unsigned) return;

  await prisma.rankingMethodologyVersion.update({
    where: { id: unsigned.id },
    data: { signedOffBy: officer, signedOffAt: new Date() },
  });
  logger.info(
    { version: unsigned.version, signedOffBy: officer },
    '[fundRanking] methodology signed off',
  );
}

/** The newest signed methodology, or null when none is signed. Null is a
 *  working state, not an error: the engine falls back to category-level
 *  advice and records why. */
export async function currentMethodology(): Promise<SignedMethodology | null> {
  const row = await prisma.rankingMethodologyVersion.findFirst({
    where: { signedOffAt: { not: null }, signedOffBy: { not: null } },
    orderBy: { version: 'desc' },
  });
  if (!row?.signedOffAt || !row.signedOffBy) return null;
  return {
    id: row.id,
    version: row.version,
    config: row.config as unknown as MethodologyConfig,
    signedOffBy: row.signedOffBy,
    signedOffAt: row.signedOffAt,
  };
}

/** The most recent scoring date under a methodology, or null if never run. */
export async function latestSnapshotDate(methodologyVersionId: string): Promise<Date | null> {
  const row = await prisma.fundScoreSnapshot.findFirst({
    where: { methodologyVersionId },
    orderBy: { asOfDate: 'desc' },
    select: { asOfDate: true },
  });
  return row?.asOfDate ?? null;
}

/**
 * Whether a snapshot is fresh enough to advise from.
 *
 * Stale scores are worse than none: they name a fund on NAV history that no
 * longer includes the last week of a falling market, while looking exactly as
 * confident as fresh ones.
 */
export function snapshotIsFresh(
  asOfDate: Date | null,
  config: MethodologyConfig,
  now: Date,
): boolean {
  if (!asOfDate) return false;
  const ageDays = Math.floor((now.getTime() - asOfDate.getTime()) / 86_400_000);
  return ageDays <= config.snapshotMaxAgeDays;
}
