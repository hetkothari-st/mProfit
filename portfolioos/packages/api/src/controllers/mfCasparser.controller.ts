import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  cdslRequestOtp,
  cdslSubmitOtp,
  kfintechMailbackRequest,
} from '../services/mfCasparser/mfCasparser.service.js';
import { getCredits } from '../lib/casparserClient.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const cdslRequestSchema = z.object({
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN'),
  boId: z
    .string()
    .trim()
    .regex(/^\d{16}$/, 'BO ID must be 16 digits'),
  dob: isoDate,
  portfolioId: z.string().nullable().optional(),
  nickname: z.string().max(80).nullable().optional(),
});

const cdslSubmitSchema = z.object({
  jobId: z.string().min(1),
  otp: z.string().min(4).max(8),
});

const kfintechSchema = z.object({
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN'),
  email: z.string().email().max(120),
  fromDate: isoDate.nullable().optional(),
  toDate: isoDate.nullable().optional(),
});

export async function requestCdslOtp(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = cdslRequestSchema.parse(req.body ?? {});
  const result = await cdslRequestOtp({ userId: req.user.id, ...body });
  ok(res, result);
}

export async function submitCdslOtp(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = cdslSubmitSchema.parse(req.body ?? {});
  const result = await cdslSubmitOtp({ userId: req.user.id, ...body });
  ok(res, result);
}

export async function requestKfintechMailback(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = kfintechSchema.parse(req.body ?? {});
  const result = await kfintechMailbackRequest({ userId: req.user.id, ...body });
  ok(res, result);
}

export async function credits(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const result = await getCredits();
  ok(res, result);
}
