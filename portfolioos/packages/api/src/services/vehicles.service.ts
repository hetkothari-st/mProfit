/**
 * §7 Vehicle service — CRUD plus adapter-chain refresh.
 *
 * Writes go through Prisma with explicit `userId` scoping; every read
 * re-verifies ownership. The fetch path funnels through
 * {@link runVehicleChain} so the SMS/mParivahan/portal chain decision
 * and DLQ behaviour stay in one place.
 *
 * The chain may return partial data (SMS with only owner + insurance
 * expiry populated). We merge into existing columns rather than
 * overwrite — a blank field from the adapter never clobbers a field the
 * user filled manually.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  runVehicleChain,
  type VehicleFetchMode,
} from '../adapters/vehicle/chain.js';
import type { VehicleRecord } from '../adapters/vehicle/types.js';

// Indian RC pattern: 2-char state + 1-2 digit RTO + 1-3 alpha series +
// 4-digit number. Covers MH47BT5950, DL01AB1234, KA05MP9999, etc. We
// also accept BH-series (21 BH 1234 AA), which has a different shape.
const RC_RE = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;

function normaliseRegNo(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  if (!RC_RE.test(cleaned)) {
    throw new BadRequestError(
      `Invalid registration number: ${raw}. Expected formats like MH47BT5950 or 21BH1234AA.`,
    );
  }
  return cleaned;
}

function rtoFromRegNo(regNo: string): string | undefined {
  const m = regNo.match(/^([A-Z]{2}[0-9]{1,2})/);
  return m ? m[1] : undefined;
}

export interface CreateVehicleInput {
  registrationNo: string;
  portfolioId?: string | null;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  manufacturingYear?: number | null;
  fuelType?: string | null;
  color?: string | null;
  chassisLast4?: string | null;
  ownerName?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: string | null;
  currentValue?: string | null;
  currentValueSource?: string | null;
  insuranceExpiry?: string | null;
  pucExpiry?: string | null;
  fitnessExpiry?: string | null;
  roadTaxExpiry?: string | null;
  permitExpiry?: string | null;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput>;

function dateOrNull(s: string | null | undefined): Date | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestError(`Invalid date (expected YYYY-MM-DD): ${s}`);
  }
  return new Date(`${s}T00:00:00.000Z`);
}

function decimalOrNull(
  s: string | null | undefined,
): Prisma.Decimal | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  try {
    return new Prisma.Decimal(s);
  } catch {
    throw new BadRequestError(`Invalid decimal value: ${s}`);
  }
}

export async function listVehicles(userId: string) {
  return prisma.vehicle.findMany({
    where: { userId },
    orderBy: [{ registrationNo: 'asc' }],
    include: {
      challans: {
        orderBy: { offenceDate: 'desc' },
        take: 5,
      },
    },
  });
}

export async function getVehicle(userId: string, id: string) {
  const row = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      challans: { orderBy: { offenceDate: 'desc' } },
      insurancePolicies: true,
    },
  });
  if (!row) throw new NotFoundError('Vehicle not found');
  if (row.userId !== userId) throw new ForbiddenError();
  return row;
}

export async function createVehicle(userId: string, input: CreateVehicleInput) {
  const registrationNo = normaliseRegNo(input.registrationNo);
  const existing = await prisma.vehicle.findUnique({
    where: { userId_registrationNo: { userId, registrationNo } },
  });
  if (existing) {
    throw new BadRequestError(`Vehicle ${registrationNo} already exists`);
  }

  return prisma.vehicle.create({
    data: {
      userId,
      registrationNo,
      portfolioId: input.portfolioId ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      variant: input.variant ?? null,
      manufacturingYear: input.manufacturingYear ?? null,
      fuelType: input.fuelType ?? null,
      color: input.color ?? null,
      chassisLast4: input.chassisLast4 ?? null,
      rtoCode: rtoFromRegNo(registrationNo) ?? null,
      ownerName: input.ownerName ?? null,
      purchaseDate: dateOrNull(input.purchaseDate) ?? null,
      purchasePrice: decimalOrNull(input.purchasePrice) ?? null,
      currentValue: decimalOrNull(input.currentValue) ?? null,
      currentValueSource: input.currentValueSource ?? null,
      insuranceExpiry: dateOrNull(input.insuranceExpiry) ?? null,
      pucExpiry: dateOrNull(input.pucExpiry) ?? null,
      fitnessExpiry: dateOrNull(input.fitnessExpiry) ?? null,
      roadTaxExpiry: dateOrNull(input.roadTaxExpiry) ?? null,
      permitExpiry: dateOrNull(input.permitExpiry) ?? null,
    },
  });
}

export async function updateVehicle(
  userId: string,
  id: string,
  patch: UpdateVehicleInput,
) {
  await getVehicle(userId, id);

  const data: Prisma.VehicleUpdateInput = {};
  if (patch.registrationNo !== undefined) {
    data.registrationNo = normaliseRegNo(patch.registrationNo);
    data.rtoCode = rtoFromRegNo(data.registrationNo as string) ?? null;
  }
  if (patch.portfolioId !== undefined) data.portfolioId = patch.portfolioId;
  if (patch.make !== undefined) data.make = patch.make;
  if (patch.model !== undefined) data.model = patch.model;
  if (patch.variant !== undefined) data.variant = patch.variant;
  if (patch.manufacturingYear !== undefined)
    data.manufacturingYear = patch.manufacturingYear;
  if (patch.fuelType !== undefined) data.fuelType = patch.fuelType;
  if (patch.color !== undefined) data.color = patch.color;
  if (patch.chassisLast4 !== undefined) data.chassisLast4 = patch.chassisLast4;
  if (patch.ownerName !== undefined) data.ownerName = patch.ownerName;

  if (patch.purchaseDate !== undefined)
    data.purchaseDate = dateOrNull(patch.purchaseDate);
  if (patch.purchasePrice !== undefined)
    data.purchasePrice = decimalOrNull(patch.purchasePrice);
  if (patch.currentValue !== undefined)
    data.currentValue = decimalOrNull(patch.currentValue);
  if (patch.currentValueSource !== undefined)
    data.currentValueSource = patch.currentValueSource;
  if (patch.insuranceExpiry !== undefined)
    data.insuranceExpiry = dateOrNull(patch.insuranceExpiry);
  if (patch.pucExpiry !== undefined) data.pucExpiry = dateOrNull(patch.pucExpiry);
  if (patch.fitnessExpiry !== undefined)
    data.fitnessExpiry = dateOrNull(patch.fitnessExpiry);
  if (patch.roadTaxExpiry !== undefined)
    data.roadTaxExpiry = dateOrNull(patch.roadTaxExpiry);
  if (patch.permitExpiry !== undefined)
    data.permitExpiry = dateOrNull(patch.permitExpiry);

  return prisma.vehicle.update({ where: { id }, data });
}

export async function deleteVehicle(userId: string, id: string) {
  await getVehicle(userId, id);
  await prisma.vehicle.delete({ where: { id } });
}

export interface RefreshVehicleInput {
  mode: VehicleFetchMode;
  chassisLast4?: string;
  smsBody?: string;
}

/**
 * Merge strategy — a blank incoming field never overwrites an existing
 * non-null value. Fields the adapter populated trump stored values only
 * when those values came from the same or a weaker source, but to keep
 * the first cut simple we always prefer the adapter's fresh data and
 * fall back to stored data for blanks.
 */
function mergeRecord(
  record: VehicleRecord,
  existing: Prisma.VehicleGetPayload<Record<string, never>>,
): Prisma.VehicleUpdateInput {
  const d: Prisma.VehicleUpdateInput = {};
  const prefer = <T>(fresh: T | undefined, stored: T | null): T | null => {
    if (fresh !== undefined && fresh !== null) return fresh;
    return stored;
  };
  const dateField = (iso: string | undefined) =>
    iso ? new Date(`${iso}T00:00:00.000Z`) : undefined;

  if (record.make !== undefined) d.make = prefer(record.make, existing.make);
  if (record.model !== undefined) d.model = prefer(record.model, existing.model);
  if (record.variant !== undefined)
    d.variant = prefer(record.variant, existing.variant);
  if (record.manufacturingYear !== undefined)
    d.manufacturingYear = prefer(record.manufacturingYear, existing.manufacturingYear);
  if (record.fuelType !== undefined)
    d.fuelType = prefer(record.fuelType, existing.fuelType);
  if (record.color !== undefined) d.color = prefer(record.color, existing.color);
  if (record.chassisLast4 !== undefined)
    d.chassisLast4 = prefer(record.chassisLast4, existing.chassisLast4);
  if (record.rtoCode !== undefined)
    d.rtoCode = prefer(record.rtoCode, existing.rtoCode);
  if (record.ownerName !== undefined)
    d.ownerName = prefer(record.ownerName, existing.ownerName);

  const insurance = dateField(record.insuranceExpiry);
  if (insurance) d.insuranceExpiry = insurance;
  const puc = dateField(record.pucExpiry);
  if (puc) d.pucExpiry = puc;
  const fitness = dateField(record.fitnessExpiry);
  if (fitness) d.fitnessExpiry = fitness;
  const tax = dateField(record.roadTaxExpiry);
  if (tax) d.roadTaxExpiry = tax;
  const permit = dateField(record.permitExpiry);
  if (permit) d.permitExpiry = permit;

  return d;
}

export async function refreshVehicle(
  userId: string,
  id: string,
  input: RefreshVehicleInput,
) {
  const existing = await getVehicle(userId, id);

  const outcome = await runVehicleChain({
    userId,
    registrationNo: existing.registrationNo,
    mode: input.mode,
    context: {
      chassisLast4: input.chassisLast4 ?? existing.chassisLast4 ?? undefined,
      smsBody: input.smsBody,
    },
  });

  if (!outcome.ok || !outcome.record) {
    logger.info(
      { vehicleId: id, attempts: outcome.attempts },
      '[vehicles] refresh produced no data',
    );
    return { vehicle: existing, outcome };
  }

  const data = mergeRecord(outcome.record, existing);
  data.lastRefreshedAt = new Date();
  data.refreshSource = outcome.source ?? null;

  const updated = await prisma.vehicle.update({
    where: { id },
    data,
    include: {
      challans: { orderBy: { offenceDate: 'desc' } },
      insurancePolicies: true,
    },
  });

  return { vehicle: updated, outcome };
}

/**
 * SMS-paste flow: user provided an RC + SMS body, we parse and either
 * update an existing vehicle row or create a new one. Separate entry
 * point from refreshVehicle because the vehicle id may not exist yet.
 */
export async function applyVahanSms(
  userId: string,
  registrationNo: string,
  smsBody: string,
) {
  const normalised = normaliseRegNo(registrationNo);
  const existing = await prisma.vehicle.findUnique({
    where: { userId_registrationNo: { userId, registrationNo: normalised } },
  });

  const outcome = await runVehicleChain({
    userId,
    registrationNo: normalised,
    mode: 'interactive',
    context: { smsBody },
    // Force SMS-only — we already have the body in hand.
    adapters: [(await import('../adapters/vehicle/sms.js')).smsVehicleAdapter],
  });

  if (!outcome.ok || !outcome.record) {
    return { vehicle: existing, outcome, created: false };
  }

  if (existing) {
    const data = mergeRecord(outcome.record, existing);
    data.lastRefreshedAt = new Date();
    data.refreshSource = outcome.source ?? null;
    const updated = await prisma.vehicle.update({
      where: { id: existing.id },
      data,
    });
    return { vehicle: updated, outcome, created: false };
  }

  const created = await prisma.vehicle.create({
    data: {
      userId,
      registrationNo: normalised,
      rtoCode: rtoFromRegNo(normalised) ?? null,
      make: outcome.record.make ?? null,
      model: outcome.record.model ?? null,
      variant: outcome.record.variant ?? null,
      manufacturingYear: outcome.record.manufacturingYear ?? null,
      fuelType: outcome.record.fuelType ?? null,
      color: outcome.record.color ?? null,
      chassisLast4: outcome.record.chassisLast4 ?? null,
      ownerName: outcome.record.ownerName ?? null,
      insuranceExpiry: outcome.record.insuranceExpiry
        ? new Date(`${outcome.record.insuranceExpiry}T00:00:00.000Z`)
        : null,
      pucExpiry: outcome.record.pucExpiry
        ? new Date(`${outcome.record.pucExpiry}T00:00:00.000Z`)
        : null,
      fitnessExpiry: outcome.record.fitnessExpiry
        ? new Date(`${outcome.record.fitnessExpiry}T00:00:00.000Z`)
        : null,
      roadTaxExpiry: outcome.record.roadTaxExpiry
        ? new Date(`${outcome.record.roadTaxExpiry}T00:00:00.000Z`)
        : null,
      permitExpiry: outcome.record.permitExpiry
        ? new Date(`${outcome.record.permitExpiry}T00:00:00.000Z`)
        : null,
      refreshSource: outcome.source ?? null,
      lastRefreshedAt: new Date(),
    },
  });
  return { vehicle: created, outcome, created: true };
}
