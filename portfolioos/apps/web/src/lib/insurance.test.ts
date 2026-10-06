import { describe, it, expect } from 'vitest';
import type { NextPremiumDue } from '@everypaisa/shared';
import { criticalIllnessMeta, needsNominee, nextPremiumPrefill, plural, premiumDueMeta, urgencyRank } from './insurance';

const due = (d: Partial<NextPremiumDue>): NextPremiumDue => ({
  dueDate: null,
  state: 'PAID_UP',
  daysUntilDue: null,
  graceEndsOn: null,
  daysLeftInGrace: null,
  ...d,
});

const policy = (premiumDue: NextPremiumDue, over: Partial<{ status: string; graceDays: number; premiumFrequency: string }> = {}) => ({
  status: 'ACTIVE',
  graceDays: 30,
  premiumFrequency: 'ANNUAL',
  premiumDue,
  ...over,
});

describe('premiumDueMeta', () => {
  it('is quiet about a premium more than a month away', () => {
    const m = premiumDueMeta(policy(due({ state: 'UPCOMING', dueDate: '2027-01-01', daysUntilDue: 112 })));
    expect(m).toMatchObject({ tone: 'neutral', urgent: false, label: 'Next premium 1 Jan 2027' });
  });

  it('warns a month out and turns red in the last week', () => {
    expect(premiumDueMeta(policy(due({ state: 'DUE_SOON', dueDate: '2026-10-01', daysUntilDue: 20 })))).toMatchObject({
      tone: 'warn',
      urgent: true,
      label: 'Due in 20 days',
    });
    expect(premiumDueMeta(policy(due({ state: 'DUE_SOON', dueDate: '2026-09-12', daysUntilDue: 1 }))).label).toBe(
      'Due in 1 day',
    );
    expect(premiumDueMeta(policy(due({ state: 'DUE_SOON', dueDate: '2026-09-11', daysUntilDue: 0 })))).toMatchObject({
      tone: 'danger',
      label: 'Premium due today',
    });
  });

  it('counts down the grace period, and says when to pay by', () => {
    const m = premiumDueMeta(
      policy(due({ state: 'IN_GRACE', dueDate: '2026-09-01', daysUntilDue: -10, graceEndsOn: '2026-10-01', daysLeftInGrace: 20 })),
    );
    expect(m.label).toBe('Overdue — 20 days of grace left');
    expect(m.detail).toContain('Pay by 1 Oct 2026');
  });

  it('flags a possible lapse after grace, and an ended cover with no grace', () => {
    expect(
      premiumDueMeta(policy(due({ state: 'LAPSE_RISK', dueDate: '2026-07-01', graceEndsOn: '2026-07-31' }))).label,
    ).toBe('May have lapsed');
    expect(
      premiumDueMeta(policy(due({ state: 'LAPSE_RISK', dueDate: '2026-09-01' }), { graceDays: 0 })).label,
    ).toBe('Cover has ended');
  });

  it('shows the status instead for a policy that is no longer active', () => {
    expect(premiumDueMeta(policy(due({ state: 'LAPSE_RISK' }), { status: 'MATURED' }))).toMatchObject({
      label: 'Matured',
      urgent: false,
    });
  });

  it('orders the riskiest first', () => {
    const ranks = (['UPCOMING', 'LAPSE_RISK', 'DUE_SOON', 'IN_GRACE'] as const).map((state) =>
      urgencyRank({ premiumDue: due({ state }) }),
    );
    expect(ranks).toEqual([3, 0, 2, 1]);
  });
});

describe('needsNominee', () => {
  it('nudges for life and accident cover without a nominee', () => {
    expect(needsNominee({ type: 'TERM', status: 'ACTIVE', nominees: null })).toBe(true);
    expect(needsNominee({ type: 'PERSONAL_ACCIDENT', status: 'ACTIVE', nominees: [] })).toBe(true);
  });

  it('stays quiet when there is one, or the cover does not pay out on death', () => {
    expect(needsNominee({ type: 'TERM', status: 'ACTIVE', nominees: [{ name: 'A', relation: 'Spouse' }] })).toBe(false);
    expect(needsNominee({ type: 'MOTOR', status: 'ACTIVE', nominees: null })).toBe(false);
    expect(needsNominee({ type: 'TERM', status: 'LAPSED', nominees: null })).toBe(false);
  });
});

describe('nextPremiumPrefill', () => {
  it('covers the premium that is next due, for one period', () => {
    expect(
      nextPremiumPrefill(
        { premiumDue: due({ state: 'DUE_SOON', dueDate: '2026-10-01' }), premiumFrequency: 'QUARTERLY', premiumAmount: '6000' },
        '2026-09-11',
      ),
    ).toEqual({ paidOn: '2026-09-11', amount: '6000', periodFrom: '2026-10-01', periodTo: '2027-01-01' });
  });
});

describe('criticalIllnessMeta', () => {
  it('says how much critical illness cover a policy has', () => {
    expect(
      criticalIllnessMeta({ type: 'TERM', criticalIllnessCover: true, criticalIllnessSumAssured: '1000000' }),
    ).toEqual({ tone: 'ok', label: '₹10 L critical illness cover' });
    expect(criticalIllnessMeta({ type: 'HEALTH', criticalIllnessCover: true, criticalIllnessSumAssured: null })).toEqual({
      tone: 'ok',
      label: 'Critical illness covered',
    });
  });

  it('says plainly when there is none, or it isn’t recorded', () => {
    expect(criticalIllnessMeta({ type: 'TERM', criticalIllnessCover: false, criticalIllnessSumAssured: null })).toEqual({
      tone: 'warn',
      label: 'No critical illness cover',
    });
    expect(criticalIllnessMeta({ type: 'ENDOWMENT', criticalIllnessCover: null, criticalIllnessSumAssured: null })).toEqual({
      tone: 'neutral',
      label: 'Critical illness: not recorded',
    });
  });

  it('stays silent for cover that never includes it', () => {
    expect(criticalIllnessMeta({ type: 'MOTOR', criticalIllnessCover: null, criticalIllnessSumAssured: null })).toBeNull();
  });
});

describe('plural', () => {
  it('takes an irregular plural', () => {
    expect(plural(1, 'policy', 'policies')).toBe('1 policy');
    expect(plural(3, 'policy', 'policies')).toBe('3 policies');
    expect(plural(2, 'day')).toBe('2 days');
  });
});
