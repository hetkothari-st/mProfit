import { describe, it, expect } from 'vitest';
import { buildCanonicalEvents } from '../../src/services/pfCanonicalize.service.js';

describe('buildCanonicalEvents', () => {
  it('attaches sourceHash + sourceAdapter to each row', () => {
    const out = buildCanonicalEvents({
      userId: 'u1',
      account: {
        id: 'pfa1',
        institution: 'EPFO',
        type: 'EPF',
        identifierPlain: 'UAN1',
      },
      adapterId: 'pf.epfo.v1',
      adapterVersion: '1.0.0',
      events: [
        { type: 'PF_EMPLOYER_CONTRIBUTION', eventDate: '2024-04-01', amount: '5000.00', sequence: 0 },
        { type: 'PF_EMPLOYER_CONTRIBUTION', eventDate: '2024-04-01', amount: '5000.00', sequence: 1 },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out[0].sourceHash).not.toBe(out[1].sourceHash);
    expect(out[0].sourceAdapter).toBe('pf.epfo.v1');
    expect(out[0].userId).toBe('u1');
  });

  it('is deterministic (same hash for same inputs)', () => {
    const input = {
      userId: 'u1',
      account: { id: 'a1', institution: 'EPFO', type: 'EPF', identifierPlain: 'UAN1' },
      adapterId: 'pf.epfo.v1',
      adapterVersion: '1.0.0',
      events: [
        { type: 'PF_INTEREST_CREDIT', eventDate: '2024-03-31', amount: '7800.00', sequence: 0 },
      ],
    };
    const a = buildCanonicalEvents(input);
    const b = buildCanonicalEvents(input);
    expect(a[0].sourceHash).toBe(b[0].sourceHash);
  });
});
