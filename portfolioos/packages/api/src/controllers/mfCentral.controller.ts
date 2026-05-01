import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  requestMFCentralOtp,
  submitOtpAndSync,
  getMFCentralSyncJob,
  listMFCentralSyncJobs,
} from '../services/mfcentral/mfCentral.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const requestOtpSchema = z.object({
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format'),
  otpMethod: z.enum(['PHONE', 'EMAIL']),
  contactValue: z.string().min(5).max(120),
  portfolioId: z.string().nullable().optional(),
  periodFrom: isoDate.nullable().optional(),
  periodTo: isoDate.nullable().optional(),
  nickname: z.string().max(80).nullable().optional(),
});

const submitOtpSchema = z.object({
  jobId: z.string().min(1),
  otp: z.string().min(4).max(8),
});

export async function requestOtp(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = requestOtpSchema.parse(req.body ?? {});
  const result = await requestMFCentralOtp({ userId: req.user.id, ...body });
  ok(res, result);
}

export async function submitOtp(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = submitOtpSchema.parse(req.body ?? {});
  const result = await submitOtpAndSync({ userId: req.user.id, ...body });
  ok(res, result);
}

export async function getJob(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const job = await getMFCentralSyncJob(req.user.id, req.params.id!);
  ok(res, job);
}

export async function listJobs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await listMFCentralSyncJobs(req.user.id);
  ok(res, rows);
}
