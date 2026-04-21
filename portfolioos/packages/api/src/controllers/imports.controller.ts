import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ImportType } from '@prisma/client';
import {
  createImportJob,
  deleteImportJob,
  getImportJob,
  listImportJobs,
  processImportJob,
} from '../services/imports/import.service.js';
import { ok, created } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';

const ImportTypeEnum = z.enum([
  'CONTRACT_NOTE_PDF',
  'CONTRACT_NOTE_EXCEL',
  'CONTRACT_NOTE_HTML',
  'MF_CAS_PDF',
  'MF_CAS_EXCEL',
  'BACK_OFFICE_CSV',
  'BANK_STATEMENT_PDF',
  'BANK_STATEMENT_CSV',
  'NPS_STATEMENT',
  'GENERIC_CSV',
  'GENERIC_EXCEL',
]);

const createSchema = z.object({
  portfolioId: z.string().min(1).nullable().optional(),
  type: ImportTypeEnum.optional(),
  broker: z.string().min(1).max(100).optional(),
});

function inferTypeFromFileName(fileName: string): ImportType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'GENERIC_EXCEL';
  return 'GENERIC_CSV';
}

export async function upload(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  if (!req.file) throw new BadRequestError('No file uploaded — field name must be "file"');

  const body = createSchema.parse(req.body ?? {});
  const type = body.type ?? inferTypeFromFileName(req.file.originalname);

  const job = await createImportJob({
    userId: req.user.id,
    portfolioId: body.portfolioId ?? null,
    type,
    fileName: req.file.originalname,
    filePath: req.file.path,
    broker: body.broker ?? null,
  });

  created(res, {
    id: job.id,
    status: job.status,
    type: job.type,
    fileName: job.fileName,
    createdAt: job.createdAt,
  });
}

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const jobs = await listImportJobs(req.user.id);
  ok(res, jobs);
}

export async function get(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id!;
  const job = await getImportJob(req.user.id, id);
  ok(res, job);
}

export async function remove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id!;
  await deleteImportJob(req.user.id, id);
  ok(res, { deleted: true });
}

export async function reprocess(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id!;
  const job = await getImportJob(req.user.id, id);
  const result = await processImportJob(job.id);
  ok(res, result);
}
