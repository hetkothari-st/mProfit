import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { applyCorporateActionsForPortfolio, NIGHTLY_DIVIDEND_LOOKBACK_DAYS } from './corporateActionApply.service.js';

/**
 * Admin entry of a split or bonus the feeds missed (or before they carried
 * it). Stored exactly like a feed row, so the apply step, the corporate-action
 * report and re-runs of the feed all treat it the same. Ratios follow the feed
 * convention the apply step reads:
 *
 *   SPLIT  ratio = old face value ÷ new face value   (₹2 → ₹1 is 2: each share becomes 2)
 *   BONUS  ratio = new shares ÷ shares held          (4:1 is 4: four free per share held)
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const positive = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Enter a number')
  .refine((v) => new Decimal(v).greaterThan(0), 'Must be more than 0');

export const manualCorporateActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SPLIT'),
    stock: z.string().trim().min(1, 'Enter the NSE symbol or ISIN'),
    exDate: isoDate,
    fromFaceValue: positive,
    toFaceValue: positive,
    applyNow: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('BONUS'),
    stock: z.string().trim().min(1, 'Enter the NSE symbol or ISIN'),
    exDate: isoDate,
    bonusShares: positive,
    heldShares: positive,
    applyNow: z.boolean().default(true),
  }),
]);
export type ManualCorporateActionInput = z.input<typeof manualCorporateActionSchema>;

export interface ManualCorporateActionResult {
  corporateActionId: string;
  symbol: string;
  type: 'SPLIT' | 'BONUS';
  exDate: string;
  ratio: string;
  /** False when an identical row was already stored (feed or earlier entry). */
  created: boolean;
  /** Portfolios holding the stock that the action was applied to. */
  portfoliosApplied: number;
  /** Split/bonus transactions booked by the apply step. */
  transactionsBooked: number;
}

export function ratioOf(input: z.output<typeof manualCorporateActionSchema>): Decimal {
  if (input.type === 'SPLIT') {
    const r = new Decimal(input.fromFaceValue).dividedBy(input.toFaceValue);
    if (r.lessThanOrEqualTo(1)) throw new BadRequestError('A split lowers the face value: the new face value must be below the old one.');
    return r;
  }
  return new Decimal(input.bonusShares).dividedBy(input.heldShares);
}

export async function addManualCorporateAction(
  adminUserId: string,
  raw: unknown,
): Promise<ManualCorporateActionResult> {
  const input = manualCorporateActionSchema.parse(raw);
  const ratio = ratioOf(input);
  const exDate = new Date(`${input.exDate}T00:00:00Z`);
  const key = input.stock.toUpperCase();

  // The catalogue and every user's holdings: system context, as the nightly job runs.
  return runAsSystem(async () => {
    const stock =
      (await prisma.stockMaster.findUnique({ where: { symbol: key } })) ??
      (await prisma.stockMaster.findUnique({ where: { isin: key } }));
    if (!stock) throw new NotFoundError(`No stock with NSE symbol or ISIN "${input.stock}"`);

    const existing = await prisma.corporateAction.findFirst({ where: { stockId: stock.id, type: input.type, exDate } });
    let id: string;
    let created = false;
    if (existing) {
      if (existing.ratio !== null && !new Decimal(existing.ratio.toString()).equals(ratio)) {
        throw new ConflictError(
          `A ${input.type.toLowerCase()} on ${input.exDate} is already stored for ${stock.symbol} with ratio ${existing.ratio.toString()}. ` +
            'Correct that row instead of adding a second one.',
        );
      }
      if (existing.ratio === null) {
        await prisma.corporateAction.update({ where: { id: existing.id }, data: { ratio: ratio.toString() } });
      }
      id = existing.id;
    } else {
      const row = await prisma.corporateAction.create({
        data: {
          stockId: stock.id,
          type: input.type,
          exDate,
          ratio: ratio.toString(),
          details: {
            source: 'manual',
            enteredBy: adminUserId,
            subject:
              input.type === 'SPLIT'
                ? `Face value split from ${input.fromFaceValue} to ${input.toFaceValue} (entered by hand)`
                : `Bonus ${input.bonusShares}:${input.heldShares} (entered by hand)`,
          },
        },
      });
      id = row.id;
      created = true;
    }

    let portfoliosApplied = 0;
    let transactionsBooked = 0;
    if (input.applyNow) {
      const holders = await prisma.holdingProjection.findMany({
        where: { stockId: stock.id },
        select: { portfolioId: true },
        distinct: ['portfolioId'],
      });
      for (const h of holders) {
        // Same limits as the nightly run: this sweeps every holder's whole portfolio.
        transactionsBooked += await applyCorporateActionsForPortfolio(h.portfolioId, { dividendLookbackDays: NIGHTLY_DIVIDEND_LOOKBACK_DAYS });
        portfoliosApplied += 1;
      }
    }

    return {
      corporateActionId: id,
      symbol: stock.symbol,
      type: input.type,
      exDate: input.exDate,
      ratio: ratio.toString(),
      created,
      portfoliosApplied,
      transactionsBooked,
    };
  });
}

/** Recent hand-entered actions, newest first, for the admin page. */
export async function listManualCorporateActions(limit = 50) {
  return runAsSystem(async () => {
    const rows = await prisma.corporateAction.findMany({
      where: { details: { path: ['source'], equals: 'manual' } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { stock: { select: { symbol: true, name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      symbol: r.stock?.symbol ?? null,
      name: r.stock?.name ?? null,
      type: r.type,
      exDate: r.exDate.toISOString().slice(0, 10),
      ratio: r.ratio?.toString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
