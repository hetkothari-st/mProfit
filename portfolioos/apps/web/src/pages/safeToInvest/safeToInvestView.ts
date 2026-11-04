import { Decimal, formatINR, type SafeToInvestSummary } from '@everypaisa/shared';

/** ₹ with no paise. */
export const rupees = (v: string | Decimal | null | undefined) =>
  v == null ? '—' : formatINR(v.toString(), { fractionDigits: 0 });

/** Lakh/crore shorthand for tight spots (chart labels, sentences). */
export const lakh = (v: string | Decimal | null | undefined) =>
  v == null ? '—' : formatINR(v.toString(), { compact: true });

/** '2026-10' → 'Oct'; with year when asked → 'Oct 2026'. */
export function monthLabel(ym: string, withYear = false): string {
  const [y, m] = ym.split('-').map((x) => Number.parseInt(x, 10));
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString('en-IN', {
    month: 'short',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

export const STABILITY_TEXT: Record<NonNullable<SafeToInvestSummary['stabilityLabel']>, string> = {
  STABLE: 'Stable, like a salary',
  SOMEWHAT_VARIABLE: 'Somewhat variable',
  VARIABLE: 'Variable, typical of freelance and business income',
};

export interface SipAdvice {
  tone: 'over' | 'under' | 'match' | 'none';
  text: string;
}

/** How the user's current SIPs compare with the safe amount. */
export function sipAdvice(s: SafeToInvestSummary): SipAdvice {
  if (!s.safeAmount) return { tone: 'none', text: '' };
  const safe = new Decimal(s.safeAmount);
  const current = s.currentSip.monthly ? new Decimal(s.currentSip.monthly) : null;
  if (!current) return { tone: 'none', text: 'You have no SIPs on record yet.' };
  const gap = current.minus(safe);
  const missed = s.currentSip.missedMonths;
  const missedText = missed > 0 ? ` You missed SIPs in ${missed} ${missed === 1 ? 'month' : 'months'} this year.` : '';
  // Within ₹500 counts as a match: SIPs are set in round amounts.
  if (gap.abs().lessThan(500)) return { tone: 'match', text: `Your SIPs of ${rupees(current)} fit your lean month.${missedText}` };
  if (gap.greaterThan(0)) {
    return {
      tone: 'over',
      text: `Your SIPs total ${rupees(current)}, ${rupees(gap)} more than a lean month can carry.${missedText} Step down to ${rupees(safe)} and top up in good months.`,
    };
  }
  return { tone: 'under', text: `Your SIPs total ${rupees(current)}. You have room for ${rupees(gap.abs())} more every month.${missedText}` };
}

/** Top-up share options for the select, as fraction strings the API expects. */
export const TOP_UP_SHARES = [
  { value: '0.2500', label: '25%' },
  { value: '0.5000', label: '50%' },
  { value: '0.7500', label: '75%' },
  { value: '1.0000', label: '100%' },
] as const;
