/**
 * Act on it, Task 5: the new suggestion types (spec §7). Each fires on its
 * example, stays silent when an input is missing, and promises what it says.
 */
import { describe, it, expect } from 'vitest';
import { idleCashParkingRule } from '../../../../src/services/advisor/rules/idleCashParking.rule.js';
import { regularToDirectRule } from '../../../../src/services/advisor/rules/regularToDirect.rule.js';
import { ltcgBookingRule } from '../../../../src/services/advisor/rules/ltcgBooking.rule.js';
import { stoppedSipRule } from '../../../../src/services/advisor/rules/stoppedSip.rule.js';
import { fdMaturityRule } from '../../../../src/services/advisor/rules/fdMaturity.rule.js';
import { loanRefinanceRule } from '../../../../src/services/advisor/rules/loanRefinance.rule.js';
import { advanceTaxRule } from '../../../../src/services/advisor/rules/advanceTax.rule.js';
import { emergencyFundRule } from '../../../../src/services/advisor/rules/emergencyFund.rule.js';
import { healthCoverRule } from '../../../../src/services/advisor/rules/healthCover.rule.js';
import { fundUnderperformingRule } from '../../../../src/services/advisor/rules/fundUnderperforming.rule.js';
import { reconcileDrafts } from '../../../../src/services/advisor/reconcile.js';
import { balances, d, makeExtra, makeFacts } from './fixtures.js';

const NOV = new Date('2026-11-06T00:00:00Z');

// ₹3,00,000 in the bank for months, ₹40,000 a month spending: 3 months is
// ₹1,20,000, so ₹1,80,000 is resting. At 6.5% vs 3%: ₹6,300 a year.
const idleFacts = (over: Parameters<typeof makeExtra>[0] = {}) =>
  makeFacts({
    asOf: NOV,
    extra: makeExtra({
      monthlySpending: d(40_000),
      bank: {
        balanceMonths: balances([90_000, 100_000, 110_000, 150_000, 200_000, 250_000, 260_000, 270_000, 280_000, 290_000, 295_000, 300_000]),
        latestBalance: d(300_000),
        savingsRatePct: 3,
        savingsRateAssumed: false,
      },
      ...over,
    }),
  });

describe('idle savings → liquid fund', () => {
  it('fires on the example: ₹1,80,000 resting, ≈ ₹6,300 more a year', () => {
    const [r] = idleCashParkingRule.evaluate(idleFacts());
    expect(r).toMatchObject({ category: 'IDLE_CASH_PARKING', urgentUntil: null });
    expect(r!.promise).toMatchObject({ gainInr: '6300.00', riskBand: 'LOW', costInr: '0.00', liquidity: '1 working day', confidence: 'HIGH' });
    expect(r!.measurement).toMatchObject({ method: 'NAV_VS_CASH', horizonDays: 365, baseline: { amountInr: '180000.00', savingsRatePct: 3 } });
    expect(r!.rationale.replace(/[₹,]/g, '')).toContain('180000.00');
    expect(r!.headline).toContain('₹1,80,000');
  });

  it('is medium confidence and says so when the savings rate is assumed', () => {
    const [r] = idleCashParkingRule.evaluate(idleFacts({ bank: { ...idleFacts().extra!.bank, savingsRateAssumed: true } }));
    expect(r!.promise.confidence).toBe('MEDIUM');
    expect(r!.rationale).toMatch(/assum/i);
  });

  it('stays silent without spending, with too few rested months, with stale balances, or for a small gain', () => {
    expect(idleCashParkingRule.evaluate(idleFacts({ monthlySpending: null }))).toEqual([]);
    const base = idleFacts().extra!.bank;
    expect(idleCashParkingRule.evaluate(idleFacts({ bank: { ...base, balanceMonths: balances([300_000, 300_000, 300_000, 300_000, 300_000]) } }))).toEqual([]);
    expect(idleCashParkingRule.evaluate(idleFacts({ bank: { ...base, balanceMonths: balances(Array(12).fill(300_000), '2026-07') } }))).toEqual([]);
    expect(idleCashParkingRule.evaluate(idleFacts({ bank: { ...base, latestBalance: d(160_000), balanceMonths: balances(Array(12).fill(160_000)) } }))).toEqual([]);
    expect(idleCashParkingRule.evaluate(makeFacts({ asOf: NOV }))).toEqual([]);
  });
});

describe('regular → direct', () => {
  const plan = { holdingKey: 'fund:a', portfolioId: 'pf-1', fundId: 'f-reg', schemeName: 'Test Flexi Cap - Regular', valueInr: d(500_000), regularTerPct: 1.8, directFundId: 'f-dir', directSchemeCode: 'D1', directName: 'Test Flexi Cap - Direct', directTerPct: 0.6 };
  it('saves ₹6,000 a year on ₹5,00,000 at 1.8% vs 0.6%', () => {
    const [r] = regularToDirectRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ regularPlans: [plan] }) }));
    expect(r!.promise.gainInr).toBe('6000.00');
    expect(r!.action).toEqual([expect.objectContaining({ direction: 'SELL', amountInr: '500000.00' })]);
    expect(r!.measurement).toMatchObject({ method: 'DIRECT_VS_REGULAR', baseline: { regularFundId: 'f-reg', directFundId: 'f-dir' } });
    expect(r!.rationale).toContain('Test Flexi Cap - Direct');
  });
  it('is silent under ₹500 a year', () => {
    expect(regularToDirectRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ regularPlans: [{ ...plan, valueInr: d(20_000) }] }) }))).toEqual([]);
  });
});

describe('book gains up to the tax-free limit', () => {
  const ltcg = { fy: '2025-26', realised: d(25_000), exemption: d(125_000), candidates: [{ portfolioId: 'pf-1', assetName: 'Test Bluechip', isin: 'INE000T01019', gain: d(150_000), value: d(600_000) }] };
  it('books ₹1,00,000 of gain (sell ₹4,00,000), saving ₹12,500 of future tax', () => {
    const [r] = ltcgBookingRule.evaluate(makeFacts({ asOf: new Date('2026-02-10T00:00:00Z'), extra: makeExtra({ ltcg }) }));
    expect(r!.action).toEqual([expect.objectContaining({ direction: 'SELL', amountInr: '400000.00' })]);
    expect(r!.promise.gainInr).toBe('12500.00');
    expect(r!.expiresAt!.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(r!.urgentUntil).toBeNull();
  });
  it('is urgent in the last week of March, and silent before February', () => {
    expect(ltcgBookingRule.evaluate(makeFacts({ asOf: new Date('2026-03-27T00:00:00Z'), extra: makeExtra({ ltcg }) }))[0]!.urgentUntil).not.toBeNull();
    expect(ltcgBookingRule.evaluate(makeFacts({ asOf: new Date('2026-01-10T00:00:00Z'), extra: makeExtra({ ltcg }) }))).toEqual([]);
  });
});

describe('stopped SIP in a dip', () => {
  const sips = [{ sipId: 's1', name: 'Test Index Fund', fundId: 'f1', monthlyAmount: d(10_000), missedMonths: ['2026-09', '2026-10'] }];
  const indexMonthly = [{ month: '2026-07', close: 100 }, { month: '2026-08', close: 104 }, { month: '2026-09', close: 96 }, { month: '2026-10', close: 97 }];
  it('fires when instalments stopped while the market fell over 5%', () => {
    const [r] = stoppedSipRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ sips, indexMonthly }) }));
    expect(r).toMatchObject({ category: 'STOPPED_SIP' });
    expect(r!.measurement).toMatchObject({ method: 'SIP_UNITS', baseline: { monthlyAmountInr: '10000.00', missedMonths: ['2026-09', '2026-10'] } });
  });
  it('is silent without a fall, or without a missed month', () => {
    expect(stoppedSipRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ sips, indexMonthly: indexMonthly.map((m) => ({ ...m, close: 100 })) }) }))).toEqual([]);
    expect(stoppedSipRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ sips: [{ ...sips[0]!, missedMonths: [] }], indexMonthly }) }))).toEqual([]);
  });
});

describe('FD maturing', () => {
  const fd = (date: string) => [{ key: 'pf|fd1', issuer: 'Test Bank', amount: d(200_000), ratePct: 7, maturityDate: new Date(`${date}T00:00:00Z`) }];
  it('fires within 14 days, urgent within 7, silent further out', () => {
    expect(fdMaturityRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ fds: fd('2026-11-15') }) }))[0]).toMatchObject({ category: 'FD_MATURITY', urgentUntil: null });
    expect(fdMaturityRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ fds: fd('2026-11-10') }) }))[0]!.urgentUntil).not.toBeNull();
    expect(fdMaturityRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ fds: fd('2026-12-20') }) }))).toEqual([]);
  });
});

describe('loan refinance', () => {
  const loan = { loanId: 'l1', lender: 'Test HFC', loanType: 'HOME', currentRatePct: 9.4, marketRatePct: 8.4, marketLender: 'Test Bank', outstanding: d(4_000_000), remainingMonths: 180, netSaving: d(285_000), breakEvenMonth: 4 };
  it('promises the saving after switching costs', () => {
    const [r] = loanRefinanceRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ loans: [loan] }) }));
    expect(r!.promise.gainInr).toBe('285000.00');
    expect(r!.measurement.method).toBe('RATE_DIFF');
  });
  it('is silent for a small loan or a short remaining term', () => {
    expect(loanRefinanceRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ loans: [{ ...loan, outstanding: d(300_000) }] }) }))).toEqual([]);
    expect(loanRefinanceRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ loans: [{ ...loan, remainingMonths: 12 }] }) }))).toEqual([]);
  });
});

describe('advance tax due', () => {
  const at = { label: '15 December', dueDate: new Date('2026-12-15T23:59:59Z'), shortfall: d(40_000), interest: d(1_200) };
  it('urgent within a week, promising the interest avoided', () => {
    const [r] = advanceTaxRule.evaluate(makeFacts({ asOf: new Date('2026-12-10T00:00:00Z'), extra: makeExtra({ advanceTax: at }) }));
    expect(r!.promise.gainInr).toBe('1200.00');
    expect(r!.urgentUntil).not.toBeNull();
  });
  it('silent more than 15 days out', () => {
    expect(advanceTaxRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ advanceTax: at }) }))).toEqual([]);
  });
});

describe('emergency fund and health cover (not measured)', () => {
  it('flags a thin emergency fund only when spending is known', () => {
    const facts = makeFacts({ asOf: NOV, liquidity: { liquidAssets: d(50_000), monthlyExpenses: d(40_000), emergencyFundTarget: d(240_000), surplusOverTarget: d(-190_000) }, extra: makeExtra({ monthlySpending: d(40_000) }) });
    expect(emergencyFundRule.evaluate(facts)[0]).toMatchObject({ category: 'EMERGENCY_FUND', measurement: { method: 'NOT_MEASURED' } });
    expect(emergencyFundRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra() }))).toEqual([]);
  });
  it('flags health cover under ₹10 lakh, only when a policy is recorded', () => {
    expect(healthCoverRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ healthCover: { sumInsured: d(300_000), policies: 1 } }) }))[0]).toMatchObject({ category: 'HEALTH_COVER' });
    expect(healthCoverRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ healthCover: { sumInsured: d(0), policies: 0 } }) }))).toEqual([]);
    expect(healthCoverRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ healthCover: { sumInsured: d(1_000_000), policies: 1 } }) }))).toEqual([]);
  });
});

describe('weak fund', () => {
  it('suggests selling a critically flagged fund', () => {
    const weakFunds = [{ holdingKey: 'fund:w', schemeCode: 'W1', schemeName: 'Test Laggard Fund', valueInr: d(200_000), findingCode: 'HIGH_DOWN_CAPTURE', headline: 'Falls further than its benchmark in bad months', confidence: 0.9 }];
    const [r] = fundUnderperformingRule.evaluate(makeFacts({ asOf: NOV, extra: makeExtra({ weakFunds }) }));
    expect(r!.action[0]).toMatchObject({ direction: 'SELL', amountInr: '200000.00' });
    expect(r!.measurement.method).toBe('FUND_VS_ALT');
  });
});

describe('reconcile', () => {
  it('keeps idle-cash parking over cash deployment without a risk profile, and the reverse with one', () => {
    const idle = idleCashParkingRule.evaluate(idleFacts())[0]!;
    const deploy = { ...idle, ruleId: 'CASH_DEPLOYMENT', category: 'CASH_DEPLOYMENT' as const, dedupeKey: 'CASH_DEPLOYMENT:X' };
    const noProfile = makeFacts({ riskProfile: { assessmentId: null, category: null, age: null, taxSlabPct: null, assessedAt: null } });
    expect(reconcileDrafts([idle, deploy], noProfile).map((x) => x.category)).toEqual(['IDLE_CASH_PARKING']);
    expect(reconcileDrafts([idle, deploy], makeFacts()).map((x) => x.category)).toEqual(['CASH_DEPLOYMENT']);
  });
  it('a weak fund wins over regular → direct on the same holding', () => {
    const weak = { ...idleCashParkingRule.evaluate(idleFacts())[0]!, category: 'FUND_UNDERPERFORMING' as const, inputsUsed: { holdingKey: 'fund:a' } };
    const r2d = { ...weak, category: 'REGULAR_TO_DIRECT' as const, inputsUsed: { holdingKey: 'fund:a' } };
    expect(reconcileDrafts([r2d, weak], makeFacts()).map((x) => x.category)).toEqual(['FUND_UNDERPERFORMING']);
  });
});
