import { describe, it, expect } from 'vitest';
import { computeAssetKey, assetKeyFromTransaction, extractUnderlyingFromAssetName } from '../../src/services/assetKey.js';

/**
 * INVARIANT: F&O contracts on the same underlying with different (type, strike,
 * expiry) MUST produce distinct assetKeys. Pre-fix, all options on NIFTY
 * collapsed into a single HoldingProjection row.
 */
describe('F&O assetKey precedence', () => {
  it('NIFTY 24500 CE and 25000 CE on same expiry produce different keys', () => {
    const k1 = computeAssetKey({
      foUnderlying: 'NIFTY',
      foInstrumentType: 'CALL',
      foStrikePrice: '24500',
      foExpiryDate: '2026-11-28',
    });
    const k2 = computeAssetKey({
      foUnderlying: 'NIFTY',
      foInstrumentType: 'CALL',
      foStrikePrice: '25000',
      foExpiryDate: '2026-11-28',
    });
    expect(k1).not.toBe(k2);
    expect(k1).toBe('fno:NIFTY:CE:024500:2026-11-28');
    expect(k2).toBe('fno:NIFTY:CE:025000:2026-11-28');
  });

  it('strike padding prevents 500 vs 5000 collision', () => {
    const k500 = computeAssetKey({
      foUnderlying: 'STK',
      foInstrumentType: 'CALL',
      foStrikePrice: '500',
      foExpiryDate: '2026-12-25',
    });
    const k5000 = computeAssetKey({
      foUnderlying: 'STK',
      foInstrumentType: 'CALL',
      foStrikePrice: '5000',
      foExpiryDate: '2026-12-25',
    });
    expect(k500).toBe('fno:STK:CE:000500:2026-12-25');
    expect(k5000).toBe('fno:STK:CE:005000:2026-12-25');
    expect(k500).not.toBe(k5000);
  });

  it('CE vs PE on same strike+expiry produce different keys', () => {
    const ce = computeAssetKey({
      foUnderlying: 'BANKNIFTY',
      foInstrumentType: 'CALL',
      foStrikePrice: '52000',
      foExpiryDate: '2026-11-26',
    });
    const pe = computeAssetKey({
      foUnderlying: 'BANKNIFTY',
      foInstrumentType: 'PUT',
      foStrikePrice: '52000',
      foExpiryDate: '2026-11-26',
    });
    expect(ce).not.toBe(pe);
  });

  it('FUTURES strike is normalized to zero regardless of input', () => {
    const k1 = computeAssetKey({
      foUnderlying: 'RELIANCE',
      foInstrumentType: 'FUTURES',
      foStrikePrice: '12345',
      foExpiryDate: '2026-11-28',
    });
    const k2 = computeAssetKey({
      foUnderlying: 'RELIANCE',
      foInstrumentType: 'FUTURES',
      foStrikePrice: null,
      foExpiryDate: '2026-11-28',
    });
    expect(k1).toBe(k2);
    expect(k1).toBe('fno:RELIANCE:FUT:000000:2026-11-28');
  });

  it('underlying is upper-cased', () => {
    const k = computeAssetKey({
      foUnderlying: 'nifty',
      foInstrumentType: 'CALL',
      foStrikePrice: '24500',
      foExpiryDate: '2026-11-28',
    });
    expect(k).toContain('NIFTY');
  });

  it('falls through to equity scheme when not F&O', () => {
    const k = computeAssetKey({ stockId: 'abc123' });
    expect(k).toBe('stock:abc123');
  });

  it('assetKeyFromTransaction handles FUTURES rows', () => {
    const k = assetKeyFromTransaction({
      stockId: null,
      fundId: null,
      isin: null,
      assetName: 'RELIANCE26NOVFUT',
      assetClass: 'FUTURES',
      optionType: null,
      strikePrice: null,
      expiryDate: new Date('2026-11-26T00:00:00Z'),
      stockSymbol: 'RELIANCE',
    });
    expect(k).toBe('fno:RELIANCE:FUT:000000:2026-11-26');
  });

  it('extractUnderlyingFromAssetName parses common contract symbols', () => {
    expect(extractUnderlyingFromAssetName('NIFTY26N28CE24500')).toBe('NIFTY');
    expect(extractUnderlyingFromAssetName('RELIANCE26NOVFUT')).toBe('RELIANCE');
  });
});
