import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ImportType } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';
import {
  createImportJob,
  deleteImportJob,
  getImportJob,
  listImportJobs,
  processImportJob,
} from '../services/imports/import.service.js';
import { ok, created } from '../lib/response.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { verifyUploadedFile } from '../lib/uploadSecurity.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

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
  password: z.string().min(1).max(200).optional(),
});

function inferTypeFromFileName(fileName: string): ImportType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'GENERIC_EXCEL';
  return 'GENERIC_CSV';
}

const REGULATORY_PATTERNS: RegExp[] = [
  /retention[-_\s]?(?:account[-_\s]?)?statement/i,
  /\bmargin[-_\s]?statement\b/i,
  /\bmargin[-_\s]?pledge\b/i,
  /\bsebi[-_\s]?circular\b/i,
  /\bannual[-_\s]?report\b/i,
  /\bwelcome[-_\s]?kit\b/i,
];

function isRegulatoryDoc(fileName: string): string | null {
  if (/retention[-_\s]?(?:account[-_\s]?)?statement/i.test(fileName)) {
    return 'This is a SEBI-mandated broker retention/compliance report — it contains no transactions or holdings to import. Zerodha sends these automatically; you can ignore them.';
  }
  if (/\bmargin[-_\s]?statement\b/i.test(fileName)) {
    return 'This is a margin utilisation statement — it contains no importable transaction data.';
  }
  if (REGULATORY_PATTERNS.some((re) => re.test(fileName))) {
    return 'This appears to be a regulatory compliance document with no importable transaction data.';
  }
  return null;
}

export async function upload(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  if (!req.file) throw new BadRequestError('No file uploaded — field name must be "file"');

  // Real content-type check before anything else touches this file —
  // catches disguised uploads (e.g. a renamed .exe/.txt masquerading as
  // .pdf) that a plain extension allowlist can't. Encrypted/password-
  // protected PDFs and XLSX still pass here (their magic bytes are
  // unaffected by encryption); unlocking happens later in the worker.
  const claimedExt = path.extname(req.file.originalname).toLowerCase();
  const verification = await verifyUploadedFile(req.file.path, claimedExt);
  if (!verification.ok) {
    fs.unlink(req.file.path, () => {});
    logger.warn(
      {
        userId: req.user.id,
        fileName: req.file.originalname,
        claimedExt,
        detectedKind: verification.detectedKind,
        detectedMime: verification.detectedMime,
      },
      '[imports] rejected upload — content does not match claimed extension',
    );
    await writeIngestionFailure({
      userId: req.user.id,
      sourceAdapter: 'upload.contentVerification',
      adapterVersion: '1',
      sourceRef: req.file.originalname,
      error: verification.detail ?? 'Content-type mismatch',
      rawPayload: {
        claimedExt,
        detectedKind: verification.detectedKind,
        detectedMime: verification.detectedMime,
      },
    });
    throw new BadRequestError(
      verification.detail ?? 'Uploaded file content does not match its extension.',
    );
  }

  const regulatoryReason = isRegulatoryDoc(req.file.originalname);
  if (regulatoryReason) {
    // Delete the uploaded temp file immediately — nothing to process
    fs.unlink(req.file.path, () => {});
    throw new BadRequestError(regulatoryReason);
  }

  const body = createSchema.parse(req.body ?? {});
  const type = body.type ?? inferTypeFromFileName(req.file.originalname);

  const job = await createImportJob({
    userId: req.user.id,
    portfolioId: body.portfolioId ?? null,
    type,
    fileName: req.file.originalname,
    filePath: req.file.path,
    broker: body.broker ?? null,
    pdfPassword: body.password ?? null,
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

  // Caller supplies a password to unlock a NEEDS_PASSWORD / FAILED job.
  // Two persistence rules — applied AFTER the job actually runs so a
  // wrong password never pollutes the saved-password list:
  //   - PAN-shaped → save to User.pan (only if not already set).
  //   - Anything else with `save:true` (default) → append to encrypted
  //     User.savedFilePasswordsEnc list, tried automatically on every
  //     future locked file the user uploads.
  const { password, save } = z
    .object({
      password: z.string().min(1).optional(),
      save: z.boolean().optional().default(true),
    })
    .parse(req.body ?? {});

  const result = await processImportJob(job.id, password);

  // Persist only when the password actually unlocked the file. The job's
  // post-process status tells us: NEEDS_PASSWORD = still locked → don't
  // save; anything else = the password was either correct or unused
  // (job had no encryption to begin with).
  if (password) {
    const after = await prisma.importJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    const unlocked = after?.status !== 'NEEDS_PASSWORD';
    if (unlocked) {
      const trimmed = password.trim().toUpperCase();
      const isPan = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(trimmed);
      if (isPan) {
        const existing = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { pan: true },
        });
        if (!existing?.pan) {
          await prisma.user.update({
            where: { id: req.user.id },
            data: { pan: trimmed },
          });
        }
      } else if (save) {
        const { saveDocPassword } = await import('../lib/userDocPasswords.js');
        await saveDocPassword(req.user.id, password);
      }
    }
  }

  ok(res, result);
}

export async function download(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id!;
  const job = await getImportJob(req.user.id, id);

  if (!job.filePath || !fs.existsSync(job.filePath)) {
    throw new NotFoundError('Source file not found on server');
  }

  res.download(job.filePath, job.fileName);
}
