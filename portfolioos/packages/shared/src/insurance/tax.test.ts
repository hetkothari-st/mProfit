import { describe, it, expect } from 'vitest';
import {
  TAX_RULES,
  buildTaxSummary,
  taxYearOf,
  parseFinancialYear,
  type TaxPaymentInput,
  type TaxPolicyInput,
} from './tax.js';

const OFFICIAL = /^https:\/\/(www\.incometaxindia\.gov\.in|egazette\.gov\.in)\//;

const policy = (over: Partial<TaxPolicyInput>): TaxPolicyInput => ({
  id: 'p1',
  insurer: 'HDFC Life',
  planName: null,
  type: 'ENDOWMENT',
  status: 'ACTIVE',
  sumAssured: '1000000',
  premiumAmount: '50000',
  premiumFrequency: 'ANNUAL',
  startDate: '2020-05-01',
  taxBucket: null,
  seniorCitizen: null,
  ...over,
});

const pay = (policyId: string, paidOn: string, amount: string, periodFrom = paidOn, periodTo?: string): TaxPaymentInput => ({
  policyId,
  paidOn,
  amount,
  periodFrom,
  periodTo: periodTo ?? `${Number.parseInt(periodFrom.slice(0, 4), 10) + 1}${periodFrom.slice(4)}`,
});

describe('financial years', () => {
  it('runs April to March', () => {
    expect(taxYearOf('2026-04-01')).toBe('2026-27');
    expect(taxYearOf('2027-03-31')).toBe('2026-27');
    expect(taxYearOf('2026-03-31')).toBe('2025-26');
    expect(taxYearOf('2099-12-01')).toBe('2099-00');
  });

  it('parses only a real year pair', () => {
    expect(parseFinancialYear('2026-27')).toEqual({ fy: '2026-27', from: '2026-04-01', to: '2027-03-31' });
    expect(parseFinancialYear('2026-28')).toBeNull();
    expect(parseFinancialYear('26-27')).toBeNull();
  });
});

describe('before the Income-tax Act, 2025', () => {
  it("doesn't work out years the 1961 Act covered", () => {
    const s = buildTaxSummary('2025-26', [policy({})], [pay('p1', '2025-06-01', '50000')]);
    expect(s.covered).toBe(false);
    expect(s.notCoveredReason).toMatch(/1961/);
    expect(s.life.lines).toEqual([]);
  });
});

describe('life premiums (section 123)', () => {
  it('counts premiums paid in the year, up to 10% of the sum assured', () => {
    const s = buildTaxSummary(
      '2026-27',
      [policy({ sumAssured: '400000' }), policy({ id: 'p2', type: 'TERM', sumAssured: '10000000', premiumAmount: '20000' })],
      [
        pay('p1', '2026-05-01', '50000'),
        pay('p1', '2026-03-20', '50000'), // last year
        pay('p2', '2026-10-01', '20000'),
      ],
    );
    const [endowment, term] = s.life.lines;
    expect(endowment).toMatchObject({ paid: '50000.00', capPercent: 10, cap: '40000.00', eligible: '40000.00', capped: true });
    expect(term).toMatchObject({ paid: '20000.00', eligible: '20000.00', capped: false });
    expect(s.life.total).toBe('60000.00');
    expect(s.life.claimable).toBe('60000.00');
  });

  it('allows 20% of the sum assured on a policy issued before April 2012', () => {
    const s = buildTaxSummary(
      '2026-27',
      [policy({ startDate: '2011-06-01', sumAssured: '200000' })],
      [pay('p1', '2026-06-01', '50000')],
    );
    expect(s.life.lines[0]).toMatchObject({ capPercent: 20, eligible: '40000.00' });
  });

  it('stops at the ₹1,50,000 limit', () => {
    const s = buildTaxSummary(
      '2026-27',
      [policy({ sumAssured: '5000000', premiumAmount: '200000' })],
      [pay('p1', '2026-06-01', '200000')],
    );
    expect(s.life.total).toBe('200000.00');
    expect(s.life.limit).toBe('150000.00');
    expect(s.life.claimable).toBe('150000.00');
  });
});

describe('health premiums (section 126)', () => {
  const health = (over: Partial<TaxPolicyInput>) =>
    policy({ type: 'HEALTH', sumAssured: '500000', premiumAmount: '30000', ...over });

  it('caps you-and-family and parents separately at ₹25,000', () => {
    const s = buildTaxSummary(
      '2026-27',
      [health({ id: 'self', taxBucket: 'SELF_FAMILY' }), health({ id: 'mum', taxBucket: 'PARENTS', premiumAmount: '20000' })],
      [pay('self', '2026-07-01', '30000'), pay('mum', '2026-08-01', '20000')],
    );
    expect(s.health.selfFamily).toMatchObject({ limit: '25000.00', paid: '30000.00', claimable: '25000.00', senior: false });
    expect(s.health.parents).toMatchObject({ limit: '25000.00', paid: '20000.00', claimable: '20000.00' });
    expect(s.health.claimable).toBe('45000.00');
  });

  it('raises the limit to ₹50,000 for a senior citizen', () => {
    const s = buildTaxSummary(
      '2026-27',
      [health({ id: 'mum', taxBucket: 'PARENTS', seniorCitizen: true, premiumAmount: '60000' })],
      [pay('mum', '2026-08-01', '60000')],
    );
    expect(s.health.parents).toMatchObject({ limit: '50000.00', senior: true, claimable: '50000.00' });
  });

  it('spreads a premium paid for several years over those years', () => {
    const p = health({ id: 'self', taxBucket: 'SELF_FAMILY', premiumAmount: '60000' });
    // Three years' cover paid in one go in FY 2026-27. The cover runs into
    // FY 2029-30 (to May 2029), so four tax years share it.
    const payments = [pay('self', '2026-06-01', '60000', '2026-06-01', '2029-06-01')];
    for (const fy of ['2026-27', '2027-28', '2028-29', '2029-30']) {
      const line = buildTaxSummary(fy, [p], payments).health.selfFamily.lines[0];
      expect(line).toMatchObject({ paid: '15000.00', spread: true });
    }
    expect(buildTaxSummary('2030-31', [p], payments).health.selfFamily.lines).toEqual([]);
  });

  it("keeps a health policy that hasn't been sorted out of the totals", () => {
    const s = buildTaxSummary('2026-27', [health({ id: 'x' })], [pay('x', '2026-07-01', '30000')]);
    expect(s.health.unassigned).toHaveLength(1);
    expect(s.health.claimable).toBe('0.00');
  });
});

describe('tax-free maturity (Schedule II)', () => {
  it('passes a policy whose premium is within 10% of the sum assured', () => {
    const s = buildTaxSummary('2026-27', [policy({ premiumAmount: '50000', sumAssured: '1000000' })], []);
    expect(s.maturity[0]).toMatchObject({ ratioPercent: '5.00', limitPercent: 10, withinRatio: true, verdict: 'LIKELY_EXEMPT' });
  });

  it('flags a premium above 10% of the sum assured', () => {
    const s = buildTaxSummary('2026-27', [policy({ premiumAmount: '150000', sumAssured: '1000000' })], []);
    expect(s.maturity[0]).toMatchObject({ ratioPercent: '15.00', withinRatio: false, verdict: 'MAY_BE_TAXABLE' });
  });

  it('counts the ₹2,50,000 total on ULIPs issued from February 2021', () => {
    const s = buildTaxSummary(
      '2026-27',
      [
        policy({ id: 'u1', type: 'ULIP', startDate: '2022-01-10', premiumAmount: '150000', sumAssured: '1500000' }),
        policy({ id: 'u2', type: 'ULIP', startDate: '2023-01-10', premiumAmount: '150000', sumAssured: '1500000' }),
      ],
      [],
    );
    expect(s.maturity.map((m) => [m.aggregateLimit, m.aggregatePremium, m.verdict])).toEqual([
      ['250000.00', '300000.00', 'MAY_BE_TAXABLE'],
      ['250000.00', '300000.00', 'MAY_BE_TAXABLE'],
    ]);
  });

  it('counts the ₹5,00,000 total on other policies issued from April 2023, term plans included', () => {
    const s = buildTaxSummary(
      '2026-27',
      [
        policy({ id: 'e1', startDate: '2024-01-10', premiumAmount: '40000', premiumFrequency: 'QUARTERLY', sumAssured: '2000000' }),
        policy({ id: 't1', type: 'TERM', startDate: '2024-01-10', premiumAmount: '30000', sumAssured: '10000000' }),
      ],
      [],
    );
    expect(s.maturity).toHaveLength(1);
    expect(s.maturity[0]).toMatchObject({ aggregateLimit: '500000.00', aggregatePremium: '190000.00', verdict: 'LIKELY_EXEMPT' });
  });

  it('sets no premium condition before April 2003', () => {
    const s = buildTaxSummary('2026-27', [policy({ startDate: '2001-01-01', premiumAmount: '900000' })], []);
    expect(s.maturity[0]).toMatchObject({ limitPercent: null, verdict: 'LIKELY_EXEMPT' });
  });
});

describe('the rules we quote', () => {
  it('cites an official source for every rule', () => {
    const all = [...TAX_RULES.regime, ...TAX_RULES.life, ...TAX_RULES.health, ...TAX_RULES.maturity];
    expect(all.length).toBeGreaterThan(10);
    for (const r of all) {
      expect(r.source.url).toMatch(OFFICIAL);
      expect(r.source.where).toBeTruthy();
    }
  });
});
