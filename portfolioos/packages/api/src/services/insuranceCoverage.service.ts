/**
 * Insurance hub, phase 3 — the coverage check's figures.
 *
 * Every number comes from the service that already owns it, so this page can
 * never disagree with the health score, the dashboard or the goals page:
 *   income          income.service       activeMonthlyIncomeTotal
 *   spending, cash  healthScore.service  getEmergencyFundInputs
 *   loans, holdings dashboard.service    getDashboardNetWorth
 *   goals           goals.service        listGoals
 *   policies        insurance.service    listPolicies
 *   vehicles        vehicles.service     listVehicles
 *   homes           realEstate / rental  listProperties
 * Each of those filters by userId (and RLS is on), so nothing here queries
 * the database itself.
 *
 * The verdicts are the shared computeCoverage's job — the web recomputes
 * them as the user edits the assumptions — so this returns facts plus the
 * seeded defaults, all money as strings.
 */
import {
  Decimal,
  defaultAssumptions,
  serializeMoney,
  type CoverageFacts,
  type CoverageResponse,
  type HealthPolicyFact,
  type PropertyFact,
  type VehicleFact,
} from '@everypaisa/shared';
import { activeMonthlyIncomeTotal } from './income.service.js';
import { getEmergencyFundInputs } from './healthScore.service.js';
import { getDashboardNetWorth } from './dashboard.service.js';
import { listGoals } from './goals.service.js';
import { listPolicies } from './insurance.service.js';
import { listVehicles } from './vehicles.service.js';
import { listProperties as listOwnedProperties } from './realEstate.service.js';
import { listProperties as listRentalProperties } from './rental.service.js';
import { isLifePolicyType } from './healthScoreMath.js';

const ZERO = new Decimal(0);

function d(v: { toString(): string } | null | undefined): Decimal {
  return v == null ? ZERO : new Decimal(v.toString());
}

const money = (v: { toString(): string } | null | undefined) => serializeMoney(d(v));

function isoDay(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return (v instanceof Date ? v.toISOString() : v).slice(0, 10);
}

/** Owned property types with no building of yours to insure. */
const NOT_A_BUILDING_OWNED: ReadonlySet<string> = new Set(['PLOT_LAND', 'AGRICULTURAL', 'PARKING_GARAGE']);
const NOT_A_BUILDING_RENTAL: ReadonlySet<string> = new Set(['LAND', 'PARKING']);

/** Members, room-rent limit and co-pay from a policy's free-form healthCoverDetails. */
function healthDetails(raw: unknown): Pick<HealthPolicyFact, 'members' | 'roomRent' | 'coPay'> {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const members = Array.isArray(o['members'])
    ? o['members'].filter((m): m is string => typeof m === 'string' && m.trim() !== '').map((m) => m.trim())
    : [];
  const roomRent = typeof o['roomRent'] === 'string' && o['roomRent'].trim() ? o['roomRent'].trim() : null;
  const coPay = typeof o['coPay'] === 'number' && Number.isFinite(o['coPay']) && o['coPay'] > 0 ? o['coPay'] : null;
  return { members, roomRent, coPay };
}

export async function getCoverage(userId: string): Promise<CoverageResponse> {
  const [monthlyIncome, emergency, netWorth, goals, policies, vehicles, owned, rentals] = await Promise.all([
    activeMonthlyIncomeTotal(userId),
    getEmergencyFundInputs(userId),
    getDashboardNetWorth(userId),
    listGoals(userId),
    listPolicies(userId),
    listVehicles(userId),
    listOwnedProperties(userId),
    listRentalProperties(userId),
  ]);

  const active = policies.filter((p) => p.status === 'ACTIVE');
  const life = active.filter((p) => isLifePolicyType(p.type));
  const health = active.filter((p) => p.type === 'HEALTH');
  const sumAssured = (ps: typeof policies) => ps.reduce((s, p) => s.plus(d(p.sumAssured)), ZERO);

  const liquid = d(emergency.liquidAssets);
  // The dashboard's portfolio value includes the liquid holdings; count them once.
  const otherInvestments = Decimal.max(ZERO, d(netWorth.portfolio.currentValue).minus(liquid));

  const vehicleFacts: VehicleFact[] = vehicles.map((v) => {
    const linked = active
      .filter((p) => p.type === 'MOTOR' && (p.vehicleId === v.id || p.id === v.insurancePolicyId))
      .map((p) => ({ id: p.id, insurer: p.insurer, endsOn: isoDay(p.maturityDate) }))
      .sort((a, b) => (b.endsOn ?? '').localeCompare(a.endsOn ?? ''));
    return {
      id: v.id,
      label: [v.make, v.model].filter(Boolean).join(' ') || v.registrationNo,
      registrationNo: v.registrationNo,
      insuranceExpiry: isoDay(v.insuranceExpiry),
      motorPolicy: linked[0] ?? null,
    };
  });

  const linkedRentals = new Set(owned.map((p) => p.rentalPropertyId).filter((id): id is string => !!id));
  const properties: PropertyFact[] = [
    ...owned
      .filter((p) => p.status !== 'SOLD' && p.isActive !== false && !NOT_A_BUILDING_OWNED.has(p.propertyType))
      .map((p) => ({ id: p.id, name: p.name, kind: 'OWNED' as const })),
    ...rentals
      .filter((r) => r.isActive && !NOT_A_BUILDING_RENTAL.has(r.propertyType) && !linkedRentals.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, kind: 'RENTAL' as const })),
  ];

  const facts: CoverageFacts = {
    asOf: new Date().toISOString().slice(0, 10),
    figures: {
      monthlyIncome: money(monthlyIncome),
      monthlyExpenses: emergency.hasExpenseSignal ? money(emergency.monthlyExpenses) : null,
      loansOutstanding: money(netWorth.liabilities.totalOutstanding),
      liquidAssets: serializeMoney(liquid),
      otherInvestments: serializeMoney(otherInvestments),
      lifeCover: serializeMoney(sumAssured(life)),
      healthCover: serializeMoney(sumAssured(health)),
    },
    lifePolicyCount: life.length,
    goals: goals
      .filter((g) => g.status === 'ACTIVE' && d(g.remaining).greaterThan(0))
      .map((g) => ({ id: g.id, name: g.name, category: g.category, remaining: money(g.remaining) })),
    healthPolicies: health.map((p) => ({
      id: p.id,
      insurer: p.insurer,
      planName: p.planName,
      sumAssured: money(p.sumAssured),
      ...healthDetails(p.healthCoverDetails),
    })),
    vehicles: vehicleFacts,
    properties,
    homePolicies: active
      .filter((p) => p.type === 'HOME')
      .map((p) => ({ id: p.id, insurer: p.insurer, planName: p.planName })),
    lapsed: policies
      .filter((p) => p.status === 'LAPSED')
      .map((p) => ({ id: p.id, insurer: p.insurer, planName: p.planName, type: p.type })),
  };

  return { ...facts, defaults: defaultAssumptions(facts) };
}
