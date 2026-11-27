import { Decimal } from '@everypaisa/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { quantityHeldBefore, recomputeForAsset } from '../holdings/holdingsProjection.js';
import { findDuplicateTransaction } from '../imports/duplicateMatch.js';

/**
 * Turn stored CorporateAction rows into idempotent Transaction rows so the
 * weighted-average replay in holdingsProjection picks them up (SPLIT/BONUS are
 * already handled there). Idempotency: a deterministic sourceHash per
 * (corporateAction, holding) prevents the same split/bonus being applied twice
 * on re-runs.
 *
 * SPLIT    — ratio = new shares per old share (1:2 split → ratio 2). Post-split
 *            delta qty = qty × (ratio − 1); cost basis unchanged.
 * BONUS    — ratio = bonus shares per held share. Delta qty = qty × ratio at
 *            zero cost.
 * DIVIDEND — amount = cash per share. Booked as a DIVIDEND_PAYOUT inflow of
 *            amount × qtyHeld; does not change quantity or cost.
 *
 * MERGER / DEMERGER / RIGHTS / BUYBACK are intentionally NOT auto-applied:
 *   - RIGHTS / BUYBACK require a user election (subscribe / tender) — we cannot
 *     assume the user participated.
 *   - MERGER / DEMERGER need the *target* instrument + swap ratio, which the
 *     NSE feed does not reliably provide. Fabricating these would corrupt
 *     holdings, the exact failure §1 exists to prevent.
 * They should surface as action items for the user instead.
 *
 * Returns the number of corporate-action transactions created.
 */
/**
 * The sourceHash above is keyed on the CorporateAction row's id, so the same
 * split ingested twice from the feed carries two ids and passes that check.
 * This asks the stronger question: is this exact effect already on the books?
 */
async function alreadyApplied(data: Prisma.TransactionUncheckedCreateInput): Promise<boolean> {
  const twin = await findDuplicateTransaction({
    portfolioId: data.portfolioId,
    assetKey: data.assetKey!,
    transactionType: data.transactionType,
    tradeDate: data.tradeDate as Date,
    quantity: String(data.quantity),
    price: String(data.price),
  });
  return twin !== null;
}

/**
 * How far back the nightly job books dividends. The NSE feed reaches about two
 * years back; dividends older than this are left for the user to review
 * (POST /corporate-actions/apply books them on request) rather than written
 * into every portfolio in one unattended run.
 */
export const NIGHTLY_DIVIDEND_LOOKBACK_DAYS = 45;

/**
 * A dividend or split the user already has from another source (CAS, bank or
 * AA feed, a hand-entered row) is rarely dated on the ex-date: dividends land
 * on the pay date, weeks later. Exact-match dedupe misses those, so anything of
 * the same kind this close to the ex-date counts as already on the books.
 */
const NEARBY_DIVIDEND_DAYS = 45;
const NEARBY_SPLIT_BONUS_DAYS = 30;
const DAY_MS = 86_400_000;

async function bookedNearby(
  portfolioId: string,
  assetKey: string,
  types: Array<'DIVIDEND_PAYOUT' | 'DIVIDEND_REINVEST' | 'SPLIT' | 'BONUS'>,
  exDate: Date,
  days: number,
): Promise<boolean> {
  const hit = await prisma.transaction.findFirst({
    where: {
      portfolioId,
      assetKey,
      transactionType: { in: types },
      tradeDate: { gte: new Date(exDate.getTime() - days * DAY_MS), lte: new Date(exDate.getTime() + days * DAY_MS) },
      OR: [{ sourceAdapter: null }, { sourceAdapter: { not: 'CORPORATE_ACTION' } }],
    },
    select: { id: true },
  });
  return hit !== null;
}

/** Rows from the BSE fallback, whose format and symbol matching are unverified, are stored but never auto-applied. */
function fromUnverifiedSource(details: unknown): boolean {
  return (details as { source?: unknown } | null)?.source === 'bse';
}

export interface ApplyCorporateActionsOptions {
  now?: Date;
  /** Book only dividends with an ex-date within this many days of `now`. Null/undefined: no limit. */
  dividendLookbackDays?: number | null;
}

export async function applyCorporateActionsForPortfolio(
  portfolioId: string,
  opts: ApplyCorporateActionsOptions = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const dividendFloor =
    opts.dividendLookbackDays == null ? null : new Date(now.getTime() - opts.dividendLookbackDays * DAY_MS);
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId, stockId: { not: null } },
  });

  let applied = 0;
  const touchedAssetKeys = new Set<string>();

  for (const h of holdings) {
    const actions = await prisma.corporateAction.findMany({
      where: { stockId: h.stockId!, exDate: { lte: now } },
      orderBy: { exDate: 'asc' },
    });

    for (const ca of actions) {
      if (fromUnverifiedSource(ca.details)) continue;
      if (ca.type === 'DIVIDEND' && dividendFloor && ca.exDate < dividendFloor) continue;
      const sourceHash = `ca:${ca.id}:${h.id}`;
      const exists = await prisma.transaction.findFirst({ where: { sourceHash } });
      if (exists) continue;

      // Units held going into the ex-date, including earlier splits/bonuses
      // booked in this loop — not today's quantity.
      const txsForHolding = await prisma.transaction.findMany({
        where: { portfolioId: h.portfolioId, assetKey: h.assetKey },
        orderBy: { tradeDate: 'asc' },
      });
      // A split and a bonus on the same ex-date (NSE files both on one day)
      // compound: the second applies to the units the first already created.
      // Those rows are dated on the ex-date itself, so "held before" alone
      // missed them and 3 shares through a 1:2 split + 4:1 bonus became 18,
      // not 30 (launch review B3). Order between the two does not matter.
      const sameDayActionUnits = txsForHolding
        .filter(
          (t) =>
            t.sourceAdapter === 'CORPORATE_ACTION' &&
            (t.transactionType === 'SPLIT' || t.transactionType === 'BONUS') &&
            t.tradeDate.getTime() === ca.exDate.getTime(),
        )
        .reduce((sum, t) => sum.plus(new Decimal(t.quantity.toString())), new Decimal(0));
      const qty = quantityHeldBefore(txsForHolding, ca.exDate).plus(sameDayActionUnits);
      if (qty.lessThanOrEqualTo(0)) continue;
      const ratio = ca.ratio ? new Decimal(ca.ratio.toString()) : null;
      const amount = ca.amount ? new Decimal(ca.amount.toString()) : null;

      // ── Cash dividend: a DIVIDEND_PAYOUT inflow, no quantity/cost change ──
      if (ca.type === 'DIVIDEND') {
        if (!amount || amount.lessThanOrEqualTo(0)) continue;
        if (await bookedNearby(h.portfolioId, h.assetKey, ['DIVIDEND_PAYOUT', 'DIVIDEND_REINVEST'], ca.exDate, NEARBY_DIVIDEND_DAYS)) continue;
        const cash = amount.times(qty);
        const data: Prisma.TransactionUncheckedCreateInput = {
          portfolioId: h.portfolioId,
          assetClass: h.assetClass,
          transactionType: 'DIVIDEND_PAYOUT',
          stockId: h.stockId,
          assetName: h.assetName,
          isin: h.isin,
          assetKey: h.assetKey,
          tradeDate: ca.exDate,
          quantity: qty.toString(), // shares the dividend was paid on
          price: amount.toString(), // per-share cash
          grossAmount: cash.toString(),
          netAmount: cash.toString(),
          sourceAdapter: 'CORPORATE_ACTION',
          sourceHash,
        };
        if (await alreadyApplied(data)) continue;
        await prisma.transaction.create({ data });
        applied += 1; // no qty change → no projection replay needed
        continue;
      }

      // ── Quantity events: split / bonus ──
      let deltaQty: Decimal | null = null;
      let type: 'SPLIT' | 'BONUS' | null = null;

      if (ca.type === 'SPLIT' && ratio && ratio.greaterThan(0)) {
        deltaQty = qty.times(ratio.minus(1));
        type = 'SPLIT';
      } else if (ca.type === 'BONUS' && ratio && ratio.greaterThan(0)) {
        deltaQty = qty.times(ratio);
        type = 'BONUS';
      }
      // MERGER / DEMERGER / RIGHTS / BUYBACK → not auto-applied (see header).

      if (!type || !deltaQty || deltaQty.lessThanOrEqualTo(0)) continue;
      if (await bookedNearby(h.portfolioId, h.assetKey, [type], ca.exDate, NEARBY_SPLIT_BONUS_DAYS)) continue;

      const data: Prisma.TransactionUncheckedCreateInput = {
        portfolioId: h.portfolioId,
        assetClass: h.assetClass,
        transactionType: type,
        stockId: h.stockId,
        assetName: h.assetName,
        isin: h.isin,
        assetKey: h.assetKey,
        tradeDate: ca.exDate,
        quantity: deltaQty.toString(),
        price: '0',
        grossAmount: '0',
        netAmount: '0',
        sourceAdapter: 'CORPORATE_ACTION',
        sourceHash,
      };
      if (await alreadyApplied(data)) continue;
      await prisma.transaction.create({ data });
      touchedAssetKeys.add(h.assetKey);
      applied += 1;
    }
  }

  // Replay each affected holding once so the new SPLIT/BONUS rows fold into
  // quantity + avg cost.
  for (const assetKey of touchedAssetKeys) {
    await recomputeForAsset(portfolioId, assetKey);
  }

  return applied;
}

/** Apply across every portfolio owned by a user (the /corporate-actions/apply endpoint). */
export async function applyCorporateActionsForUser(userId: string, opts: ApplyCorporateActionsOptions = {}): Promise<number> {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    select: { id: true },
  });
  let applied = 0;
  for (const p of portfolios) applied += await applyCorporateActionsForPortfolio(p.id, opts);
  return applied;
}
