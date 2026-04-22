import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  refreshVehicle,
  applyVahanSms,
} from '../services/vehicles.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

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
