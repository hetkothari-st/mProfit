/**
 * Real-estate (owned property) service.
 *
 * CRUD for `OwnedProperty` plus the sale → status flip + capital-gain
 * read-side computation. All money math via decimal.js (§3.2). Every
 * query is filtered by userId in addition to the RLS policy enabled
 * by migration 20260505120000_owned_property_real_estate (defence in
 * depth, not redundancy — see §3.6).
 *
 * Holdings projection is intentionally not touched here: properties are
 * not part of the FIFO/Holding pipeline. Net-worth aggregation reads
 * `currentValue` directly.
 */

import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import {
  computePropertyCapitalGain,
  type PropertyForCgInput,
} from './propertyCapitalGain.js';
import type {
  CreateOwnedPropertyInput,
  MarkSoldInput,
  OwnedPropertyDTO,
  PropertyCapitalGainDTO,
  RefreshValueInput,
  UpdateOwnedPropertyInput,
} from '@portfolioos/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  return new Date(s + 'T00:00:00Z');
}

function toDecimalOrNull(s: string | null | undefined): Prisma.Decimal | null {
  if (s === null || s === undefined || s === '') return null;
  return new Prisma.Decimal(s);
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function isoDatetime(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function moneyOrNull(d: Prisma.Decimal | null): string | null {
  if (d === null) return null;
  return d.toString();
}

// ── Serialization ────────────────────────────────────────────────────────────

type StoredOwnedProperty = Prisma.OwnedPropertyGetPayload<Record<string, never>>;

function toDTO(row: StoredOwnedProperty): OwnedPropertyDTO {
  return {
    id: row.id,
    userId: row.userId,
    portfolioId: row.portfolioId,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country,
    propertyType: row.propertyType as OwnedPropertyDTO['propertyType'],
    status: row.status as OwnedPropertyDTO['status'],
    builtUpSqft: moneyOrNull(row.builtUpSqft),
    carpetSqft: moneyOrNull(row.carpetSqft),
    plotAreaSqft: moneyOrNull(row.plotAreaSqft),
    floors: row.floors,
    ownershipType: row.ownershipType as OwnedPropertyDTO['ownershipType'],
    ownershipPercent: row.ownershipPercent.toString(),
    coOwners: row.coOwners,
    purchaseDate: isoDate(row.purchaseDate),
    purchasePrice: moneyOrNull(row.purchasePrice),
    stampDuty: moneyOrNull(row.stampDuty),
    registrationFee: moneyOrNull(row.registrationFee),
    brokerage: moneyOrNull(row.brokerage),
    otherCosts: moneyOrNull(row.otherCosts),
    currentValue: moneyOrNull(row.currentValue),
    currentValueSource: row.currentValueSource,
    currentValueAsOf: isoDatetime(row.currentValueAsOf),
    loanId: row.loanId,
    insurancePolicyId: row.insurancePolicyId,
    rentalPropertyId: row.rentalPropertyId,
    annualPropertyTax: moneyOrNull(row.annualPropertyTax),
    propertyTaxDueMonth: row.propertyTaxDueMonth,
    societyName: row.societyName,
    monthlyMaintenance: moneyOrNull(row.monthlyMaintenance),
    maintenanceFrequency:
      row.maintenanceFrequency as OwnedPropertyDTO['maintenanceFrequency'],
    ownerName: row.ownerName,
    electricityConsumerNo: row.electricityConsumerNo,
    waterConnectionNo: row.waterConnectionNo,
    gasConnectionNo: row.gasConnectionNo,
    khataNo: row.khataNo,
    surveyNo: row.surveyNo,
    builderName: row.builderName,
    projectName: row.projectName,
    reraRegNo: row.reraRegNo,
    expectedPossessionDate: isoDate(row.expectedPossessionDate),
    paymentSchedulePaidPct: moneyOrNull(row.paymentSchedulePaidPct),
    leaseholdEndDate: isoDate(row.leaseholdEndDate),
    saleDate: isoDate(row.saleDate),
    salePrice: moneyOrNull(row.salePrice),
    saleBrokerage: moneyOrNull(row.saleBrokerage),
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listProperties(userId: string): Promise<OwnedPropertyDTO[]> {
  const rows = await prisma.ownedProperty.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDTO);
}

export async function getProperty(
  userId: string,
  id: string,
): Promise<OwnedPropertyDTO> {
  const row = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!row) throw new NotFoundError(`Property ${id} not found`);
  return toDTO(row);
}

export async function createProperty(
  userId: string,
  input: CreateOwnedPropertyInput,
): Promise<OwnedPropertyDTO> {
  const row = await prisma.ownedProperty.create({
    data: {
      userId,
      portfolioId: input.portfolioId ?? null,
      name: input.name,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      country: input.country ?? 'IN',
      propertyType: input.propertyType,
      status: input.status ?? 'SELF_OCCUPIED',
      builtUpSqft: toDecimalOrNull(input.builtUpSqft),
      carpetSqft: toDecimalOrNull(input.carpetSqft),
      plotAreaSqft: toDecimalOrNull(input.plotAreaSqft),
      floors: input.floors ?? null,
      ownershipType: input.ownershipType ?? 'SOLE',
      ownershipPercent: input.ownershipPercent
        ? new Prisma.Decimal(input.ownershipPercent)
        : new Prisma.Decimal(100),
      coOwners: input.coOwners ?? null,
      purchaseDate: toDate(input.purchaseDate),
      purchasePrice: toDecimalOrNull(input.purchasePrice),
      stampDuty: toDecimalOrNull(input.stampDuty),
      registrationFee: toDecimalOrNull(input.registrationFee),
      brokerage: toDecimalOrNull(input.brokerage),
      otherCosts: toDecimalOrNull(input.otherCosts),
      currentValue: toDecimalOrNull(input.currentValue),
      currentValueSource: input.currentValueSource ?? 'manual',
      currentValueAsOf: input.currentValue ? new Date() : null,
      loanId: input.loanId ?? null,
      insurancePolicyId: input.insurancePolicyId ?? null,
      rentalPropertyId: input.rentalPropertyId ?? null,
      annualPropertyTax: toDecimalOrNull(input.annualPropertyTax),
      propertyTaxDueMonth: input.propertyTaxDueMonth ?? null,
      societyName: input.societyName ?? null,
      monthlyMaintenance: toDecimalOrNull(input.monthlyMaintenance),
      maintenanceFrequency: input.maintenanceFrequency ?? 'MONTHLY',
      ownerName: input.ownerName ?? null,
      electricityConsumerNo: input.electricityConsumerNo ?? null,
      waterConnectionNo: input.waterConnectionNo ?? null,
      gasConnectionNo: input.gasConnectionNo ?? null,
      khataNo: input.khataNo ?? null,
      surveyNo: input.surveyNo ?? null,
      builderName: input.builderName ?? null,
      projectName: input.projectName ?? null,
      reraRegNo: input.reraRegNo ?? null,
      expectedPossessionDate: toDate(input.expectedPossessionDate),
      paymentSchedulePaidPct: toDecimalOrNull(input.paymentSchedulePaidPct),
      leaseholdEndDate: toDate(input.leaseholdEndDate),
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    },
  });
  return toDTO(row);
}

export async function updateProperty(
  userId: string,
  id: string,
  input: UpdateOwnedPropertyInput,
): Promise<OwnedPropertyDTO> {
  const existing = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Property ${id} not found`);

  const data: Prisma.OwnedPropertyUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.propertyType !== undefined) data.propertyType = input.propertyType;
  if (input.status !== undefined) data.status = input.status;
  if (input.portfolioId !== undefined) {
    data.portfolio = input.portfolioId
      ? { connect: { id: input.portfolioId } }
      : { disconnect: true };
  }
  if (input.address !== undefined) data.address = input.address;
  if (input.city !== undefined) data.city = input.city;
  if (input.state !== undefined) data.state = input.state;
  if (input.pincode !== undefined) data.pincode = input.pincode;
  if (input.country !== undefined) data.country = input.country;
  if (input.builtUpSqft !== undefined) data.builtUpSqft = toDecimalOrNull(input.builtUpSqft);
  if (input.carpetSqft !== undefined) data.carpetSqft = toDecimalOrNull(input.carpetSqft);
  if (input.plotAreaSqft !== undefined) data.plotAreaSqft = toDecimalOrNull(input.plotAreaSqft);
  if (input.floors !== undefined) data.floors = input.floors;
  if (input.ownershipType !== undefined) data.ownershipType = input.ownershipType;
  if (input.ownershipPercent !== undefined) {
    data.ownershipPercent = new Prisma.Decimal(input.ownershipPercent);
  }
  if (input.coOwners !== undefined) data.coOwners = input.coOwners;
  if (input.purchaseDate !== undefined) data.purchaseDate = toDate(input.purchaseDate);
  if (input.purchasePrice !== undefined) data.purchasePrice = toDecimalOrNull(input.purchasePrice);
  if (input.stampDuty !== undefined) data.stampDuty = toDecimalOrNull(input.stampDuty);
  if (input.registrationFee !== undefined) {
    data.registrationFee = toDecimalOrNull(input.registrationFee);
  }
  if (input.brokerage !== undefined) data.brokerage = toDecimalOrNull(input.brokerage);
  if (input.otherCosts !== undefined) data.otherCosts = toDecimalOrNull(input.otherCosts);
  if (input.currentValue !== undefined) {
    data.currentValue = toDecimalOrNull(input.currentValue);
    data.currentValueAsOf = input.currentValue ? new Date() : null;
  }
  if (input.currentValueSource !== undefined) data.currentValueSource = input.currentValueSource;
  if (input.loanId !== undefined) {
    data.loan = input.loanId ? { connect: { id: input.loanId } } : { disconnect: true };
  }
  if (input.insurancePolicyId !== undefined) {
    data.insurancePolicy = input.insurancePolicyId
      ? { connect: { id: input.insurancePolicyId } }
      : { disconnect: true };
  }
  if (input.rentalPropertyId !== undefined) {
    data.rentalProperty = input.rentalPropertyId
      ? { connect: { id: input.rentalPropertyId } }
      : { disconnect: true };
  }
  if (input.annualPropertyTax !== undefined) {
    data.annualPropertyTax = toDecimalOrNull(input.annualPropertyTax);
  }
  if (input.propertyTaxDueMonth !== undefined) data.propertyTaxDueMonth = input.propertyTaxDueMonth;
  if (input.societyName !== undefined) data.societyName = input.societyName;
  if (input.monthlyMaintenance !== undefined) {
    data.monthlyMaintenance = toDecimalOrNull(input.monthlyMaintenance);
  }
  if (input.maintenanceFrequency !== undefined) {
    data.maintenanceFrequency = input.maintenanceFrequency;
  }
  if (input.ownerName !== undefined) data.ownerName = input.ownerName;
  if (input.electricityConsumerNo !== undefined) {
    data.electricityConsumerNo = input.electricityConsumerNo;
  }
  if (input.waterConnectionNo !== undefined) data.waterConnectionNo = input.waterConnectionNo;
  if (input.gasConnectionNo !== undefined) data.gasConnectionNo = input.gasConnectionNo;
  if (input.khataNo !== undefined) data.khataNo = input.khataNo;
  if (input.surveyNo !== undefined) data.surveyNo = input.surveyNo;
  if (input.builderName !== undefined) data.builderName = input.builderName;
  if (input.projectName !== undefined) data.projectName = input.projectName;
  if (input.reraRegNo !== undefined) data.reraRegNo = input.reraRegNo;
  if (input.expectedPossessionDate !== undefined) {
    data.expectedPossessionDate = toDate(input.expectedPossessionDate);
  }
  if (input.paymentSchedulePaidPct !== undefined) {
    data.paymentSchedulePaidPct = toDecimalOrNull(input.paymentSchedulePaidPct);
  }
  if (input.leaseholdEndDate !== undefined) {
    data.leaseholdEndDate = toDate(input.leaseholdEndDate);
  }
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const row = await prisma.ownedProperty.update({
    where: { id, userId },
    data,
  });
  return toDTO(row);
}

export async function deleteProperty(userId: string, id: string): Promise<void> {
  const existing = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Property ${id} not found`);
  await prisma.ownedProperty.delete({ where: { id, userId } });
}

// ── Sale + value-refresh ─────────────────────────────────────────────────────

export async function markSold(
  userId: string,
  id: string,
  input: MarkSoldInput,
): Promise<OwnedPropertyDTO> {
  const existing = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Property ${id} not found`);

  const row = await prisma.ownedProperty.update({
    where: { id, userId },
    data: {
      saleDate: toDate(input.saleDate),
      salePrice: new Prisma.Decimal(input.salePrice),
      saleBrokerage: toDecimalOrNull(input.saleBrokerage),
      status: 'SOLD',
      isActive: false,
    },
  });
  return toDTO(row);
}

export async function refreshValue(
  userId: string,
  id: string,
  input: RefreshValueInput,
): Promise<OwnedPropertyDTO> {
  const existing = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Property ${id} not found`);

  const row = await prisma.ownedProperty.update({
    where: { id, userId },
    data: {
      currentValue: new Prisma.Decimal(input.currentValue),
      currentValueSource: input.currentValueSource ?? 'manual',
      currentValueAsOf: new Date(),
    },
  });
  return toDTO(row);
}

// ── Rental promotion ─────────────────────────────────────────────────────────
//
// "Promote to rental" copies the basics into a `RentalProperty` row so the
// user can start tracking tenancies + receipts. The OwnedProperty keeps the
// authoritative cost-basis / sale-side view; the RentalProperty owns the
// income-side view. Linked via `rentalPropertyId`. Idempotent — promoting
// twice returns the same rental row.
//
// Undo (`unlinkFromRental`) is only safe while the rental side has no
// children (tenancies / expenses); otherwise we'd lose user-entered data.

const PROPERTY_TYPE_TO_RENTAL_TYPE: Record<string, string> = {
  APARTMENT: 'RESIDENTIAL',
  INDEPENDENT_HOUSE: 'RESIDENTIAL',
  VILLA: 'RESIDENTIAL',
  COMMERCIAL_OFFICE: 'COMMERCIAL',
  COMMERCIAL_SHOP: 'COMMERCIAL',
  PLOT_LAND: 'LAND',
  AGRICULTURAL: 'LAND',
  PARKING_GARAGE: 'PARKING',
  UNDER_CONSTRUCTION: 'RESIDENTIAL',
  OTHER: 'RESIDENTIAL',
};

export async function promoteToRental(
  userId: string,
  id: string,
): Promise<OwnedPropertyDTO> {
  const property = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!property) throw new NotFoundError(`Property ${id} not found`);

  // Idempotent: if already linked, return as-is
  if (property.rentalPropertyId) {
    return toDTO(property);
  }

  const rentalType =
    PROPERTY_TYPE_TO_RENTAL_TYPE[property.propertyType] ?? 'RESIDENTIAL';

  const updated = await prisma.$transaction(async (tx) => {
    const rental = await tx.rentalProperty.create({
      data: {
        userId,
        portfolioId: property.portfolioId,
        name: property.name,
        address: property.address,
        propertyType: rentalType,
        purchaseDate: property.purchaseDate,
        purchasePrice: property.purchasePrice,
        currentValue: property.currentValue,
        isActive: true,
      },
    });
    return tx.ownedProperty.update({
      where: { id, userId },
      data: {
        rentalPropertyId: rental.id,
        status: 'RENTED_OUT',
      },
    });
  });

  return toDTO(updated);
}

export async function unlinkFromRental(
  userId: string,
  id: string,
): Promise<OwnedPropertyDTO> {
  const property = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!property) throw new NotFoundError(`Property ${id} not found`);
  if (!property.rentalPropertyId) return toDTO(property);

  // Refuse undo if user has already added tenancies/expenses — that'd lose data.
  const rentalId = property.rentalPropertyId;
  const childCount = await prisma.rentalProperty.findFirst({
    where: { id: rentalId, userId },
    select: {
      _count: { select: { tenancies: true, expenses: true } },
    },
  });
  if (
    childCount &&
    (childCount._count.tenancies > 0 || childCount._count.expenses > 0)
  ) {
    throw new Error(
      'Cannot unlink rental — tenancies or expenses already exist. Delete those first.',
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.ownedProperty.update({
      where: { id, userId },
      data: {
        rentalPropertyId: null,
        status: property.status === 'RENTED_OUT' ? 'SELF_OCCUPIED' : property.status,
      },
    });
    await tx.rentalProperty.deleteMany({ where: { id: rentalId, userId } });
    return next;
  });

  return toDTO(updated);
}

// ── Capital gain (read-side) ─────────────────────────────────────────────────

export async function getCapitalGain(
  userId: string,
  id: string,
): Promise<PropertyCapitalGainDTO | null> {
  const row = await prisma.ownedProperty.findFirst({ where: { id, userId } });
  if (!row) throw new NotFoundError(`Property ${id} not found`);

  const input: PropertyForCgInput = {
    id: row.id,
    purchaseDate: row.purchaseDate,
    purchasePrice: row.purchasePrice,
    stampDuty: row.stampDuty,
    registrationFee: row.registrationFee,
    brokerage: row.brokerage,
    otherCosts: row.otherCosts,
    ownershipPercent: row.ownershipPercent,
    saleDate: row.saleDate,
    salePrice: row.salePrice,
    saleBrokerage: row.saleBrokerage,
  };
  return computePropertyCapitalGain(input);
}

// ── Aggregate helpers (used by dashboard / list summary) ─────────────────────

export interface PortfolioRealEstateSummary {
  totalProperties: number;
  activeProperties: number;
  totalCurrentValue: string;
  totalCostBasis: string;
  unrealisedGain: string;
}

export async function computeSummary(
  userId: string,
): Promise<PortfolioRealEstateSummary> {
  const rows = await prisma.ownedProperty.findMany({ where: { userId } });

  let totalCurrentValue = new Decimal(0);
  let totalCostBasis = new Decimal(0);
  let activeCount = 0;

  const dec = (v: { toString(): string } | null): Decimal =>
    v ? new Decimal(v.toString()) : new Decimal(0);

  for (const r of rows) {
    if (r.isActive && r.status !== 'SOLD') activeCount++;
    // Sold rows carry pre-sale `currentValue` — exclude them so the
    // dashboard total reflects only assets still on the books.
    if (r.status === 'SOLD') continue;
    if (r.currentValue) {
      totalCurrentValue = totalCurrentValue.plus(new Decimal(r.currentValue.toString()));
    }
    const cost = dec(r.purchasePrice)
      .plus(dec(r.stampDuty))
      .plus(dec(r.registrationFee))
      .plus(dec(r.brokerage))
      .plus(dec(r.otherCosts));
    totalCostBasis = totalCostBasis.plus(cost);
  }

  return {
    totalProperties: rows.length,
    activeProperties: activeCount,
    totalCurrentValue: totalCurrentValue.toFixed(2),
    totalCostBasis: totalCostBasis.toFixed(2),
    unrealisedGain: totalCurrentValue.minus(totalCostBasis).toFixed(2),
  };
}
