import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import {
  COVERAGE_SOURCES_CHECKED_ON,
  DEFAULT_HEALTH_BENCHMARK,
  DEFAULT_SUPPORT_YEARS,
  LIFE_COVER_INCOME_MULTIPLE,
  MOTOR_THIRD_PARTY_RULE,
  computeCoverage,
  defaultAssumptions,
  requiredLifeCover,
  type CoverageAssumptions,
  type CoverageFacts,
} from './coverage.js';

const L = (lakh: number) => new Decimal(lakh).times(100_000);
const m = (d: Decimal) => d.toFixed(4);

function facts(over: Partial<CoverageFacts> = {}): CoverageFacts {
  return {
    asOf: '2026-09-11',
    figures: {
      monthlyIncome: m(L(1)), // ₹12 L a year
      monthlyExpenses: m(L(0.5)), // ₹6 L a year
      loansOutstanding: m(L(30)),
      liquidAssets: m(L(5)),
      otherInvestments: m(L(20)),
      lifeCover: m(L(100)),
      healthCover: m(L(5)),
    },
    lifePolicyCount: 1,
    goals: [
      { id: 'g1', name: 'Asha’s college', category: 'CHILD_EDUCATION', remaining: m(L(25)) },
      { id: 'g2', name: 'Europe trip', category: 'TRAVEL', remaining: m(L(4)) },
    ],
    healthPolicies: [
      {
        id: 'h1',
        insurer: 'Star Health',
        planName: 'Family Optima',
        sumAssured: m(L(5)),
        members: ['Self', 'Spouse'],
        roomRent: null,
        coPay: null,
      },
    ],
    vehicles: [],
    properties: [],
    homePolicies: [],
    lapsed: [],
    ...over,
  };
}

const run = (f: CoverageFacts, over: Partial<CoverageAssumptions> = {}) =>
  computeCoverage(f, { ...defaultAssumptions(f), ...over });

describe('rule of thumb', () => {
  it('is ten times annual income', () => {
    expect(LIFE_COVER_INCOME_MULTIPLE).toBe(10);
    expect(requiredLifeCover(L(12)).equals(L(120))).toBe(true);
  });
});

describe('defaultAssumptions', () => {
  it('is seeded from the user’s own figures', () => {
    const a = defaultAssumptions(facts());
    expect(new Decimal(a.annualIncome).equals(L(12))).toBe(true);
    expect(new Decimal(a.annualExpenses!).equals(L(6))).toBe(true);
    expect(new Decimal(a.loans).equals(L(30))).toBe(true);
    expect(a.supportYears).toBe(DEFAULT_SUPPORT_YEARS);
    expect(DEFAULT_SUPPORT_YEARS).toBe(20);
    expect(a.healthBenchmark).toBe(DEFAULT_HEALTH_BENCHMARK);
    // Education goals are counted by default; the trip isn't.
    expect(a.goalIds).toEqual(['g1']);
    expect(a.countLiquidAssets).toBe(true);
    expect(a.countInvestments).toBe(true);
    expect(a.parentsDependent).toBe('UNSURE');
  });

  it('leaves expenses blank when there is no spending signal', () => {
    const f = facts();
    f.figures.monthlyExpenses = null;
    expect(defaultAssumptions(f).annualExpenses).toBeNull();
  });
});

describe('life cover', () => {
  it('works out the needs-based gap from every part', () => {
    const { life } = run(facts());
    // 6 L × 20 years + 30 L loans + 25 L goal − 5 L liquid − 20 L investments = 150 L
    expect(new Decimal(life.needsBased.support).equals(L(120))).toBe(true);
    expect(new Decimal(life.needsBased.need).equals(L(150))).toBe(true);
    expect(new Decimal(life.needsBased.gap).equals(L(50))).toBe(true);
    expect(life.needsBased.basis).toBe('EXPENSES');
    expect(life.verdict).toBe('SHORT');
    expect(new Decimal(life.gap!).equals(L(50))).toBe(true);
    expect(life.reason).toMatch(/short/i);
    expect(life.next).toMatchObject({ kind: 'ADD_POLICY' });
  });

  it('shows the rule of thumb beside it', () => {
    const { life } = run(facts());
    expect(new Decimal(life.ruleOfThumb.need!).equals(L(120))).toBe(true);
    expect(new Decimal(life.ruleOfThumb.gap!).equals(L(20))).toBe(true);
    expect(life.ruleOfThumb.multiple).toBe(10);
  });

  it('uses income when yearly expenses are unknown', () => {
    const { life } = run(facts(), { annualExpenses: null });
    expect(life.needsBased.basis).toBe('INCOME');
    expect(new Decimal(life.needsBased.support).equals(L(240))).toBe(true);
  });

  it('recomputes when the user edits an assumption', () => {
    const base = run(facts());
    const noInvestments = run(facts(), { countInvestments: false });
    expect(new Decimal(noInvestments.life.needsBased.need).minus(base.life.needsBased.need).equals(L(20))).toBe(true);
    const tenYears = run(facts(), { supportYears: 10 });
    expect(new Decimal(tenYears.life.needsBased.support).equals(L(60))).toBe(true);
    expect(tenYears.life.verdict).toBe('COVERED');
    expect(tenYears.life.gap).toBe(m(new Decimal(0)));
  });

  it('never needs less than nothing', () => {
    const { life } = run(facts(), { supportYears: 0, loans: '0', goalIds: [] });
    expect(new Decimal(life.needsBased.need).isZero()).toBe(true);
    expect(life.verdict).toBe('COVERED');
  });

  it('says cover is missing when there is none', () => {
    const f = facts({ lifePolicyCount: 0 });
    f.figures.lifeCover = '0';
    const { life } = run(f);
    expect(life.verdict).toBe('MISSING');
    expect(life.reason).toMatch(/no active life cover/i);
  });

  it('asks for income when there is nothing to size it from', () => {
    const f = facts();
    f.figures.monthlyIncome = '0';
    f.figures.monthlyExpenses = null;
    const { life } = run(f, { loans: '0', goalIds: [] });
    expect(life.verdict).toBe('UNKNOWN');
    expect(life.ruleOfThumb.need).toBeNull();
    expect(life.next).toMatchObject({ kind: 'LINK', to: '/income' });
  });

  it('treats a half-typed amount as nothing rather than failing', () => {
    expect(() => run(facts(), { annualIncome: '', loans: '12,' })).not.toThrow();
  });
});

describe('health cover', () => {
  it('is missing when there is no health policy', () => {
    const f = facts({ healthPolicies: [] });
    f.figures.healthCover = '0';
    const { health } = run(f);
    expect(health.verdict).toBe('MISSING');
    expect(new Decimal(health.gap!).equals(DEFAULT_HEALTH_BENCHMARK)).toBe(true);
    expect(health.flags.map((x) => x.id)).toContain('no-health-cover');
  });

  it('is short of the benchmark the user sets', () => {
    const { health } = run(facts());
    expect(health.verdict).toBe('SHORT');
    expect(new Decimal(health.gap!).equals(L(5))).toBe(true);
    expect(run(facts(), { healthBenchmark: m(L(5)) }).health.verdict).toBe('COVERED');
  });

  it('flags room-rent limits and co-pay recorded on a policy', () => {
    const f = facts();
    f.healthPolicies[0] = { ...f.healthPolicies[0]!, roomRent: '1% of sum insured', coPay: 20 };
    const { health } = run(f);
    const texts = health.flags.map((x) => x.text).join(' ');
    expect(texts).toMatch(/room rent/i);
    expect(texts).toMatch(/1% of sum insured/);
    expect(texts).toMatch(/20% co-pay/);
  });

  it('asks about parents rather than assuming', () => {
    expect(run(facts()).health.flags.find((x) => x.id === 'parents')?.text).toMatch(/\?/);
    expect(run(facts(), { parentsDependent: 'NO' }).health.flags.find((x) => x.id === 'parents')).toBeUndefined();
    expect(run(facts(), { parentsDependent: 'YES' }).health.flags.find((x) => x.id === 'parents')?.text).toMatch(
      /none of your health policies list/i,
    );
    const withMother = facts();
    withMother.healthPolicies[0]!.members = ['Self', 'Mother'];
    expect(run(withMother, { parentsDependent: 'YES' }).health.flags.find((x) => x.id === 'parents')).toBeUndefined();
  });
});

describe('vehicles', () => {
  const car = { id: 'v1', label: 'Honda City', registrationNo: 'MH47BT5950', insuranceExpiry: null, motorPolicy: null };

  it('does not apply without a vehicle', () => {
    expect(run(facts()).vehicle.verdict).toBe('NOT_APPLICABLE');
  });

  it('flags a vehicle with no motor policy and cites the law', () => {
    const { vehicle } = run(facts({ vehicles: [car] }));
    expect(vehicle.verdict).toBe('MISSING');
    expect(vehicle.vehicles[0]!.state).toBe('NONE');
    expect(vehicle.rule).toBe(MOTOR_THIRD_PARTY_RULE);
    expect(MOTOR_THIRD_PARTY_RULE.source.url).toMatch(/^https:\/\/www\.indiacode\.nic\.in\//);
    expect(MOTOR_THIRD_PARTY_RULE.source.where).toMatch(/146/);
    expect(MOTOR_THIRD_PARTY_RULE.checkedOn).toBe(COVERAGE_SOURCES_CHECKED_ON);
    expect(COVERAGE_SOURCES_CHECKED_ON).toBe('2026-09-11');
  });

  it('flags insurance that has run out, even with a policy linked', () => {
    const { vehicle } = run(
      facts({
        vehicles: [{ ...car, insuranceExpiry: '2026-08-01', motorPolicy: { id: 'm1', insurer: 'ICICI Lombard', endsOn: null } }],
      }),
    );
    expect(vehicle.vehicles[0]!.state).toBe('EXPIRED');
    expect(vehicle.verdict).toBe('MISSING');
    expect(vehicle.vehicles[0]!.next).toMatchObject({ kind: 'LINK', to: '/insurance/m1' });
  });

  it('trusts a renewed policy over a stale registration record', () => {
    const { vehicle } = run(
      facts({
        vehicles: [{ ...car, insuranceExpiry: '2026-08-01', motorPolicy: { id: 'm1', insurer: 'ICICI Lombard', endsOn: '2027-07-31' } }],
      }),
    );
    expect(vehicle.vehicles[0]!.state).toBe('COVERED');
    expect(vehicle.verdict).toBe('COVERED');
  });

  it('counts registration-record cover but asks for the policy', () => {
    const { vehicle } = run(facts({ vehicles: [{ ...car, insuranceExpiry: '2027-01-15' }] }));
    expect(vehicle.vehicles[0]!.state).toBe('UNTRACKED');
    expect(vehicle.verdict).toBe('COVERED');
    expect(vehicle.vehicles[0]!.next).toMatchObject({ kind: 'ADD_POLICY' });
  });
});

describe('home', () => {
  it('does not apply without a property', () => {
    expect(run(facts()).home.verdict).toBe('NOT_APPLICABLE');
  });

  it('notes a property with no home policy, gently', () => {
    const { home } = run(facts({ properties: [{ id: 'p1', name: 'Andheri flat', kind: 'OWNED' }] }));
    expect(home.verdict).toBe('MISSING');
    expect(home.optional).toBe(true);
    expect(home.reason).toMatch(/worth considering/i);
  });

  it('is covered with an active home policy', () => {
    const { home } = run(
      facts({
        properties: [{ id: 'p1', name: 'Andheri flat', kind: 'OWNED' }],
        homePolicies: [{ id: 'hp', insurer: 'HDFC Ergo', planName: null }],
      }),
    );
    expect(home.verdict).toBe('COVERED');
  });
});

describe('also worth a look', () => {
  it('lists lapsed policies', () => {
    const r = run(facts({ lapsed: [{ id: 'x', insurer: 'LIC', type: 'ENDOWMENT', planName: 'Jeevan Anand' }] }));
    const flag = r.alsoWorthALook.find((x) => x.id === 'lapsed:x');
    expect(flag?.text).toMatch(/LIC — Jeevan Anand has lapsed/);
    expect(flag?.next).toMatchObject({ to: '/insurance/x' });
  });

  it('flags life cover that does not cover the loans', () => {
    const f = facts();
    f.figures.lifeCover = m(L(20));
    const flag = run(f).alsoWorthALook.find((x) => x.id === 'loans-uncovered');
    expect(flag?.text).toMatch(/doesn’t cover your loans/);
    expect(run(facts()).alsoWorthALook.find((x) => x.id === 'loans-uncovered')).toBeUndefined();
  });
});
