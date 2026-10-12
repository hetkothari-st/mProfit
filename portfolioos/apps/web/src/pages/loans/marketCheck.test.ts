import { describe, it, expect } from 'vitest';
import type { LoanMarketCheckWire } from '@everypaisa/shared';
import { decodeEmiUrl } from '@/pages/emi/emiUrl';
import { DEFAULT_SWITCHING_INPUT, benchmarkLine, calculatorHref, cardModel, parseCosts } from './marketCheck';

const CHECK: LoanMarketCheckWire = {
  loanId: 'l1', status: 'ACTIVE', loanType: 'HOME', rateLoanType: 'HOME', lender: 'HDFC Bank',
  rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null, currentRatePct: '9.10',
  outstanding: '3000000.00', remainingMonths: 180, nextEmiDate: '2026-11-05',
  market: { sourceId: 'sbi.home', lender: 'SBI', minRatePct: '8.35', asOf: '2026-10-12T02:00:00.000Z', sourceUrl: 'https://sbi.bank.in/x' },
  benchmark: null,
};

describe('cardModel', () => {
  it('READY with the default switching costs', () => {
    const m = cardModel(CHECK, DEFAULT_SWITCHING_INPUT);
    if (m.kind !== 'READY') throw new Error(m.kind);
    expect(m.result.newEmi.toFixed(0)).toBe('29280');
    expect(m.result.switchingCost.toFixed(2)).toBe('25000.00');
    expect(m.result.netSaving.toFixed(2)).toBe('214108.70');
    expect(m.result.breakEvenMonth).toBe(19);
  });
  it('the empty and edge states', () => {
    expect(cardModel({ ...CHECK, rateLoanType: null, market: null }, DEFAULT_SWITCHING_INPUT).kind).toBe('NO_MARKET_DATA');
    expect(cardModel({ ...CHECK, market: null }, DEFAULT_SWITCHING_INPUT).kind).toBe('NO_RATES');
    expect(cardModel({ ...CHECK, remainingMonths: 0 }, DEFAULT_SWITCHING_INPUT).kind).toBe('CLOSED');
    expect(cardModel({ ...CHECK, outstanding: '0.00' }, DEFAULT_SWITCHING_INPUT).kind).toBe('CLOSED');
    expect(cardModel({ ...CHECK, currentRatePct: '8.35' }, DEFAULT_SWITCHING_INPUT).kind).toBe('AT_OR_BELOW');
    expect(cardModel(CHECK, { processingPct: 'abc', otherCharges: '0' })).toMatchObject({ kind: 'INVALID_COSTS', field: 'processingPct' });
  });
});

describe('parseCosts', () => {
  it('accepts grouped rupees and refuses junk or a fee above 10 %', () => {
    const ok = parseCosts({ processingPct: '0.5', otherCharges: '₹10,000' });
    expect(ok.ok && ok.otherCharges.toString()).toBe('10000');
    expect(parseCosts({ processingPct: '12', otherCharges: '0' })).toMatchObject({ ok: false, field: 'processingPct' });
    expect(parseCosts({ processingPct: '0.5', otherCharges: '-5' })).toMatchObject({ ok: false, field: 'otherCharges' });
  });
});

describe('calculatorHref', () => {
  it('opens /emi with the outstanding balance, market rate, remaining months and switching costs', () => {
    const href = calculatorHref(CHECK, DEFAULT_SWITCHING_INPUT, new Date('2026-10-12T05:00:00Z'))!;
    expect(href.startsWith('/emi?v=1')).toBe(true);
    const decoded = decodeEmiUrl(href.slice(href.indexOf('?')));
    expect(decoded.error).toBeUndefined();
    expect(decoded.tab).toBe('calculate');
    expect(decoded.calc).toMatchObject({
      mode: 'EMI', principal: '30,00,000', ratePct: '8.35', tenure: '180', tenureUnit: 'M', firstEmiDate: '2026-11-05',
      feesOn: true, feeKind: 'PCT', feeValue: '0.5', gstPct: '0', otherCharges: '10000', loanKind: 'HOME_SELF',
    });
  });
  it('writes tiny costs in plain decimals, never exponent form', () => {
    const href = calculatorHref(CHECK, { processingPct: '0.0000001', otherCharges: '0.0000001' }, new Date('2026-10-12T05:00:00Z'))!;
    expect(href).not.toMatch(/e-/i);
    const decoded = decodeEmiUrl(href.slice(href.indexOf('?')));
    expect(decoded.calc).toMatchObject({ feeValue: '0.0000001', otherCharges: '0.0000001' });
  });
  it('is null when the calculator cannot take the loan', () => {
    expect(calculatorHref({ ...CHECK, market: null }, DEFAULT_SWITCHING_INPUT)).toBeNull();
    expect(calculatorHref({ ...CHECK, remainingMonths: 481 }, DEFAULT_SWITCHING_INPUT)).toBeNull();
    expect(calculatorHref({ ...CHECK, remainingMonths: 0 }, DEFAULT_SWITCHING_INPUT)).toBeNull();
    expect(calculatorHref(CHECK, { processingPct: 'x', otherCharges: '0' })).toBeNull();
  });
});

describe('benchmarkLine', () => {
  it('repo with a change, MCLR with a rise, and no change', () => {
    expect(benchmarkLine({ kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } }))
      .toBe('RBI repo rate 5.25% - cut by 0.25% on 08/10/2026');
    expect(benchmarkLine({ kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.75', effectiveDate: '2026-11-01', lastChange: { deltaPct: '0.10', date: '2026-11-01' } }))
      .toBe('SBI 1-year MCLR 8.75% - raised by 0.10% on 01/11/2026');
    expect(benchmarkLine({ kind: 'REPO', lender: null, tenor: null, ratePct: '5.50', effectiveDate: '2026-06-06', lastChange: null }))
      .toBe('RBI repo rate 5.50% (as of 06/06/2026)');
  });
});
