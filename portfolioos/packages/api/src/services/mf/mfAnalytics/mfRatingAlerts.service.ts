/**
 * Monthly "your fund's rating moved" alerts.
 *
 * After the monthly re-rate, every holder of a fund whose form band changed
 * (Leading / Steady / Lagging / Weak — `mfFormBand` in shared) gets one
 * in-app alert per fund. Bands rather than stars: a 4 → 5 move is the same
 * top-third fund and not news, while 3 → 2 changes what a holder should do.
 *
 * Context, as in `loanChecksJob`: the score comparison and the list of holders
 * are read once under runAsSystem (scores are reference data; holders span
 * users), and each user's alerts are written under runAsUser(userId), so RLS
 * scopes every write to that user.
 *
 * Only the scheduled monthly chain calls this. The first-deploy bootstrap
 * rates several past months in a row, and alerting on those would announce
 * months-old moves as news.
 */
import type { Prisma } from '@prisma/client';
import {
  MF_FORM_BAND_LABEL,
  MF_FORM_BAND_MEANING,
  MF_FORM_BAND_ORDER,
  mfFormBand,
  type MfFormBand,
} from '@everypaisa/shared';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { runAsSystem, runAsUser } from '../../../lib/requestContext.js';
import { MF_ASSET_CLASSES } from './mfPortfolioAnalysis.service.js';
import { resolveRankableSchemeCode } from './mfPeerRank.service.js';

export interface MfBandChange {
  /** The rankable (growth) scheme the score belongs to. */
  schemeCode: string;
  from: MfFormBand;
  to: MfFormBand;
  fromRating: number;
  toRating: number;
  asOf: Date;
  previousAsOf: Date;
}

export interface MfRatingAlertResult {
  asOf: string;
  previousAsOf: string | null;
  bandChanges: number;
  usersAlerted: number;
  alertsCreated: number;
  alertsSkippedDuplicate: number;
  usersFailed: number;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** The latest-computed rated score per scheme at one `asOf`. */
async function ratingsAt(asOf: Date): Promise<Map<string, number>> {
  const rows = await prisma.mfSchemeScore.findMany({
    where: { asOf, ratingStatus: 'RATED', rating: { not: null } },
    orderBy: { computedAt: 'desc' },
    select: { schemeCode: true, rating: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.rating !== null && !out.has(r.schemeCode)) out.set(r.schemeCode, r.rating);
  }
  return out;
}

/**
 * Funds whose band differs between `asOf` and the month-end scored before it.
 * A fund rated in only one of the two months is not a change: gaining or
 * losing a rating is explained on the fund page, not announced.
 */
export async function findBandChanges(asOf: Date): Promise<{
  previousAsOf: Date | null;
  changes: MfBandChange[];
}> {
  const prev = await prisma.mfSchemeScore.findFirst({
    where: { asOf: { lt: asOf }, ratingStatus: 'RATED' },
    orderBy: { asOf: 'desc' },
    select: { asOf: true },
  });
  if (prev === null) return { previousAsOf: null, changes: [] };

  const [now, before] = await Promise.all([ratingsAt(asOf), ratingsAt(prev.asOf)]);
  const changes: MfBandChange[] = [];
  for (const [schemeCode, toRating] of now) {
    const fromRating = before.get(schemeCode);
    if (fromRating === undefined) continue;
    const from = mfFormBand(fromRating);
    const to = mfFormBand(toRating);
    if (from === null || to === null || from === to) continue;
    changes.push({ schemeCode, from, to, fromRating, toRating, asOf, previousAsOf: prev.asOf });
  }
  return { previousAsOf: prev.asOf, changes };
}

interface Holding {
  userId: string;
  /** The scheme the user actually holds (may be an IDCW option). */
  heldSchemeCode: string;
  schemeName: string;
  change: MfBandChange;
}

/**
 * Every (user, held scheme) whose rankable scheme changed band. Holdings are
 * read first and filtered in memory, because a relation filter across users
 * would run each table's RLS policy without the system bypass.
 */
async function holdingsOfChangedFunds(changes: MfBandChange[]): Promise<Holding[]> {
  if (changes.length === 0) return [];
  const byRankable = new Map(changes.map((c) => [c.schemeCode, c]));

  const positions = await prisma.holdingProjection.findMany({
    where: { assetClass: { in: [...MF_ASSET_CLASSES] }, fundId: { not: null }, quantity: { gt: 0 } },
    select: { fundId: true, portfolio: { select: { userId: true } } },
  });
  const fundIds = [...new Set(positions.map((p) => p.fundId).filter((id): id is string => id !== null))];
  if (fundIds.length === 0) return [];

  const masters = await prisma.mutualFundMaster.findMany({
    where: { id: { in: fundIds } },
    select: { id: true, schemeCode: true },
  });
  const schemeByFund = new Map(masters.map((m) => [m.id, m.schemeCode]));
  const metas = await prisma.mfSchemeMeta.findMany({
    where: { schemeCode: { in: [...new Set(schemeByFund.values())] } },
    select: { schemeCode: true, schemeName: true, optionType: true, growthSiblingSchemeCode: true },
  });
  const metaByScheme = new Map(metas.map((m) => [m.schemeCode, m]));

  const users = await prisma.user.findMany({
    where: {
      id: { in: [...new Set(positions.map((p) => p.portfolio.userId))] },
      isActive: true,
      deletionScheduledFor: null,
      OR: [{ isShadowClient: false }, { managedById: { not: null } }],
    },
    select: { id: true },
  });
  const eligible = new Set(users.map((u) => u.id));

  const seen = new Set<string>();
  const out: Holding[] = [];
  for (const p of positions) {
    const userId = p.portfolio.userId;
    if (p.fundId === null || !eligible.has(userId)) continue;
    const heldSchemeCode = schemeByFund.get(p.fundId);
    const meta = heldSchemeCode === undefined ? undefined : metaByScheme.get(heldSchemeCode);
    if (heldSchemeCode === undefined || meta === undefined) continue;
    const rankable = resolveRankableSchemeCode(meta);
    const change = rankable === null ? undefined : byRankable.get(rankable);
    if (change === undefined) continue;
    // One alert per user per held scheme, however many portfolios hold it.
    const key = `${userId}|${heldSchemeCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ userId, heldSchemeCode, schemeName: meta.schemeName, change });
  }
  return out;
}

export function ratingAlertText(
  schemeName: string,
  change: Pick<MfBandChange, 'from' | 'to' | 'fromRating' | 'toRating'>,
): { title: string; description: string } {
  const down = MF_FORM_BAND_ORDER.indexOf(change.to) > MF_FORM_BAND_ORDER.indexOf(change.from);
  const verb = down ? 'slipped' : 'improved';
  const stars = (n: number): string => `${n} star${n === 1 ? '' : 's'}`;
  return {
    title: `${schemeName}: ${verb} to ${MF_FORM_BAND_LABEL[change.to]}`,
    description:
      `This month's re-rating moved it from ${MF_FORM_BAND_LABEL[change.from]} ` +
      `(${stars(change.fromRating)}) to ${MF_FORM_BAND_LABEL[change.to]} (${stars(change.toRating)}). ` +
      `${MF_FORM_BAND_MEANING[change.to]} A rating describes past performance against peers; ` +
      `it is not a recommendation to buy or sell.`,
  };
}

export function ratingAlertKey(heldSchemeCode: string, asOf: Date): string {
  return `mf-rating:${heldSchemeCode}:${iso(asOf)}`;
}

async function alertUser(userId: string, items: Holding[], now: Date): Promise<{ created: number; duplicate: number }> {
  let created = 0;
  let duplicate = 0;
  for (const h of items) {
    const key = ratingAlertKey(h.heldSchemeCode, h.change.asOf);
    const existing = await prisma.alert.findFirst({
      where: { userId, type: 'MF_RATING_CHANGE', metadata: { path: ['key'], equals: key } },
      select: { id: true },
    });
    if (existing !== null) {
      duplicate++;
      continue;
    }
    const text = ratingAlertText(h.schemeName, h.change);
    const metadata: Prisma.InputJsonObject = {
      key,
      schemeCode: h.heldSchemeCode,
      ratedSchemeCode: h.change.schemeCode,
      fromBand: h.change.from,
      toBand: h.change.to,
      fromRating: h.change.fromRating,
      toRating: h.change.toRating,
      asOf: iso(h.change.asOf),
      previousAsOf: iso(h.change.previousAsOf),
    };
    await prisma.alert.create({
      data: { userId, type: 'MF_RATING_CHANGE', title: text.title, description: text.description, triggerDate: now, metadata },
    });
    created++;
  }
  return { created, duplicate };
}

/**
 * Alert every holder of a fund whose band changed at `asOf`. Idempotent: the
 * metadata key is per held scheme per month, so a re-run creates nothing new.
 * One user's failure is logged and counted, never allowed to stop the rest.
 */
export async function runMfRatingChangeAlerts(asOf: Date, now: Date = new Date()): Promise<MfRatingAlertResult> {
  const { previousAsOf, changes, holdings } = await runAsSystem(async () => {
    const found = await findBandChanges(asOf);
    return { ...found, holdings: await holdingsOfChangedFunds(found.changes) };
  });

  const byUser = new Map<string, Holding[]>();
  for (const h of holdings) {
    const list = byUser.get(h.userId) ?? [];
    list.push(h);
    byUser.set(h.userId, list);
  }

  const result: MfRatingAlertResult = {
    asOf: iso(asOf),
    previousAsOf: previousAsOf === null ? null : iso(previousAsOf),
    bandChanges: changes.length,
    usersAlerted: 0,
    alertsCreated: 0,
    alertsSkippedDuplicate: 0,
    usersFailed: 0,
  };
  for (const [userId, items] of byUser) {
    try {
      const r = await runAsUser(userId, () => alertUser(userId, items, now));
      result.alertsCreated += r.created;
      result.alertsSkippedDuplicate += r.duplicate;
      if (r.created > 0) result.usersAlerted++;
    } catch (err) {
      result.usersFailed++;
      logger.error({ err, userId, asOf: result.asOf }, '[mf] rating-change alerts failed for user');
    }
  }
  logger.info(result, '[mf] rating-change alerts');
  return result;
}
