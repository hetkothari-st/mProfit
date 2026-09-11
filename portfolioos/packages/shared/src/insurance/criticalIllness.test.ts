import { describe, it, expect } from 'vitest';
import { CRITICAL_ILLNESS_POLICY_TYPES, canHaveCriticalIllness } from './criticalIllness.js';

describe('critical illness cover', () => {
  it('applies to life, health and accident policies', () => {
    for (const t of ['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT', 'HEALTH', 'PERSONAL_ACCIDENT']) {
      expect(canHaveCriticalIllness(t), t).toBe(true);
    }
    expect(CRITICAL_ILLNESS_POLICY_TYPES.size).toBe(6);
  });

  it('not to motor, home or travel cover', () => {
    for (const t of ['MOTOR', 'HOME', 'TRAVEL', 'SOMETHING_ELSE']) {
      expect(canHaveCriticalIllness(t), t).toBe(false);
    }
  });
});
