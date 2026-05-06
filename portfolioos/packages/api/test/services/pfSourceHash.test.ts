import { describe, it, expect } from 'vitest';
import { pfEventHash } from '../../src/services/sourceHash.js';

describe('pfEventHash', () => {
  it('is deterministic for same inputs', () => {
    const a = pfEventHash({
      userId: 'u1',
      institution: 'EPFO',
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
      sequence: 0,
    });
    const b = pfEventHash({
      userId: 'u1',
      institution: 'EPFO',
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
      sequence: 0,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when sequence differs (handles same-day duplicate rows)', () => {
    const base = {
      userId: 'u1',
      institution: 'EPFO',
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
    };
    expect(pfEventHash({ ...base, sequence: 0 })).not.toBe(
      pfEventHash({ ...base, sequence: 1 }),
    );
  });

  it('differs across users', () => {
    const base = {
      institution: 'EPFO',
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
      sequence: 0,
    };
    expect(pfEventHash({ ...base, userId: 'u1' })).not.toBe(
      pfEventHash({ ...base, userId: 'u2' }),
    );
  });

  it('differs when amount differs', () => {
    const base = {
      userId: 'u1',
      institution: 'EPFO',
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      type: 'PF_EMPLOYER_CONTRIBUTION',
      sequence: 0,
    };
    expect(pfEventHash({ ...base, amount: '5000.00' })).not.toBe(
      pfEventHash({ ...base, amount: '5000.01' }),
    );
  });

  it('differs across institutions for same identifier (collision avoidance)', () => {
    const base = {
      userId: 'u1',
      identifier: 'ACCT1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_INTEREST_CREDIT',
      sequence: 0,
    };
    expect(pfEventHash({ ...base, institution: 'SBI' })).not.toBe(
      pfEventHash({ ...base, institution: 'HDFC' }),
    );
  });
});
