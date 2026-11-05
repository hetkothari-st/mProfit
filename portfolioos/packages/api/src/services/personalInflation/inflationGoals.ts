import { Decimal } from 'decimal.js';
import {
  CPI_GENERAL_DIVISION,
  goalRateDivision,
  serializeMoney,
  type InflationGoalImpact,
  type PersonalInflationSummary,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { DEFAULT_GOAL_RETURN, monthlySipFor } from './personalInflationMath.js';

/**
 * What the user's own inflation does to their goals: each active goal's
 * target (stored in today's rupees) grown at the suggested rate versus at
 * official headline CPI, the difference, and the extra monthly SIP that
 * covers it (paid at the start of each month, at the goal's expected return or
 * 12%). "Re-plan" writes the suggested rate onto the chosen goals.
 */

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const DIVISION_WORD: Record<string, string> = { '10': 'education', '07': 'transport' };

interface Suggestion {
  rate: Decimal;
  label: string;
}

/** Same order as the Goal dialog hint: category rate (yours, then official), else personal, else headline. */
export function suggestRateForGoal(summary: PersonalInflationSummary, category: string): Suggestion | null {
  const pick = (rate: string | null | undefined, label: string): Suggestion | null =>
    rate == null ? null : { rate: new Decimal(rate).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN), label };
  const division = goalRateDivision(category);
  if (division) {
    const word = DIVISION_WORD[division] ?? 'category';
    return (
      pick(summary.byDivision.find((d) => d.divisionCode === division)?.rate, `your ${word} inflation`) ??
      pick(summary.official.find((o) => o.divisionCode === division)?.longRunRate, `official ${word} inflation`)
    );
  }
  return (
    pick(summary.personalRate, 'your personal inflation') ??
    pick(summary.official.find((o) => o.divisionCode === CPI_GENERAL_DIVISION)?.longRunRate, 'official CPI inflation')
  );
}

export async function listGoalImpacts(
  userId: string,
  summary: PersonalInflationSummary,
  now: Date = new Date(),
): Promise<InflationGoalImpact[]> {
  const goals = await prisma.goal.findMany({
    where: { userId, status: 'ACTIVE', targetDate: { gt: now } },
    select: {
      id: true, name: true, category: true, targetAmount: true, inflationRate: true,
      expectedReturn: true, targetDate: true,
    },
    orderBy: { targetDate: 'asc' },
  });

  const headline = summary.official.find((o) => o.divisionCode === CPI_GENERAL_DIVISION)?.longRunRate ?? null;
  const official = headline ? new Decimal(headline).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN) : null;

  return goals.map((g) => {
    const target = new Decimal(g.targetAmount.toString());
    const years = (g.targetDate.getTime() - now.getTime()) / YEAR_MS;
    const grow = (r: Decimal) => target.times(new Decimal(1).plus(r).pow(years));
    const suggestion = suggestRateForGoal(summary, g.category);
    const current = g.inflationRate ? new Decimal(g.inflationRate.toString()) : null;

    const atSuggested = suggestion ? grow(suggestion.rate) : null;
    const atOfficial = official ? grow(official) : null;
    const gap = atSuggested && atOfficial ? atSuggested.minus(atOfficial) : null;
    const ownReturn = g.expectedReturn ? new Decimal(g.expectedReturn.toString()) : null;
    const assumed = ownReturn ?? DEFAULT_GOAL_RETURN;
    const sip = gap && gap.greaterThan(0) ? monthlySipFor(gap, years, assumed) : null;

    return {
      goalId: g.id,
      name: g.name,
      category: g.category,
      targetDate: g.targetDate.toISOString().slice(0, 10),
      yearsRemaining: Math.round(years * 10) / 10,
      targetToday: serializeMoney(target),
      currentRate: current ? current.toFixed(4) : null,
      suggestedRate: suggestion ? suggestion.rate.toFixed(4) : null,
      suggestedLabel: suggestion?.label ?? null,
      officialRate: official ? official.toFixed(4) : null,
      neededAtSuggested: atSuggested ? serializeMoney(atSuggested) : null,
      neededAtOfficial: atOfficial ? serializeMoney(atOfficial) : null,
      gap: gap ? serializeMoney(gap) : null,
      extraMonthlySip: sip ? serializeMoney(sip) : null,
      assumedReturn: assumed.toFixed(4),
      returnIsDefault: ownReturn === null,
      rateInUse: !!(current && suggestion && current.equals(suggestion.rate)),
    };
  });
}

/**
 * Set each chosen goal's inflation rate to the rate suggested for it now.
 * Rates are recomputed here rather than taken from the client, and goals the
 * user does not own (or that are not active) are left alone. Returns the
 * number of goals changed.
 */
export async function applySuggestedGoalRates(
  userId: string,
  summary: PersonalInflationSummary,
  goalIds: readonly string[],
): Promise<number> {
  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: [...goalIds] }, status: 'ACTIVE' },
    select: { id: true, category: true },
  });
  let changed = 0;
  for (const g of goals) {
    const s = suggestRateForGoal(summary, g.category);
    if (!s) continue;
    const res = await prisma.goal.updateMany({
      where: { id: g.id, userId },
      data: { inflationRate: s.rate.toFixed(4) },
    });
    changed += res.count;
  }
  return changed;
}
