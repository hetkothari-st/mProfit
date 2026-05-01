import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  initiateMailbackJob,
  submitMailbackJob,
  getMailbackJob,
  listMailbackJobs,
} from '../services/mfCasMailback/mfCasMailback.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const initiateSchema = z.object({
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN'),
  email: z.string().email().max(120),
  portfolioId: z.string().nullable().optional(),
  periodFrom: isoDate.nullable().optional(),
  periodTo: isoDate.nullable().optional(),
  nickname: z.string().max(80).nullable().optional(),
  providers: z.array(z.enum(['CAMS', 'KFINTECH'])).optional(),
});

const submitSchema = z.object({
  jobId: z.string().min(1),
  pdfPassword: z.string().min(4).max(60).optional(),
  // Captcha is optional — adapter returns null when CAMS doesn't show one.
  cams: z
    .object({ sessionKey: z.string(), captcha: z.string().max(20).optional().default('') })
    .nullable()
    .optional(),
  kfintech: z
    .object({ sessionKey: z.string(), captcha: z.string().max(20).optional().default('') })
    .nullable()
    .optional(),
});

export async function initiate(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = initiateSchema.parse(req.body ?? {});
  const result = await initiateMailbackJob({ userId: req.user.id, ...body });
  ok(res, result);
}

export async function submit(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = submitSchema.parse(req.body ?? {});
  const result = await submitMailbackJob({ userId: req.user.id, ...body });
  ok(res, result);
}

export async function getJob(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const job = await getMailbackJob(req.user.id, req.params.id!);
  ok(res, job);
}

export async function listJobs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await listMailbackJobs(req.user.id);
  ok(res, rows);
}
