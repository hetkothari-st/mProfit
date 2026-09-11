import { formatINR, type AreaCheck, type CoverageVerdict } from '@everypaisa/shared';
import type { Tone } from '@/lib/insurance';

export const VERDICT_LABELS: Record<CoverageVerdict, string> = {
  COVERED: 'Covered',
  SHORT: 'Short',
  MISSING: 'Missing',
  NOT_APPLICABLE: 'Nothing to cover',
  UNKNOWN: 'Needs your figures',
};

/** An optional area (home) with no cover is worth a look, not an alarm. */
export function verdictLabel(check: Pick<AreaCheck, 'verdict' | 'optional'>): string {
  return check.optional && check.verdict === 'MISSING' ? 'Worth a look' : VERDICT_LABELS[check.verdict];
}

export function verdictTone(check: Pick<AreaCheck, 'verdict' | 'optional'>): Tone {
  switch (check.verdict) {
    case 'COVERED':
      return 'ok';
    case 'SHORT':
      return 'warn';
    case 'MISSING':
      return check.optional ? 'warn' : 'danger';
    default:
      return 'neutral';
  }
}

/** "₹1.5 Cr" — big figures, read at a glance. */
export const inr = (money: string) => formatINR(money, { compact: true });
