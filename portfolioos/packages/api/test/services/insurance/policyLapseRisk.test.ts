import { describe, it, expect } from 'vitest';
import { isLapseRisk } from '../../../src/services/insurance/insurance.service.js';

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// A term plan whose annual premium fell due on 1 Jun 2026 and was never recorded
// as paid; its grace period is over, yet its stored status is still ACTIVE.
const lapsed = { type: 'TERM', premiumFrequency: 'ANNUAL', gracePeriodDays: null, nextPremiumDue: date('2026-06-01') };

describe('isLapseRisk', () => {
  it('is true once the premium is past due AND past its grace period', () => {
    expect(isLapseRisk(lapsed, '2026-11-18')).toBe(true);
  });

  it('is false while still inside the grace period', () => {
    expect(isLapseRisk({ ...lapsed, gracePeriodDays: 30 }, '2026-06-20')).toBe(false);
  });

  it('is false when the next premium is still ahead', () => {
    expect(isLapseRisk({ ...lapsed, nextPremiumDue: date('2027-01-01') }, '2026-11-18')).toBe(false);
  });

  it('is false when no premium is outstanding (paid-up / single premium)', () => {
    expect(isLapseRisk({ ...lapsed, nextPremiumDue: null }, '2026-11-18')).toBe(false);
  });
});
