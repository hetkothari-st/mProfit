import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { resolveVehiclePhoto } from '../adapters/vehicle/photo.js';
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  refreshVehicle,
  refreshVehiclePhoto,
  applyVahanSms,
} from '../services/vehicles.service.js';
import { initiateCarInfoScrape, verifyCarInfoOtp } from '../adapters/vehicle/carinfoPlaywright.js';
import { scanChallansForVehicle } from '../services/challans.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Expected decimal string');

const baseBodyShape = {
  portfolioId: z.string().nullable().optional(),
  make: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  variant: z.string().max(120).nullable().optional(),
  manufacturingYear: z.number().int().min(1900).max(2100).nullable().optional(),
  fuelType: z.string().max(32).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  chassisLast4: z.string().max(16).nullable().optional(),
  ownerName: z.string().max(160).nullable().optional(),
  purchaseDate: isoDate.nullable().optional(),
  purchasePrice: moneyString.nullable().optional(),
  currentValue: moneyString.nullable().optional(),
  currentValueSource: z.string().max(32).nullable().optional(),
  insuranceExpiry: isoDate.nullable().optional(),
  pucExpiry: isoDate.nullable().optional(),
  fitnessExpiry: isoDate.nullable().optional(),
  roadTaxExpiry: isoDate.nullable().optional(),
  permitExpiry: isoDate.nullable().optional(),
};

const createBodySchema = z.object({
  registrationNo: z.string().min(5).max(20),
  ...baseBodyShape,
});

const updateBodySchema = z.object({
  registrationNo: z.string().min(5).max(20).optional(),
  ...baseBodyShape,
});

const refreshBodySchema = z.object({
  mode: z.enum(['auto', 'interactive']).default('interactive'),
  chassisLast4: z.string().max(16).optional(),
  smsBody: z.string().max(4000).optional(),
});

const smsPasteBodySchema = z.object({
  registrationNo: z.string().min(5).max(20),
  smsBody: z.string().min(10).max(4000),
});

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await listVehicles(req.user.id);
  ok(res, rows);
}

export async function get(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await getVehicle(req.user.id, req.params.id!);
  ok(res, row);
}

export async function create(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createBodySchema.parse(req.body ?? {});
  const row = await createVehicle(req.user.id, body);
  ok(res, row);
}

export async function update(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateBodySchema.parse(req.body ?? {});
  const row = await updateVehicle(req.user.id, req.params.id!, body);
  ok(res, row);
}

export async function remove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteVehicle(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}

export async function refresh(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = refreshBodySchema.parse(req.body ?? {});
  const result = await refreshVehicle(req.user.id, req.params.id!, body);
  ok(res, result);
}

export async function smsPaste(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = smsPasteBodySchema.parse(req.body ?? {});
  const result = await applyVahanSms(req.user.id, body.registrationNo, body.smsBody);
  ok(res, result);
}

export async function scanChallans(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const result = await scanChallansForVehicle(req.user.id, req.params.id!);
  ok(res, result);
}

export async function refreshPhoto(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const result = await refreshVehiclePhoto(req.user.id, req.params.id!);
  ok(res, result);
}

const carInfoInitSchema = z.object({
  registrationNo: z.string().min(5).max(20),
  mobileNo: z.string().length(10),
});

const carInfoVerifySchema = z.object({
  sessionId: z.string(),
  otp: z.string().min(4).max(6),
});

export async function carInfoInit(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = carInfoInitSchema.parse(req.body ?? {});
  const sessionId = await initiateCarInfoScrape(body.registrationNo, body.mobileNo);
  ok(res, { sessionId });
}

export async function carInfoVerify(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = carInfoVerifySchema.parse(req.body ?? {});
  const userId = req.user.id;

  try {
    const data = await verifyCarInfoOtp(body.sessionId, body.otp);
    const parsed = (data?.parsed ?? null) as
      | (typeof data extends { parsed: infer P } ? P : null)
      | null;
    const regNo = (data?.regNo as string | undefined) ?? '';

    // Build the Vehicle row directly from the parsed VehicleRecord — no form
    // step. Falls back to a minimal row with just the registration number if
    // the parser couldn't extract anything (rare; chain refresh fills gaps).
    const cleanRegNo = regNo.replace(/\s+/g, '').toUpperCase();
    if (!cleanRegNo) {
      res.status(400).json({ success: false, message: 'No registration number returned by CarInfo' });
      return;
    }

    const existing = await prisma.vehicle.findUnique({
      where: { userId_registrationNo: { userId, registrationNo: cleanRegNo } },
    });

    type ParsedRecord = {
      make?: string;
      model?: string;
      variant?: string;
      manufacturingYear?: number;
      fuelType?: string;
      color?: string;
      chassisLast4?: string;
      rtoCode?: string;
      ownerName?: string;
      insuranceExpiry?: string;
      pucExpiry?: string;
      fitnessExpiry?: string;
      roadTaxExpiry?: string;
      permitExpiry?: string;
      rcStatus?: string;
      vehicleClass?: string;
      normsType?: string;
      seatingCapacity?: number;
      unloadedWeight?: number;
      engineNo?: string;
      hypothecation?: string;
      registrationDate?: string;
    };
    const p = (parsed ?? {}) as ParsedRecord;
    const isoDate = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
    const rtoFromReg = cleanRegNo.match(/^([A-Z]{2}[0-9]{1,2})/)?.[1] ?? null;

    const photo = await resolveVehiclePhoto(p.make, p.model, p.vehicleClass, p.fuelType);

    const data_ = {
      make: p.make ?? null,
      model: p.model ?? null,
      variant: p.variant ?? null,
      manufacturingYear: p.manufacturingYear ?? null,
      fuelType: p.fuelType ?? null,
      color: p.color ?? null,
      chassisLast4: p.chassisLast4 ?? null,
      rtoCode: p.rtoCode ?? rtoFromReg,
      ownerName: p.ownerName ?? null,
      insuranceExpiry: isoDate(p.insuranceExpiry),
      pucExpiry: isoDate(p.pucExpiry),
      fitnessExpiry: isoDate(p.fitnessExpiry),
      roadTaxExpiry: isoDate(p.roadTaxExpiry),
      permitExpiry: isoDate(p.permitExpiry),
      rcStatus: p.rcStatus ?? null,
      vehicleClass: p.vehicleClass ?? null,
      normsType: p.normsType ?? null,
      seatingCapacity: p.seatingCapacity ?? null,
      unloadedWeight: p.unloadedWeight ?? null,
      engineNo: p.engineNo ?? null,
      hypothecation: p.hypothecation ?? null,
      registrationDate: isoDate(p.registrationDate),
      photoUrl: photo?.url ?? null,
      photoSource: photo?.source ?? null,
      refreshSource: 'carinfo-playwright',
      lastRefreshedAt: new Date(),
    };

    let vehicle;
    if (existing) {
      // Don't clobber existing user-edited fields with nulls
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data_)) {
        if (v !== null && v !== undefined) patch[k] = v;
      }
      vehicle = await prisma.vehicle.update({
        where: { id: existing.id },
        data: patch,
        include: { challans: { orderBy: { offenceDate: 'desc' } }, insurancePolicies: true },
      });
    } else {
      vehicle = await prisma.vehicle.create({
        data: { userId, registrationNo: cleanRegNo, ...data_ },
        include: { challans: { orderBy: { offenceDate: 'desc' } }, insurancePolicies: true },
      });
    }

    ok(res, { vehicle, parsed, source: data?.source });
  } catch (error: any) {
    logger.error({ error, sessionId: body.sessionId }, 'CarInfo verification failed');
    res.status(400).json({
      success: false,
      message: error.message || 'Verification failed',
    });
  }
}
