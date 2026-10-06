import { Decimal } from 'decimal.js';
import { computeUserCapitalGains } from './capitalGains.service.js';
import { computeCapitalGainsTax, slabRateForUser } from './taxComputation.js';
import {
  advanceTaxSchedule,
  INSTALMENTS,
  type AdvanceTaxSchedule,
} from './advanceTaxMath.js';

/**
 * "If I do nothing, what will I owe, and when?" — the question this app could
 * answer from data it already holds and didn't.
 *
 * Tax is computed four times over, once per instalment date, each pass seeing
 * only the gains booked by that date. That is what makes the sec 234C proviso
 * fall out naturally: a gain booked in December raises the December and March
 * instalments and leaves June and September alone.
 *
 * Scope, stated plainly to the reader as well: this covers investment income
 * this app can see — capital gains, intraday, crypto. Salary, TDS already
 * deducted, other income and deductions are not here, so the figure is a
 * floor, not a tax return.
 */

export interface AdvanceTaxReport extends AdvanceTaxSchedule {
  financialYear: string;
  slabPct: number;
  slabIsEstimate: boolean;
  /**
   * Gains booked this year before exemptions. Zero tax and zero gains are
   * different situations — long-term gains inside the ₹1.25L exemption produce
   * no tax at all, and telling that reader "no gains booked" contradicts every
   * other card on the page.
   */
  bookedGains: string;
  /** Tax by bucket on everything booked so far, for the "where it comes from" line. */
  components: {
    stcgEquity: string;
    ltcgEquity: string;
    ltcgOther: string;
    stcgOther: string;
    intraday: string;
    crypto: string;
  };
  asOf: string;
}

function fyStartYear(fy: string): number {
  // "2026-27" → 2026
  const start = Number.parseInt(fy.slice(0, 4), 10);
  if (!Number.isFinite(start)) throw new Error(`Invalid financial year: ${fy}`);
  return start;
}

function instalmentDate(fy: string, index: number): Date {
  const meta = INSTALMENTS[index]!;
  const year = meta.month === 2 ? fyStartYear(fy) + 1 : fyStartYear(fy);
  // End of the due date, so a sale ON the 15th counts towards that instalment.
  return new Date(Date.UTC(year, meta.month, meta.day, 23, 59, 59, 999));
}

export async function advanceTaxReport(
  userId: string,
  fy: string,
  portfolioIds?: string[],
  asOf: Date = new Date(),
): Promise<AdvanceTaxReport> {
  const [{ rows: allRows }, slab] = await Promise.all([
    computeUserCapitalGains(userId),
    slabRateForUser(userId),
  ]);
  const rows = portfolioIds?.length
    ? allRows.filter((r) => portfolioIds.includes(r.portfolioId))
    : allRows;

  // One pass per instalment, each seeing only what had been sold by then.
  const taxAsAt = INSTALMENTS.map((_, i) => {
    const cutoff = instalmentDate(fy, i);
    const visible = rows.filter((r) => r.sellDate.getTime() <= cutoff.getTime());
    return computeCapitalGainsTax(visible, fy, slab).totalTax;
  }) as [Decimal, Decimal, Decimal, Decimal];

  const full = computeCapitalGainsTax(rows, fy, slab);

  const schedule = advanceTaxSchedule({
    fyStartYear: fyStartYear(fy),
    taxAsAt,
    asOf,
  });

  const bookedGains = full.s111A.gain
    .plus(full.s112A.gain)
    .plus(full.s112.rawGain)
    .plus(full.stcgOther.gain)
    .plus(full.intraday.gain)
    .plus(full.vda.gain);

  return {
    ...schedule,
    financialYear: fy,
    bookedGains: bookedGains.toFixed(2),
    slabPct: slab.slabPct,
    slabIsEstimate: slab.isEstimate,
    components: {
      stcgEquity: full.s111A.tax.toFixed(2),
      ltcgEquity: full.s112A.tax.toFixed(2),
      ltcgOther: full.s112.tax.toFixed(2),
      stcgOther: full.stcgOther.tax.toFixed(2),
      intraday: full.intraday.tax.toFixed(2),
      crypto: full.vda.tax.toFixed(2),
    },
    asOf: asOf.toISOString().slice(0, 10),
  };
}
