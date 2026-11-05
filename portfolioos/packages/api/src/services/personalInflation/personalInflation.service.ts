import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import {
  CPI_ALL_INDIA_STATE_CODE,
  CPI_DIVISIONS,
  CPI_LONG_RUN_YEARS,
  isCpiDivisionCode,
  CPI_GENERAL_DIVISION,
  serializeMoney,
  type CpiSector,
  type InflationItemInput,
  type InflationItemView,
  type OfficialDivisionRate,
  type PersonalInflationSummary,
  type PirBankView,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import {
  annualise,
  longRunRate,
  projectAmount,
  isOutsideBasket,
  resolveItemRate,
  weightedRate,
} from './personalInflationMath.js';
import { loadBankBasis, type LoadedBankBasis } from './pirBankData.js';
import { getSpendingConsent } from './spendingConsent.js';

export const PROJECTION_HORIZONS = [1, 3, 5, 10] as const;

/** Fewest yearly readings a state needs before its own long-run rate is used. */
const MIN_STATE_YEARS = 3;

const rate6 = (d: Decimal) => d.toFixed(6, Decimal.ROUND_HALF_EVEN);
const dec = (v: { toString(): string }) => new Decimal(v.toString());
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Official rates
// ---------------------------------------------------------------------------

export interface OfficialRates {
  asOf: { year: number; month: number } | null;
  divisions: OfficialDivisionRate[];
  /** divisionCode → long-run rate, for resolveItemRate. */
  longRun: Map<string, Decimal>;
}

/**
 * Official rates for a state and sector, anchored on the newest month MoSPI
 * has published for All India. For each division the long-run rate compounds
 * the same month's YoY reading across up to CPI_LONG_RUN_YEARS years, taking
 * the base-2024 reading where it exists and the mapped base-2012 one before.
 * A state without the anchor-month reading for a division falls back to
 * All India for that division, and says so.
 */
export async function getOfficialRates(stateCode: number, sector: CpiSector): Promise<OfficialRates> {
  const anchor = await prisma.cpiObservation.findFirst({
    where: { baseYear: 2024, stateCode: CPI_ALL_INDIA_STATE_CODE },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  });
  if (!anchor) {
    return {
      asOf: null,
      longRun: new Map(),
      divisions: CPI_DIVISIONS.map((d) => ({
        divisionCode: d.code, latestYoy: null, longRunRate: null, yearsUsed: 0, source: 'ALL_INDIA' as const,
      })),
    };
  }

  const years = Array.from({ length: CPI_LONG_RUN_YEARS }, (_, i) => anchor.year - i);
  const rows = await prisma.cpiObservation.findMany({
    where: {
      stateCode: { in: [...new Set([stateCode, CPI_ALL_INDIA_STATE_CODE])] },
      sector,
      month: anchor.month,
      year: { in: years },
    },
    select: { baseYear: true, stateCode: true, divisionCode: true, year: true, inflationPct: true },
  });

  const lookup = new Map<string, Decimal>();
  for (const r of rows) lookup.set(`${r.stateCode}|${r.divisionCode}|${r.year}|${r.baseYear}`, dec(r.inflationPct));

  const seriesFor = (sc: number, div: string): Decimal[] =>
    years
      .map((y) => lookup.get(`${sc}|${div}|${y}|2024`) ?? lookup.get(`${sc}|${div}|${y}|2012`))
      .filter((v): v is Decimal => v !== undefined);

  const longRun = new Map<string, Decimal>();
  const divisions: OfficialDivisionRate[] = CPI_DIVISIONS.map((d) => {
    const stateHasAnchor = lookup.has(`${stateCode}|${d.code}|${anchor.year}|2024`);
    // A state with too short a history (Ladakh has no old-series years) would
    // turn one noisy reading into a 10-year projection; All India is steadier.
    const statePoints = stateHasAnchor ? seriesFor(stateCode, d.code) : [];
    const indiaPoints = seriesFor(CPI_ALL_INDIA_STATE_CODE, d.code);
    const useState =
      stateHasAnchor && (statePoints.length >= MIN_STATE_YEARS || statePoints.length >= indiaPoints.length);
    const sc = useState ? stateCode : CPI_ALL_INDIA_STATE_CODE;
    const points = useState ? statePoints : indiaPoints;
    const latest = lookup.get(`${sc}|${d.code}|${anchor.year}|2024`) ?? null;
    const lr = longRunRate(points);
    if (lr) longRun.set(d.code, lr);
    return {
      divisionCode: d.code,
      latestYoy: latest ? rate6(latest.dividedBy(100)) : null,
      longRunRate: lr ? rate6(lr) : null,
      yearsUsed: points.length,
      source: useState && stateCode !== CPI_ALL_INDIA_STATE_CODE ? 'STATE' : 'ALL_INDIA',
    };
  });

  return { asOf: anchor, divisions, longRun };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const itemInclude = { pricePoints: { orderBy: { asOf: 'asc' } } } satisfies Prisma.InflationBasketItemInclude;

export async function getProfile(userId: string): Promise<{ stateCode: number; sector: CpiSector }> {
  const p = await prisma.inflationProfile.findUnique({ where: { userId } });
  return { stateCode: p?.stateCode ?? CPI_ALL_INDIA_STATE_CODE, sector: p?.sector ?? 'COMBINED' };
}

export async function getSummary(userId: string, now: Date = new Date()): Promise<PersonalInflationSummary> {
  const profile = await getProfile(userId);
  const [official, items] = await Promise.all([
    getOfficialRates(profile.stateCode, profile.sector),
    prisma.inflationBasketItem.findMany({ where: { userId }, include: itemInclude, orderBy: { createdAt: 'asc' } }),
  ]);
  const spendingConsent = await getSpendingConsent(userId);
  // Bank spending is read only with the user's consent.
  const bank = spendingConsent.given ? await loadBankBasis(userId, official.longRun, now) : null;
  // Decision 6: the bank picture replaces the rate only once it is confident
  // enough; until then the user's own entries keep giving the rate they had.
  const useBank = bank?.ready === true;

  const views: InflationItemView[] = [];
  const rated: { divisionCode: string; annualAmount: Decimal; rate: Decimal | null }[] = [];
  let outsideAmount = new Decimal(0);
  let outsideCount = 0;
  for (const it of items) {
    const amount = dec(it.amount);
    const annualAmount = annualise(amount, it.frequency);
    const customRate = it.customRate ? dec(it.customRate) : null;
    const resolved = resolveItemRate(
      {
        divisionCode: it.divisionCode,
        rateMode: it.rateMode,
        customRate,
        pricePoints: it.pricePoints.map((p) => ({ asOf: p.asOf, amount: dec(p.amount) })),
      },
      official.longRun,
    );
    const inBasket = !isOutsideBasket({ sourceRef: it.sourceRef, rateMode: it.rateMode, customRate });
    // Decision 1: a recurring bank payment that matches this item already
    // counts it; the item stays as typed and comes back with countAnyway.
    const coveredByBank = useBank && inBasket && it.matchedSeriesId !== null && !it.countAnyway;
    if (inBasket && !coveredByBank) {
      rated.push({ divisionCode: it.divisionCode, annualAmount, rate: resolved.rate });
    } else if (!inBasket) {
      outsideAmount = outsideAmount.plus(annualAmount);
      outsideCount += 1;
    }
    views.push({
      id: it.id,
      name: it.name,
      divisionCode: it.divisionCode,
      amount: serializeMoney(amount),
      frequency: it.frequency,
      annualAmount: serializeMoney(annualAmount),
      rateMode: it.rateMode,
      customRate: customRate ? rate6(customRate) : null,
      notes: it.notes,
      pricePoints: it.pricePoints.map((p) => ({ asOf: isoDay(p.asOf), amount: serializeMoney(dec(p.amount)) })),
      sourceRef: it.sourceRef,
      isFixed: it.isFixed,
      inBasket,
      coveredByBank,
      countAnyway: it.countAnyway,
      resolvedRate: resolved.rate ? rate6(resolved.rate) : null,
      rateSource: resolved.source,
      rateNote: resolved.note,
      historyRate: resolved.history ? rate6(resolved.history.rate) : null,
      historyYears: resolved.history ? resolved.history.years.toFixed(1) : null,
      projections: PROJECTION_HORIZONS.map((h) =>
        resolved.rate ? serializeMoney(projectAmount(annualAmount, resolved.rate, h)) : null,
      ),
    });
  }

  const manualBasketCount = rated.length;
  if (useBank) {
    for (const c of bank.categories) rated.push({ divisionCode: c.divisionCode, annualAmount: c.annualAmount, rate: c.rate });
  }

  // Totals, shares and the rate cover the basket only: EMIs and life premiums
  // are listed but are not consumption that rises with prices.
  const totalAnnual = rated.reduce((s, r) => s.plus(r.annualAmount), new Decimal(0));
  // Unrated items (no CPI loaded yet) stay flat in the totals rather than vanish.
  const totalProjections = PROJECTION_HORIZONS.map((h) =>
    serializeMoney(rated.reduce((s, r) => s.plus(r.rate ? projectAmount(r.annualAmount, r.rate, h) : r.annualAmount), new Decimal(0))),
  );

  const divisionCodes = [...new Set(rated.map((r) => r.divisionCode))];
  const byDivision = divisionCodes.map((code) => {
    const group = rated.filter((r) => r.divisionCode === code);
    const amt = group.reduce((s, r) => s.plus(r.annualAmount), new Decimal(0));
    const wr = weightedRate(group);
    return {
      divisionCode: code,
      annualAmount: serializeMoney(amt),
      share: totalAnnual.isZero() ? '0.000000' : rate6(amt.dividedBy(totalAnnual)),
      rate: wr ? rate6(wr) : null,
    };
  });

  const fixedPayments = outsideCount === 0 ? null : { annualAmount: serializeMoney(outsideAmount), count: outsideCount };

  const personal = weightedRate(rated);
  return {
    profile,
    asOf: official.asOf ? `${official.asOf.year}-${String(official.asOf.month).padStart(2, '0')}` : null,
    official: official.divisions,
    items: views,
    personalRate: personal ? rate6(personal) : null,
    horizons: [...PROJECTION_HORIZONS],
    totals: { annualAmount: serializeMoney(totalAnnual), projections: totalProjections },
    byDivision,
    fixedPayments,
    rateBasis: useBank ? 'bank' : 'manual',
    bank: bank ? bankView(bank, manualBasketCount > 0) : null,
    spendingConsent,
  };
}

function bankView(b: LoadedBankBasis, hasManualRate: boolean): PirBankView {
  const total = b.categories.reduce((s, c) => s.plus(c.annualAmount), new Decimal(0));
  return {
    state: b.ready ? 'ready' : hasManualRate ? 'low_confidence' : 'building',
    confidence: b.confidence.toFixed(4, Decimal.ROUND_HALF_EVEN),
    minConfidence: new Decimal(b.params.minConfidence).toFixed(4),
    monthsOfHistory: b.monthsOfHistory,
    windowMonths: b.params.windowMonths,
    categorisedShare: b.categorisedShare.toFixed(4, Decimal.ROUND_HALF_EVEN),
    accountCoverage: b.accountCoverage.toFixed(4, Decimal.ROUND_HALF_EVEN),
    cardBillsCounted: b.cardBillsCounted,
    cashHeavy: b.cashHeavy,
    categories: b.categories.map((c) => ({
      category: c.category,
      divisionCode: c.divisionCode,
      annualAmount: serializeMoney(c.annualAmount),
      share: total.isZero() ? '0.000000' : rate6(c.annualAmount.dividedBy(total)),
      cpiRate: c.cpiRate ? rate6(c.cpiRate) : null,
      ownRate: c.ownRate ? rate6(c.ownRate) : null,
      alpha: rate6(c.alpha),
      rate: c.rate ? rate6(c.rate) : null,
      method: c.method,
      projections: PROJECTION_HORIZONS.map((h) => (c.rate ? serializeMoney(projectAmount(c.annualAmount, c.rate, h)) : null)),
    })),
    stepChanges: b.stepChanges.map((s) => ({ seriesId: s.seriesId, payeeKey: s.payeeKey, category: s.category, rate: rate6(s.rate) })),
    bankRate: b.rate ? rate6(b.rate) : null,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function updateProfile(userId: string, input: { stateCode: number; sector: CpiSector }): Promise<void> {
  await prisma.inflationProfile.upsert({
    where: { userId },
    create: { userId, stateCode: input.stateCode, sector: input.sector },
    update: { stateCode: input.stateCode, sector: input.sector },
  });
}

function assertItemDivision(code: string): void {
  if (code === CPI_GENERAL_DIVISION || !isCpiDivisionCode(code)) {
    throw new BadRequestError(`Unknown spending category ${code}`);
  }
}

function assertDistinctDates(points: readonly { asOf: string }[]): void {
  if (new Set(points.map((p) => p.asOf)).size !== points.length) {
    throw new BadRequestError('Two price entries share the same date');
  }
}

export async function createItem(userId: string, input: InflationItemInput): Promise<string> {
  assertItemDivision(input.divisionCode);
  const points = input.pricePoints ?? [];
  assertDistinctDates(points);
  const item = await runInTransaction(async (tx) => {
    const created = await tx.inflationBasketItem.create({
      data: {
        userId,
        name: input.name,
        divisionCode: input.divisionCode,
        amount: input.amount,
        frequency: input.frequency ?? 'YEARLY',
        rateMode: input.rateMode ?? 'OFFICIAL',
        customRate: input.customRate ?? null,
        notes: input.notes ?? null,
        isFixed: input.isFixed ?? false,
        countAnyway: input.countAnyway ?? false,
      },
    });
    if (points.length > 0) {
      await tx.inflationPricePoint.createMany({
        data: points.map((p) => ({ userId, itemId: created.id, asOf: new Date(p.asOf), amount: p.amount })),
      });
    }
    return created;
  });
  return item.id;
}

export async function updateItem(userId: string, id: string, input: Partial<InflationItemInput>): Promise<void> {
  const existing = await prisma.inflationBasketItem.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) throw new NotFoundError('Item not found');
  if (input.divisionCode !== undefined) assertItemDivision(input.divisionCode);
  if (input.pricePoints) assertDistinctDates(input.pricePoints);

  await runInTransaction(async (tx) => {
    await tx.inflationBasketItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.divisionCode !== undefined && { divisionCode: input.divisionCode }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.frequency !== undefined && { frequency: input.frequency }),
        ...(input.rateMode !== undefined && { rateMode: input.rateMode }),
        ...(input.customRate !== undefined && { customRate: input.customRate }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.isFixed !== undefined && { isFixed: input.isFixed }),
        ...(input.countAnyway !== undefined && { countAnyway: input.countAnyway }),
      },
    });
    // Price history is replaced wholesale — the client edits it as one list.
    if (input.pricePoints) {
      await tx.inflationPricePoint.deleteMany({ where: { itemId: id, userId } });
      if (input.pricePoints.length > 0) {
        await tx.inflationPricePoint.createMany({
          data: input.pricePoints.map((p) => ({ userId, itemId: id, asOf: new Date(p.asOf), amount: p.amount })),
        });
      }
    }
  });
}

export async function deleteItem(userId: string, id: string): Promise<void> {
  const res = await prisma.inflationBasketItem.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new NotFoundError('Item not found');
}
