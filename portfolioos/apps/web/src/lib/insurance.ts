/**
 * Shared wording and colours for insurance surfaces: policy cards, the
 * "coming up" list, the policy page and the emergency sheet all describe a
 * premium the same way.
 */
import { addMonthsIso, canHaveCriticalIllness, formatINR, PREMIUM_FREQUENCY_MONTHS } from '@everypaisa/shared';
import type { InsurancePolicyDTO } from '@/api/insurance.api';

export const POLICY_TYPE_LABELS: Record<string, string> = {
  TERM: 'Term life',
  WHOLE_LIFE: 'Whole life',
  ULIP: 'ULIP',
  ENDOWMENT: 'Endowment',
  HEALTH: 'Health',
  MOTOR: 'Motor',
  HOME: 'Home',
  TRAVEL: 'Travel',
  PERSONAL_ACCIDENT: 'Personal accident',
};

export const POLICY_TYPES = Object.keys(POLICY_TYPE_LABELS);

export const LIFE_POLICY_TYPES: ReadonlySet<string> = new Set(['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT']);

/**
 * An active policy that pays out on death, with no nominee recorded. Without a
 * nominee on the policy, the family may need a succession or legal-heir
 * certificate before a claim is paid — worth a nudge.
 */
export function needsNominee(p: Pick<InsurancePolicyDTO, 'type' | 'status' | 'nominees'>): boolean {
  return (
    p.status === 'ACTIVE' &&
    (LIFE_POLICY_TYPES.has(p.type) || p.type === 'PERSONAL_ACCIDENT') &&
    !(p.nominees && p.nominees.length > 0)
  );
}

export const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  HALF_YEARLY: 'half-yearly',
  ANNUAL: 'yearly',
  SINGLE: 'single premium',
};

export const POLICY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  LAPSED: 'Lapsed',
  SURRENDERED: 'Surrendered',
  MATURED: 'Matured',
  CLAIMED: 'Claimed',
};

/**
 * Card colour for a policy whose insurer has no brand colour on file: one per
 * kind of cover, so a wall of unbranded cards still sorts itself by eye.
 */
export const POLICY_TYPE_COLORS: Record<string, string> = {
  TERM: '#1d4ed8',
  WHOLE_LIFE: '#4338ca',
  ULIP: '#6d28d9',
  ENDOWMENT: '#7c3aed',
  HEALTH: '#0f766e',
  MOTOR: '#c2410c',
  HOME: '#a16207',
  TRAVEL: '#0369a1',
  PERSONAL_ACCIDENT: '#be123c',
};

export function policyTypeLabel(type: string): string {
  return POLICY_TYPE_LABELS[type] ?? type;
}

/** "Star Health — Health" when there's no plan name. */
export function policyTitle(p: Pick<InsurancePolicyDTO, 'planName' | 'type'>): string {
  return p.planName?.trim() || `${policyTypeLabel(p.type)} policy`;
}

/**
 * Whether a policy includes critical illness cover, in words — null for cover
 * that never includes it (motor, home, travel).
 */
export function criticalIllnessMeta(
  p: Pick<InsurancePolicyDTO, 'type' | 'criticalIllnessCover' | 'criticalIllnessSumAssured'>,
): { tone: Tone; label: string } | null {
  if (!canHaveCriticalIllness(p.type)) return null;
  if (p.criticalIllnessCover === true) {
    return {
      tone: 'ok',
      label: p.criticalIllnessSumAssured
        ? `${formatINR(p.criticalIllnessSumAssured, { compact: true })} critical illness cover`
        : 'Critical illness covered',
    };
  }
  if (p.criticalIllnessCover === false) return { tone: 'warn', label: 'No critical illness cover' };
  return { tone: 'neutral', label: 'Critical illness: not recorded' };
}

/** "2026-10-01" or a full ISO timestamp → "1 Oct 2026". */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger';

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  ok: 'text-positive',
  warn: 'text-amber-500',
  danger: 'text-negative',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/50',
  ok: 'bg-positive',
  warn: 'bg-amber-500',
  danger: 'bg-negative',
};

export interface DueMeta {
  tone: Tone;
  /** Short, for a card: "Due in 12 days". */
  label: string;
  /** One sentence of what to do, when there's something to do. */
  detail: string | null;
  /** Needs the user's attention now (shown in "Coming up"). */
  urgent: boolean;
}

/** Where a policy's premium stands, in words. */
export function premiumDueMeta(
  p: Pick<InsurancePolicyDTO, 'status' | 'premiumDue' | 'graceDays' | 'premiumFrequency'>,
): DueMeta {
  if (p.status !== 'ACTIVE') {
    return { tone: 'neutral', label: POLICY_STATUS_LABELS[p.status] ?? p.status, detail: null, urgent: false };
  }
  const due = p.premiumDue;
  switch (due.state) {
    case 'PAID_UP':
      return {
        tone: 'ok',
        label: p.premiumFrequency === 'SINGLE' ? 'Single premium — nothing more to pay' : 'No premium due',
        detail: null,
        urgent: false,
      };
    case 'UPCOMING':
      return { tone: 'neutral', label: `Next premium ${formatDay(due.dueDate)}`, detail: null, urgent: false };
    case 'DUE_SOON': {
      const days = due.daysUntilDue ?? 0;
      return {
        tone: days <= 7 ? 'danger' : 'warn',
        label: days === 0 ? 'Premium due today' : `Due in ${plural(days, 'day')}`,
        detail:
          p.graceDays > 0
            ? `Due ${formatDay(due.dueDate)}. Miss it and you still have ${plural(p.graceDays, 'day')} of grace to pay.`
            : `Due ${formatDay(due.dueDate)}. Cover stops if it isn’t renewed by then.`,
        urgent: true,
      };
    }
    case 'IN_GRACE':
      return {
        tone: 'danger',
        label: `Overdue — ${plural(due.daysLeftInGrace ?? 0, 'day')} of grace left`,
        detail: `Was due ${formatDay(due.dueDate)}. Pay by ${formatDay(due.graceEndsOn)} to keep the policy in force.`,
        urgent: true,
      };
    case 'LAPSE_RISK':
      return p.graceDays > 0
        ? {
            tone: 'danger',
            label: 'May have lapsed',
            detail:
              `The premium due ${formatDay(due.dueDate)} isn’t recorded as paid and the grace period ended ` +
              `${formatDay(due.graceEndsOn)}. If you paid, record it; if not, ask the insurer about reviving the policy.`,
            urgent: true,
          }
        : {
            tone: 'danger',
            label: 'Cover has ended',
            detail: `It was due for renewal ${formatDay(due.dueDate)}. You aren’t covered until it’s renewed.`,
            urgent: true,
          };
  }
}

/** Urgency order for "Coming up": most at risk first, then soonest. */
export function urgencyRank(p: Pick<InsurancePolicyDTO, 'premiumDue'>): number {
  const order = { LAPSE_RISK: 0, IN_GRACE: 1, DUE_SOON: 2, UPCOMING: 3, PAID_UP: 4 } as const;
  return order[p.premiumDue.state];
}

/** Prefill for recording the premium that's next due. */
export function nextPremiumPrefill(
  p: Pick<InsurancePolicyDTO, 'premiumDue' | 'premiumFrequency' | 'premiumAmount'>,
  today = new Date().toISOString().slice(0, 10),
) {
  const from = p.premiumDue.dueDate ?? today;
  const months = PREMIUM_FREQUENCY_MONTHS[p.premiumFrequency];
  return {
    paidOn: today,
    amount: p.premiumAmount,
    periodFrom: from,
    periodTo: months ? addMonthsIso(from, months) : from,
  };
}
