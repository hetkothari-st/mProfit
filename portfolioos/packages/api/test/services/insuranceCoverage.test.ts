import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Decimal } from 'decimal.js';

// Insurance hub, phase 3: the coverage check reads its figures from the
// services that already own them (income, emergency fund, dashboard loans,
// goals, policies, vehicles, properties) — never its own queries — and hands
// the web the raw facts plus seeded defaults. Verdicts are the shared
// computeCoverage's job; this only checks the facts are right.

const db = vi.hoisted(() => ({}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: db,
  runInTransaction: (fn: (tx: typeof db) => unknown) => fn(db),
}));

const svc = vi.hoisted(() => ({
  activeMonthlyIncomeTotal: vi.fn(),
  getEmergencyFundInputs: vi.fn(),
  getDashboardNetWorth: vi.fn(),
  listGoals: vi.fn(),
  listPolicies: vi.fn(),
  listVehicles: vi.fn(),
  listOwnedProperties: vi.fn(),
  listRentalProperties: vi.fn(),
}));
vi.mock('../../src/services/income.service.js', () => ({ activeMonthlyIncomeTotal: svc.activeMonthlyIncomeTotal }));
vi.mock('../../src/services/healthScore.service.js', () => ({ getEmergencyFundInputs: svc.getEmergencyFundInputs }));
vi.mock('../../src/services/dashboard.service.js', () => ({ getDashboardNetWorth: svc.getDashboardNetWorth }));
vi.mock('../../src/services/goals.service.js', () => ({ listGoals: svc.listGoals }));
vi.mock('../../src/services/insurance.service.js', () => ({ listPolicies: svc.listPolicies }));
vi.mock('../../src/services/vehicles.service.js', () => ({ listVehicles: svc.listVehicles }));
vi.mock('../../src/services/realEstate.service.js', () => ({ listProperties: svc.listOwnedProperties }));
vi.mock('../../src/services/rental.service.js', () => ({ listProperties: svc.listRentalProperties }));

import { getCoverage } from '../../src/services/insuranceCoverage.service.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function policy(over: Record<string, unknown>) {
  return {
    id: 'p',
    insurer: 'LIC',
    type: 'TERM',
    planName: null,
    status: 'ACTIVE',
    sumAssured: '10000000',
    vehicleId: null,
    maturityDate: null,
    healthCoverDetails: null,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-11T06:00:00Z'));
  for (const fn of Object.values(svc)) fn.mockReset();

  svc.activeMonthlyIncomeTotal.mockResolvedValue(new Decimal('150000'));
  svc.getEmergencyFundInputs.mockResolvedValue({
    liquidAssets: new Decimal('400000'),
    monthlyExpenses: new Decimal('60000'),
    target: new Decimal('360000'),
    surplus: new Decimal('40000'),
    hasExpenseSignal: true,
  });
  svc.getDashboardNetWorth.mockResolvedValue({
    portfolio: { currentValue: '2400000.0000' },
    liabilities: { totalOutstanding: '3500000.0000' },
  });
  svc.listGoals.mockResolvedValue([
    { id: 'g1', name: 'College', category: 'CHILD_EDUCATION', status: 'ACTIVE', remaining: '2500000.0000' },
    { id: 'g2', name: 'Old car', category: 'VEHICLE_PURCHASE', status: 'ACHIEVED', remaining: '0.0000' },
  ]);
  svc.listPolicies.mockResolvedValue([
    policy({ id: 't1', sumAssured: '10000000' }),
    policy({ id: 't2', type: 'ENDOWMENT', status: 'LAPSED', planName: 'Jeevan Anand', sumAssured: '500000' }),
    policy({
      id: 'h1',
      type: 'HEALTH',
      insurer: 'Star Health',
      planName: 'Family Optima',
      sumAssured: '500000',
      healthCoverDetails: { members: ['Self', 'Spouse'], roomRent: '1% of SI', coPay: 10 },
    }),
    policy({ id: 'm1', type: 'MOTOR', insurer: 'ICICI Lombard', vehicleId: 'v1', maturityDate: day('2027-03-31') }),
    policy({ id: 'm0', type: 'MOTOR', insurer: 'Old Insurer', vehicleId: 'v2', status: 'LAPSED' }),
    policy({ id: 'hp', type: 'HOME', insurer: 'HDFC Ergo', status: 'SURRENDERED' }),
  ]);
  svc.listVehicles.mockResolvedValue([
    { id: 'v1', make: 'Honda', model: 'City', registrationNo: 'MH47BT5950', insuranceExpiry: day('2027-03-31'), insurancePolicyId: null },
    { id: 'v2', make: null, model: null, registrationNo: 'MH01AB1234', insuranceExpiry: day('2026-05-01'), insurancePolicyId: null },
  ]);
  svc.listOwnedProperties.mockResolvedValue([
    { id: 'o1', name: 'Andheri flat', status: 'SELF_OCCUPIED', propertyType: 'APARTMENT', isActive: true, rentalPropertyId: 'r1' },
    { id: 'o2', name: 'Old flat', status: 'SOLD', propertyType: 'APARTMENT', isActive: true, rentalPropertyId: null },
    { id: 'o3', name: 'Farm plot', status: 'VACANT', propertyType: 'PLOT_LAND', isActive: true, rentalPropertyId: null },
  ]);
  svc.listRentalProperties.mockResolvedValue([
    { id: 'r1', name: 'Andheri flat (rented)', propertyType: 'RESIDENTIAL', isActive: true },
    { id: 'r2', name: 'Pune shop', propertyType: 'COMMERCIAL', isActive: true },
    { id: 'r3', name: 'Parking bay', propertyType: 'PARKING', isActive: true },
  ]);
});
afterEach(() => vi.useRealTimers());

describe('getCoverage', () => {
  it('asks every source for this user only', async () => {
    await getCoverage('u1');
    for (const fn of Object.values(svc)) expect(fn).toHaveBeenCalledWith('u1');
  });

  it('returns the raw figures as money strings', async () => {
    const out = await getCoverage('u1');
    expect(out.asOf).toBe('2026-09-11');
    expect(out.figures).toEqual({
      monthlyIncome: '150000.0000',
      monthlyExpenses: '60000.0000',
      loansOutstanding: '3500000.0000',
      liquidAssets: '400000.0000',
      // Portfolio value less what's already counted as liquid.
      otherInvestments: '2000000.0000',
      // Active life-type policies only: the lapsed endowment doesn't count.
      lifeCover: '10000000.0000',
      healthCover: '500000.0000',
    });
    expect(out.lifePolicyCount).toBe(1);
  });

  it('has no expense figure when there is no spending signal', async () => {
    svc.getEmergencyFundInputs.mockResolvedValue({
      liquidAssets: new Decimal(0),
      monthlyExpenses: new Decimal(0),
      target: new Decimal(0),
      surplus: new Decimal(0),
      hasExpenseSignal: false,
    });
    const out = await getCoverage('u1');
    expect(out.figures.monthlyExpenses).toBeNull();
    expect(out.defaults.annualExpenses).toBeNull();
  });

  it('seeds defaults from those figures', async () => {
    const out = await getCoverage('u1');
    expect(out.defaults).toMatchObject({
      annualIncome: '1800000.0000',
      annualExpenses: '720000.0000',
      loans: '3500000.0000',
      supportYears: 20,
      goalIds: ['g1'],
    });
  });

  it('lists only active goals with something left to fund', async () => {
    const out = await getCoverage('u1');
    expect(out.goals).toEqual([{ id: 'g1', name: 'College', category: 'CHILD_EDUCATION', remaining: '2500000.0000' }]);
  });

  it('reads health-cover details off each active health policy', async () => {
    const out = await getCoverage('u1');
    expect(out.healthPolicies).toEqual([
      {
        id: 'h1',
        insurer: 'Star Health',
        planName: 'Family Optima',
        sumAssured: '500000.0000',
        members: ['Self', 'Spouse'],
        roomRent: '1% of SI',
        coPay: 10,
      },
    ]);
  });

  it('links motor policies to vehicles through vehicleId, active only', async () => {
    const out = await getCoverage('u1');
    expect(out.vehicles).toEqual([
      {
        id: 'v1',
        label: 'Honda City',
        registrationNo: 'MH47BT5950',
        insuranceExpiry: '2027-03-31',
        motorPolicy: { id: 'm1', insurer: 'ICICI Lombard', endsOn: '2027-03-31' },
      },
      { id: 'v2', label: 'MH01AB1234', registrationNo: 'MH01AB1234', insuranceExpiry: '2026-05-01', motorPolicy: null },
    ]);
  });

  it('counts homes you own once, and skips land, parking and sold ones', async () => {
    const out = await getCoverage('u1');
    expect(out.properties).toEqual([
      { id: 'o1', name: 'Andheri flat', kind: 'OWNED' },
      { id: 'r2', name: 'Pune shop', kind: 'RENTAL' },
    ]);
    // The surrendered home policy isn't cover.
    expect(out.homePolicies).toEqual([]);
  });

  it('lists lapsed policies', async () => {
    const out = await getCoverage('u1');
    expect(out.lapsed.map((p) => p.id)).toEqual(['t2', 'm0']);
  });
});
