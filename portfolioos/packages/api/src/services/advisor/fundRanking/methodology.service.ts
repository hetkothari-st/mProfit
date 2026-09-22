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
 * Sign a methodology version. EXPLICIT ONLY — nothing calls this implicitly.
 *
 * It used to run at the head of the nightly scoring job, which coupled two
 * unrelated things: computing scores, and a human taking responsibility for
 * the method that produced them. The practical cost was that an unlicensed
 * deployment could not compute a single snapshot without also signing —
 * so production could not even look at what it would recommend.
 *
 * They are separate now. Scoring runs under the latest version whether it is
 * signed or not; only ADVICE requires a signature, and that is checked when
 * the advice is read, not when the numbers are computed.
 *
 * Throws when `RIA_PRINCIPAL_OFFICER` is unset. A signature needs a name: a
 * regulator asking who approved this will not accept "the repository", and
 * signing with a placeholder would make the audit trail a fiction. Refusing
 * is the safe half of that failure.
 *
 * Idempotent per version: a version already signed is left exactly as it was,
 * because re-stamping rewrites who approved advice that has already gone out.
 */
export async function signMethodology(opts: { version?: number } = {}): Promise<{
  signed: boolean;
  version: number | null;
  signedOffBy: string | null;
}> {
  const officer = env.RIA_PRINCIPAL_OFFICER?.trim();
  if (!officer) {
    throw new Error(
      'Refusing to sign a ranking methodology: RIA_PRINCIPAL_OFFICER is not set. ' +
        'A signature records who approved the method; it cannot be anonymous.',
    );
  }

  const target = await prisma.rankingMethodologyVersion.findFirst({
    where: {
      signedOffAt: null,
      ...(opts.version === undefined ? {} : { version: opts.version }),
    },
    orderBy: { version: 'desc' },
  });
  if (!target) {
    logger.info('[fundRanking] nothing to sign — no unsigned methodology version');
    return { signed: false, version: null, signedOffBy: null };
  }

  await prisma.rankingMethodologyVersion.update({
    where: { id: target.id },
    data: { signedOffBy: officer, signedOffAt: new Date() },
  });
  logger.info(
    { version: target.version, signedOffBy: officer },
    '[fundRanking] methodology signed off',
  );
  return { signed: true, version: target.version, signedOffBy: officer };
}

/**
 * The newest methodology version, signed or not.
 *
 * This is what SCORING runs under. Computing a snapshot is a measurement, and
 * a measurement does not need a signature — it needs the newest agreed
 * method. Whether anyone may be ADVISED from that snapshot is a separate
 * question, answered by `currentMethodology()` at read time.
 */
export async function latestMethodology(): Promise<{
  id: string;
  version: number;
  config: MethodologyConfig;
  signed: boolean;
} | null> {
  const row = await prisma.rankingMethodologyVersion.findFirst({
    orderBy: { version: 'desc' },
  });
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    config: row.config as unknown as MethodologyConfig,
    signed: Boolean(row.signedOffAt && row.signedOffBy),
  };
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
