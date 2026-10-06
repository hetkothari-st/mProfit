/**
 * Surrendering a life policy: what the insurer's quoted surrender value is
 * worth against the premiums paid, when it can be paid out, and IRDAI's rules
 * on it — each paraphrased with the page it comes from (checked on
 * SURRENDER_RULES_CHECKED_ON). The value itself is whatever the insurer
 * quotes; we never estimate it.
 */
import { Decimal } from '../decimal.js';
import type { OfficialSource } from './claimsGuide.js';
import { addMonthsIso } from './premiumSchedule.js';

export const SURRENDER_RULES_CHECKED_ON = '2026-09-11';

/** Policies that acquire a surrender value (not pure protection). */
export const SURRENDER_POLICY_TYPES = ['WHOLE_LIFE', 'ENDOWMENT', 'ULIP'] as const;

export const ULIP_LOCK_IN_YEARS = 5;

const PPI_2024 = (where: string): OfficialSource => ({
  label: "IRDAI Master Circular on Protection of Policyholders' Interests, 2024",
  url: 'https://irdai.gov.in/document-detail?documentId=5625747',
  where,
});

const LIFE_PRODUCTS_2024 = (where: string): OfficialSource => ({
  label: 'IRDAI Master Circular on Life Insurance Products, 2024',
  url:
    'https://irdai.gov.in/documents/37343/365525/%e0%a4%9c%e0%a5%80%e0%a4%b5%e0%a4%a8+%e0%a4%ac%e0%a5%80%e0%a4%ae%e0%a4%be+' +
    '%e0%a4%89%e0%a4%a4%e0%a5%8d%e0%a4%aa%e0%a4%be%e0%a4%a6%e0%a5%8b%e0%a4%82+%e0%a4%aa%e0%a4%b0+%e0%a4%ae%e0%a4%be%e0%a4%b8' +
    '%e0%a5%8d%e0%a4%9f%e0%a4%b0+%e0%a4%aa%e0%a4%b0%e0%a4%bf%e0%a4%aa%e0%a4%a4%e0%a5%8d%e0%a4%b0+_+Master+Circular+on+Life+' +
    'Insurance+Products.pdf/d7ca89f3-b894-8c93-3e53-d8caf67a8ba6?version=1.2&t=1718344498270&download=true',
  where,
});

export interface SurrenderRule {
  text: string;
  source: OfficialSource;
}

export const SURRENDER_RULES: { general: SurrenderRule[]; nonLinked: SurrenderRule[]; ulip: SurrenderRule[] } = {
  general: [
    {
      text: 'The insurer must pay a surrender within 7 days of receiving your request.',
      source: PPI_2024('page 15'),
    },
    {
      text: 'If it pays late, it owes you interest at the bank rate plus 2% from the day it got the request — without you having to ask.',
      source: PPI_2024('page 15'),
    },
    {
      text: 'Surrendering ends the policy and its cover, and usually costs a surrender charge. IRDAI advises keeping a policy in force if you can.',
      source: PPI_2024('page 16'),
    },
  ],
  nonLinked: [
    {
      text: 'Savings policies that aren’t unit-linked acquire a surrender value. Pure protection plans don’t.',
      source: PPI_2024('page 16'),
    },
    {
      text: 'You’re paid the higher of the guaranteed surrender value (GSV) and the special surrender value (SSV).',
      source: PPI_2024('page 16'),
    },
    {
      text:
        'The SSV is payable once the first policy year is over and a full year’s premium is paid. On a single-premium policy, ' +
        'or one with premiums payable for fewer than 5 years, it’s payable as soon as that first full premium is in.',
      source: LIFE_PRODUCTS_2024('page 14, para 26.4.2'),
    },
    {
      text:
        'The SSV must be at least the present value of the paid-up sum assured, paid-up future benefits and benefits already ' +
        'earned, discounted at no more than the 10-year G-Sec yield plus 0.5%. Insurers review it every year.',
      source: LIFE_PRODUCTS_2024('page 14, paras 26.4.1–26.4.4'),
    },
    {
      text: 'Insurers may pay more than the minimum GSV set by the regulations.',
      source: LIFE_PRODUCTS_2024('page 14, para 26.2'),
    },
    {
      text: 'Every non-linked savings policy with a surrender value must offer a loan against it — worth asking about before you surrender.',
      source: LIFE_PRODUCTS_2024('page 15, para 27'),
    },
  ],
  ulip: [
    {
      text: 'A ULIP pays its fund value less the surrender charge, and has a five-year lock-in.',
      source: PPI_2024('page 16'),
    },
    {
      text:
        'Surrender during the lock-in, and the fund value less a capped discontinuance charge moves to a discontinued policy ' +
        'fund, the life cover stops, and the money is paid when the lock-in ends.',
      source: LIFE_PRODUCTS_2024('pages 24–25, paras 40.1.1–40.1.3'),
    },
    {
      text: 'The discontinued policy fund earns at least 4% a year.',
      source: LIFE_PRODUCTS_2024('page 26, para 40.1.5'),
    },
    {
      text:
        'Stop paying premiums during the lock-in and you have three years to revive the policy; the insurer must tell you ' +
        'within three months of the first unpaid premium.',
      source: LIFE_PRODUCTS_2024('page 24, para 40.1.2'),
    },
    {
      text: 'After the lock-in, you can surrender at any time and are paid the fund value.',
      source: LIFE_PRODUCTS_2024('page 26, para 40.1.6.1.6'),
    },
  ],
};

export function hasSurrenderValue(type: string): boolean {
  return (SURRENDER_POLICY_TYPES as readonly string[]).includes(type);
}

/** The rules that apply to a policy type (empty when it has no surrender value). */
export function surrenderRulesFor(type: string): SurrenderRule[] {
  if (!hasSurrenderValue(type)) return [];
  return [...SURRENDER_RULES.general, ...(type === 'ULIP' ? SURRENDER_RULES.ulip : SURRENDER_RULES.nonLinked)];
}

export interface SurrenderComparison {
  paid: string;
  value: string;
  /** Value less premiums paid: negative is money lost. */
  difference: string;
  outcome: 'LOSS' | 'GAIN' | 'EVEN';
  /** The difference as a share of premiums paid, 1 decimal; null when nothing is paid. */
  percent: string | null;
}

export function compareSurrender(premiumsPaid: string, surrenderValue: string): SurrenderComparison {
  const paid = new Decimal(premiumsPaid);
  const value = new Decimal(surrenderValue);
  const difference = value.minus(paid);
  return {
    paid: paid.toFixed(2),
    value: value.toFixed(2),
    difference: difference.toFixed(2),
    outcome: difference.isZero() ? 'EVEN' : difference.isNegative() ? 'LOSS' : 'GAIN',
    percent: paid.isZero() ? null : difference.abs().div(paid).times(100).toFixed(1),
  };
}

export type SurrenderTiming =
  | { state: 'ULIP_LOCK_IN'; lockInEndsOn: string }
  | { state: 'FIRST_YEAR'; payableFrom: string }
  | { state: 'AVAILABLE' };

/**
 * When a surrender would pay out. A ULIP inside its five-year lock-in pays
 * when the lock-in ends; a regular-premium policy has no special surrender
 * value until its first policy year is over (a policy with premiums payable
 * for under 5 years is an exception we can't see, and the wording says so).
 */
export function surrenderTiming(
  p: { type: string; startDate: string; premiumFrequency: string },
  todayIso: string,
): SurrenderTiming {
  const today = todayIso.slice(0, 10);
  const start = p.startDate.slice(0, 10);
  if (p.type === 'ULIP') {
    const lockInEndsOn = addMonthsIso(start, ULIP_LOCK_IN_YEARS * 12);
    return today < lockInEndsOn ? { state: 'ULIP_LOCK_IN', lockInEndsOn } : { state: 'AVAILABLE' };
  }
  if (p.premiumFrequency !== 'SINGLE') {
    const payableFrom = addMonthsIso(start, 12);
    if (today < payableFrom) return { state: 'FIRST_YEAR', payableFrom };
  }
  return { state: 'AVAILABLE' };
}
