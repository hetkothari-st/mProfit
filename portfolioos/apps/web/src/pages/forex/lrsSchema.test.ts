import { describe, it, expect } from 'vitest';
import { lrsSchema } from './lrsSchema';

const base = {
  remittanceDate: '2026-05-01',
  currency: 'USD',
  foreignAmount: '1000',
  purpose: 'INVESTMENT' as const,
};

describe('LRS remittance form schema', () => {
  it('accepts a blank FX rate and blank TCS (what an empty input submits)', () => {
    expect(lrsSchema.safeParse({ ...base, fxRate: '', tcsDeducted: '' }).success).toBe(true);
  });

  it('accepts filled values', () => {
    expect(lrsSchema.safeParse({ ...base, fxRate: '83.25', tcsDeducted: '500' }).success).toBe(true);
  });

  it('rejects text with a message the form can show', () => {
    const r = lrsSchema.safeParse({ ...base, fxRate: 'abc' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/number/i);
  });
});
