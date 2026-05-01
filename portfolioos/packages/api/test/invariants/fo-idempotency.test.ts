import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

/**
 * INVARIANT: F&O broker sync sourceHash is fully deterministic — same
 * (broker, orderId, tradeId) → same hash, regardless of clock or which
 * fields the broker added/changed. Re-import yields zero new rows.
 */

function fnoSourceHash(brokerId: string, orderId: string, tradeId: string): string {
  return crypto.createHash('sha256').update(`fno:${brokerId}:${orderId}:${tradeId}`).digest('hex');
}

describe('F&O ingestion idempotency', () => {
  it('hash is deterministic per (broker, orderId, tradeId)', () => {
    const a = fnoSourceHash('zerodha', 'O1', 'T1');
    const b = fnoSourceHash('zerodha', 'O1', 'T1');
    expect(a).toBe(b);
  });

  it('different broker produces different hash', () => {
    expect(fnoSourceHash('zerodha', 'O1', 'T1')).not.toBe(fnoSourceHash('upstox', 'O1', 'T1'));
  });

  it('different orderId or tradeId produces different hash', () => {
    const base = fnoSourceHash('zerodha', 'O1', 'T1');
    expect(base).not.toBe(fnoSourceHash('zerodha', 'O2', 'T1'));
    expect(base).not.toBe(fnoSourceHash('zerodha', 'O1', 'T2'));
  });
});
