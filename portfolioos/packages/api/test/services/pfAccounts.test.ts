import { describe, it, expect } from 'vitest';
import { computePfAssetKey } from '../../src/services/pfAccounts.service.js';

describe('computePfAssetKey', () => {
  it('produces deterministic key for an EPF UAN', () => {
    const a = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '100123456789' });
    const b = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '100123456789' });
    expect(a).toBe(b);
    expect(a).toMatch(/^pf:epf:[a-f0-9]{64}$/);
  });

  it('different UAN → different key', () => {
    const a = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '111' });
    const b = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '222' });
    expect(a).not.toBe(b);
  });

  it('PPF key embeds institution', () => {
    const sbi = computePfAssetKey({ type: 'PPF', institution: 'SBI', identifier: 'ABC123' });
    const hdfc = computePfAssetKey({ type: 'PPF', institution: 'HDFC', identifier: 'ABC123' });
    expect(sbi).not.toBe(hdfc);
    expect(sbi).toMatch(/^pf:ppf:sbi:[a-f0-9]{64}$/);
    expect(hdfc).toMatch(/^pf:ppf:hdfc:[a-f0-9]{64}$/);
  });

  it('normalizes whitespace and case before hashing', () => {
    // " uan-123 " and "UAN-123" should hash the same — users will type variants.
    const a = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: ' uan-123 ' });
    const b = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: 'UAN-123' });
    expect(a).toBe(b);
  });

  it('treats EPF and PPF with same identifier as different keys', () => {
    const epf = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: 'X' });
    const ppfEpfo = computePfAssetKey({ type: 'PPF', institution: 'EPFO', identifier: 'X' });
    expect(epf).not.toBe(ppfEpfo);
  });
});
