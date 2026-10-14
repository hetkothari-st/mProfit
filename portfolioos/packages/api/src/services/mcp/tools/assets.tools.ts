import { listPolicies } from '../../insurance.service.js';
import { listProperties as listOwned } from '../../realEstate.service.js';
import { listExpenses, listProperties as listRentals } from '../../rental.service.js';
import { listVehicles } from '../../vehicles.service.js';
import { financialYearOf } from '../../capitalGains.service.js';
import { serializeMoney, toDecimal } from '@everypaisa/shared';
import type { ConnectorTool } from './types.js';
import { dmy, money } from './common.js';

const listInsurance: ConnectorTool<Record<string, never>> = {
  name: 'list_insurance', area: 'insurance', title: 'Insurance',
  description: 'Insurance policies: cover, premium, next due date, nominees and claims.', input: {},
  async run(ctx) {
    const rows = await listPolicies(ctx.userId);
    return {
      rows: rows.length,
      data: {
        asOf: dmy(ctx.now), currency: 'INR',
        policies: rows.map((r) => ({
          insurer: r.insurer, type: r.type, plan: r.planName ?? null, policy: r.policyNumberLast4 ? `XXXX${r.policyNumberLast4}` : null,
          status: r.status, sumAssured: money(r.sumAssured), premium: money(r.premiumAmount), premiumFrequency: r.premiumFrequency,
          nextPremiumDue: dmy(r.nextPremiumDue),
          nominees: (Array.isArray(r.nominees) ? (r.nominees as Array<{ name?: string; relation?: string; sharePercent?: number }>) : [])
            .map((n) => ({ name: n.name ?? null, relation: n.relation ?? null, sharePct: n.sharePercent ?? null })),
          claims: (r.claims ?? []).map((c) => ({ kind: c.kind, status: c.status, date: dmy(c.claimDate), claimed: money(c.claimedAmount), settled: money(c.settledAmount) })),
        })),
      },
    };
  },
};

const listPropertiesTool: ConnectorTool<Record<string, never>> = {
  name: 'list_properties', area: 'property', partialCaps: true, title: 'Property',
  description: 'Homes, land and rentals: value, ownership share, tenants, rent received or overdue, and expenses this financial year.', input: {},
  async run(ctx) {
    const cats = ctx.person?.kind === 'member' ? ctx.person.caps.categories : null;
    const seeOwned = cats === null || cats.includes('OWNED_PROPERTY');
    const seeRental = cats === null || cats.includes('RENTAL');
    const owned = seeOwned ? await listOwned(ctx.userId) : [];
    const linked = new Set(owned.map((p) => p.rentalPropertyId).filter((x): x is string => !!x));
    const rentals = seeRental ? await listRentals(ctx.userId) : [];
    const fy = financialYearOf(ctx.now);
    const expenses = seeRental ? await listExpenses(ctx.userId) : [];
    const yearStart = new Date(`${fy.slice(0, 4)}-04-01T00:00:00Z`);
    const spent = new Map<string, ReturnType<typeof toDecimal>>();
    for (const e of expenses) {
      if (new Date(e.paidOn) < yearStart) continue;
      spent.set(e.propertyId, (spent.get(e.propertyId) ?? toDecimal('0')).plus(toDecimal(String(e.amount))));
    }
    const yearAgo = new Date(ctx.now.getTime() - 365 * 86_400_000);
    return {
      rows: owned.length + rentals.length,
      data: {
        asOf: dmy(ctx.now), currency: 'INR', financialYear: fy,
        ...(seeOwned && seeRental ? {} : { note: `${seeOwned ? 'Rental properties are' : 'Owned properties are'} hidden by ${ctx.person?.label ?? 'this person'}'s family sharing settings, so this list is not complete.` }),
        owned: owned.map((p) => ({
          name: p.name, city: p.city ?? null, type: p.propertyType, status: p.status, ownership: p.ownershipType, ownershipPct: p.ownershipPercent ?? null,
          purchaseDate: dmy(p.purchaseDate), purchasePrice: p.purchasePrice, currentValue: p.currentValue, annualPropertyTax: p.annualPropertyTax ?? null,
          rented: !!p.rentalPropertyId,
        })),
        // A rental already reported as an owned property keeps its tenancy details here, not its value twice.
        rentals: rentals.map((r) => ({
          name: r.name, currentValue: linked.has(r.id) ? null : money(r.currentValue), active: r.isActive,
          tenancies: (r.tenancies ?? []).map((t) => ({
            tenant: t.tenantName, monthlyRent: money(t.monthlyRent), deposit: money(t.securityDeposit), balanceDue: money(t.balanceDue),
            active: t.isActive, since: dmy(t.startDate),
            receipts: (t.rentReceipts ?? []).filter((x) => new Date(x.dueDate) >= yearAgo)
              .map((x) => ({ month: x.forMonth, expected: money(x.expectedAmount), received: money(x.receivedAmount), status: x.status })),
          })),
          expensesThisFy: serializeMoney(spent.get(r.id) ?? toDecimal('0')),
        })),
      },
    };
  },
};

const listVehiclesTool: ConnectorTool<Record<string, never>> = {
  name: 'list_vehicles', area: 'vehicles', title: 'Vehicles',
  description: 'Vehicles: value, insurance, PUC, fitness and road-tax expiry dates, and challans.', input: {},
  async run(ctx) {
    const rows = await listVehicles(ctx.userId);
    return {
      rows: rows.length,
      data: {
        asOf: dmy(ctx.now), currency: 'INR',
        vehicles: rows.map((v) => ({
          make: v.make ?? null, model: v.model ?? null, registration: v.registrationNoLast4 ? `XXXX${v.registrationNoLast4}` : null,
          purchaseDate: dmy(v.purchaseDate), purchasePrice: money(v.purchasePrice), currentValue: money(v.currentValue),
          insuranceExpiry: dmy(v.insuranceExpiry), pucExpiry: dmy(v.pucExpiry), fitnessExpiry: dmy(v.fitnessExpiry), roadTaxExpiry: dmy(v.roadTaxExpiry),
          challans: (v.challans ?? []).map((c) => ({ date: dmy(c.offenceDate), offence: c.offenceType ?? null, amount: money(c.amount), status: c.status })),
        })),
      },
    };
  },
};

export const ASSET_TOOLS = [listInsurance, listPropertiesTool, listVehiclesTool];
