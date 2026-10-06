import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import {
  addMonthsIso,
  buildPremiumSchedule,
  daysBetweenIso,
  defaultGraceDays,
  nextPremiumDue,
  premiumDueOn,
  premiumToAnnual,
} from './premiumSchedule.js';

const pay = (periodFrom: string, paidOn = periodFrom, amount = '25000') => ({ periodFrom, paidOn, amount });

describe('addMonthsIso', () => {
  it('keeps the day of month, clamping to short months', () => {
    expect(addMonthsIso('2026-03-15', 1)).toBe('2026-04-15');
    expect(addMonthsIso('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsIso('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsIso('2025-11-30', 3)).toBe('2026-02-28');
    expect(addMonthsIso('2024-02-29', 12)).toBe('2025-02-28');
  });
});

describe('daysBetweenIso', () => {
  it('counts calendar days, negative when the second date is earlier', () => {
    expect(daysBetweenIso('2026-09-11', '2026-10-11')).toBe(30);
    expect(daysBetweenIso('2026-09-11', '2026-09-01')).toBe(-10);
  });
});

describe('premiumToAnnual', () => {
  it('annualises by frequency; a single premium is not a yearly cost', () => {
    const p = new Decimal('1000');
    expect(premiumToAnnual(p, 'MONTHLY').toString()).toBe('12000');
    expect(premiumToAnnual(p, 'QUARTERLY').toString()).toBe('4000');
    expect(premiumToAnnual(p, 'HALF_YEARLY').toString()).toBe('2000');
    expect(premiumToAnnual(p, 'ANNUAL').toString()).toBe('1000');
    expect(premiumToAnnual(p, 'SINGLE').toString()).toBe('0');
  });
});

describe('defaultGraceDays', () => {
  it('gives life and health policies 30 days, or 15 when paid monthly', () => {
    expect(defaultGraceDays('TERM', 'ANNUAL')).toBe(30);
    expect(defaultGraceDays('ENDOWMENT', 'QUARTERLY')).toBe(30);
    expect(defaultGraceDays('ULIP', 'MONTHLY')).toBe(15);
    expect(defaultGraceDays('HEALTH', 'ANNUAL')).toBe(30);
  });

  it('gives motor, travel, home and accident cover no grace — they simply expire', () => {
    for (const type of ['MOTOR', 'TRAVEL', 'HOME', 'PERSONAL_ACCIDENT']) {
      expect(defaultGraceDays(type, 'ANNUAL')).toBe(0);
    }
  });

  it('has nothing to wait for on a single premium', () => {
    expect(defaultGraceDays('WHOLE_LIFE', 'SINGLE')).toBe(0);
  });
});

describe('buildPremiumSchedule', () => {
  const policy = { startDate: '2022-03-15', premiumFrequency: 'ANNUAL', maturityDate: null };

  it('lays out each premium, matching payments by month and flagging missed ones', () => {
    const rows = buildPremiumSchedule(policy, [pay('2025-03-15'), pay('2026-03-10')], {
      today: '2026-09-11',
    });
    expect(rows.slice(0, 6).map((r) => [r.dueDate, r.status])).toEqual([
      ['2022-03-15', 'OVERDUE'],
      ['2023-03-15', 'OVERDUE'],
      ['2024-03-15', 'OVERDUE'],
      ['2025-03-15', 'PAID'],
      ['2026-03-15', 'PAID'],
      ['2027-03-15', 'UPCOMING'],
    ]);
    expect(rows[4]!.payment?.paidOn).toBe('2026-03-10');
    expect(rows[4]!.periodTo).toBe('2027-03-15');
  });

  it("doesn't call premiums from before the policy was tracked overdue", () => {
    const rows = buildPremiumSchedule(policy, [], { today: '2026-09-11', untrackedBefore: '2026-01-01' });
    expect(rows.slice(0, 6).map((r) => r.status)).toEqual([
      'UNTRACKED',
      'UNTRACKED',
      'UNTRACKED',
      'UNTRACKED',
      'OVERDUE',
      'UPCOMING',
    ]);
  });

  it('uses each payment once', () => {
    const monthly = { startDate: '2026-01-05', premiumFrequency: 'MONTHLY', maturityDate: null };
    const rows = buildPremiumSchedule(monthly, [pay('2026-01-05'), pay('2026-01-20')], { today: '2026-03-01' });
    expect(rows.slice(0, 3).map((r) => r.status)).toEqual(['PAID', 'OVERDUE', 'UPCOMING']);
  });

  it('stops at maturity', () => {
    const rows = buildPremiumSchedule(
      { startDate: '2024-06-01', premiumFrequency: 'ANNUAL', maturityDate: '2027-06-01' },
      [],
      { today: '2026-09-11' },
    );
    expect(rows.map((r) => r.dueDate)).toEqual(['2024-06-01', '2025-06-01', '2026-06-01']);
  });

  it('lists only the recorded payment for a single-premium policy', () => {
    const rows = buildPremiumSchedule(
      { startDate: '2024-06-01', premiumFrequency: 'SINGLE', maturityDate: null },
      [pay('2024-06-01')],
      { today: '2026-09-11' },
    );
    expect(rows.map((r) => r.status)).toEqual(['PAID']);
  });
});

describe('nextPremiumDue', () => {
  const annual = { startDate: '2025-10-01', premiumFrequency: 'ANNUAL', maturityDate: null };
  const at = (today: string, payments = [pay('2025-10-01')], graceDays = 30) =>
    nextPremiumDue(buildPremiumSchedule(annual, payments, { today }), { today, graceDays });

  it('is upcoming when well ahead, and due soon within 30 days', () => {
    expect(at('2026-06-01')).toMatchObject({ dueDate: '2026-10-01', state: 'UPCOMING', daysUntilDue: 122 });
    expect(at('2026-09-11')).toMatchObject({ dueDate: '2026-10-01', state: 'DUE_SOON', daysUntilDue: 20 });
  });

  it('is in grace after the due date, and at risk of lapsing once grace ends', () => {
    expect(at('2026-10-11')).toMatchObject({
      state: 'IN_GRACE',
      graceEndsOn: '2026-10-31',
      daysLeftInGrace: 20,
      daysUntilDue: -10,
    });
    expect(at('2026-11-05')).toMatchObject({ state: 'LAPSE_RISK', graceEndsOn: '2026-10-31' });
  });

  it('goes straight to lapse risk when there is no grace (e.g. motor)', () => {
    expect(at('2026-10-02', [pay('2025-10-01')], 0)).toMatchObject({ state: 'LAPSE_RISK' });
  });

  it('gives the same answer from a stored due date (premiumDueOn)', () => {
    expect(premiumDueOn('2026-10-01T00:00:00.000Z', { today: '2026-10-11', graceDays: 30 })).toMatchObject({
      dueDate: '2026-10-01',
      state: 'IN_GRACE',
      daysLeftInGrace: 20,
    });
    expect(premiumDueOn(null, { today: '2026-10-11', graceDays: 30 }).state).toBe('PAID_UP');
  });

  it('is paid up when nothing is left to pay', () => {
    const single = buildPremiumSchedule(
      { startDate: '2024-06-01', premiumFrequency: 'SINGLE', maturityDate: null },
      [pay('2024-06-01')],
      { today: '2026-09-11' },
    );
    expect(nextPremiumDue(single, { today: '2026-09-11', graceDays: 0 })).toMatchObject({
      dueDate: null,
      state: 'PAID_UP',
    });
  });
});
