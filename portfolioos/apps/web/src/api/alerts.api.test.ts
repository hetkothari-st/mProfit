import { describe, it, expect } from 'vitest';
import { totalNewAlerts } from './alerts.api';

describe('totalNewAlerts', () => {
  it('counts every scanner the server reports, not just vehicle and rent', () => {
    // The shape runAllAlertScans returns today.
    expect(
      totalNewAlerts({
        vehicle: 1, rent: 0, poMaturity: 2, loan: 1, loanGiven: 0,
        creditCard: 3, realEstate: 0, deposit: 1, insurance: 2, insuranceClaims: 1,
      }),
    ).toBe(11);
  });

  it('is 0 for an empty scan', () => {
    expect(totalNewAlerts({})).toBe(0);
  });
});
