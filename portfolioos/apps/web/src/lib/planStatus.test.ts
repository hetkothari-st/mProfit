import { describe, it, expect } from 'vitest';
import { planActiveLine, tierAction } from './planStatus';

describe('tierAction', () => {
  it('never offers a lower tier while a paid plan is active', () => {
    expect(tierAction('FAMILY', 'PLUS')).toBe('included');
    expect(tierAction('FAMILY', 'FREE')).toBe('included');
  });
  it('offers an early renewal of the current paid plan', () => {
    expect(tierAction('PLUS', 'PLUS')).toBe('renew');
  });
  it('Free is just the current plan, and higher tiers are upgrades', () => {
    expect(tierAction('FREE', 'FREE')).toBe('current');
    expect(tierAction('FREE', 'PLUS')).toBe('upgrade');
    expect(tierAction('PLUS', 'PRO_ADVISOR')).toBe('upgrade');
  });
});

describe('planActiveLine', () => {
  it('names the plan and its end date', () => {
    expect(planActiveLine({ plan: 'PLUS', planExpiresAt: '2026-11-12T10:00:00.000Z' })).toBe(
      'Your Plus plan is active until 12/11/2026',
    );
  });
  it('says nothing on Free', () => {
    expect(planActiveLine({ plan: 'FREE', planExpiresAt: null })).toBeNull();
  });
  it('a plan with no end date says so', () => {
    expect(planActiveLine({ plan: 'FAMILY', planExpiresAt: null })).toBe(
      'Your Family plan is active, with no end date',
    );
  });
});
