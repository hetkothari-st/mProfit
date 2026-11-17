/**
 * Policy Health Check endpoints.
 *
 * All endpoints require authentication and INSURANCE_HEALTH_CHECK feature.
 * Ownership is verified on every request — a different user's IDs always
 * return 404 or 403, never the actual data.
 *
 * Documents are UNTRUSTED DATA: extracted text is stored as-is and passed
 * to downstream services as data only, never executed.
 */

import type { Request, Response } from 'express';
import multer from 'multer';
import { extname } from 'node:path';
import { z } from 'zod';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { ok, created } from '../lib/response.js';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { Prisma } from '@prisma/client';
import { getPolicyCheckQueue } from '../lib/queue.js';
import { env } from '../config/env.js';
import { createDocument } from '../services/documents/document.service.js';
import { extractPolicyData } from '../services/policyCheck/extract.service.js';
import { PolicyExtractionSchema } from '../services/policyCheck/extractionSchema.js';
import { runPolicyAnalysis } from '../services/policyCheck/analysisEngine.service.js';
import { assertAnalysisCooldown } from '../jobs/policyCheckJob.js';
import { enqueuePolicyProse } from '../jobs/policyCheckProseJob.js';
import { simulateFinancialOutcome } from '../services/policyCheck/financialSimulator.service.js';
import { getInsurerIntelligence } from '../services/policyCheck/insurerMetrics.service.js';
import type { FinancialSimulatorInput } from '@everypaisa/shared';

// ---------------------------------------------------------------------------
// Multer setup
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file

export const uploadPolicyDocuments = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new BadRequestError(`Unsupported file type: ${ext}. Accepted: PDF, PNG, JPEG, TIFF, BMP, WEBP`));
      return;
    }
    cb(null, true);
  },
}).array('files', MAX_FILES);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect the real file type from leading bytes. Returns null if unsupported. */
export function detectMimeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const isLeTiff = buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00;
  const isBeTiff = buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a;
  if (isLeTiff || isBeTiff) return 'image/tiff';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function getUserId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

/** Assert the check belongs to this user and return it. */
async function getCheckOrThrow(checkId: string, userId: string) {
  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: {
      id: true,
      userId: true,
      policyId: true,
      status: true,
      asOf: true,
      scoringVersion: true,
      triggeredBy: true,
      startedAt: true,
      completedAt: true,
      llmSpendInr: true,
      docs: {
        select: {
          id: true,
          checkId: true,
          documentId: true,
          classification: true,
          pageCount: true,
          ocrUsed: true,
        },
      },
    },
  });
  if (!check) throw new NotFoundError('Health check not found');
  return check;
}

// ---------------------------------------------------------------------------
// POST /api/insurance/policies/:id/health-check
// ---------------------------------------------------------------------------

/**
 * Create a new PolicyHealthCheck for a HEALTH-type insurance policy.
 * Validates policy belongs to user and type === 'HEALTH'.
 * Returns the checkId immediately; extraction is async.
 */
export async function createHealthCheckHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const policyId = req.params['id']!;

  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: policyId, userId },
    select: { id: true, type: true },
  });

  if (!policy) throw new NotFoundError('Policy not found');
  if (policy.type !== 'HEALTH') {
    throw new BadRequestError('Health checks are only supported for HEALTH-type policies');
  }

  const check = await runInTransaction((tx) =>
    tx.policyHealthCheck.create({
      data: {
        userId,
        policyId,
        status: 'EXTRACTING',
        asOf: new Date(),
        factsSnapshot: {},
        ruleVersionsSnapshot: [],
        scoreSnapshot: {},
        triggeredBy: 'USER_REQUEST',
        scoringVersion: 'policy_check_v1',
      },
      select: { id: true },
    }),
  );

  logger.info({ checkId: check.id, policyId, userId }, '[policyCheck] health check created');

  created(res, { checkId: check.id });
}

// ---------------------------------------------------------------------------
// POST /api/insurance/health-check/:checkId/documents
// ---------------------------------------------------------------------------

/**
 * Upload documents for a health check. Accepts up to 10 files.
 * Stores each file as a Document (ownerType INSURANCE_POLICY) and
 * enqueues text extraction.
 */
export async function uploadDocumentsHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  const check = await getCheckOrThrow(checkId, userId);

  if (!Array.isArray(req.files) || req.files.length === 0) {
    throw new BadRequestError('At least one file is required');
  }

  const createdDocIds: string[] = [];

  for (const file of req.files as Express.Multer.File[]) {
    // Trust the bytes, never the client-declared mimetype.
    const detectedMime = detectMimeFromMagicBytes(file.buffer);
    if (!detectedMime) {
      throw new BadRequestError(
        `File "${file.originalname}" is not a recognized PDF or image (magic bytes check failed)`,
      );
    }

    const doc = await createDocument({
      userId,
      ownerType: 'INSURANCE_POLICY',
      ownerId: check.policyId,
      category: 'policy_health_check',
      fileName: file.originalname,
      mimeType: detectedMime,
      buffer: file.buffer,
    });

    createdDocIds.push(doc.id);
  }

  // Enqueue text extraction
  if (env.ENABLE_POLICY_CHECK_JOB !== 'false') {
    await getPolicyCheckQueue().add(
      { checkId, userId, phase: 'extraction' },
      // Unique per upload batch: Bull silently drops a reused jobId, which would
      // leave later-added documents never extracted.
      { jobId: `extract:${checkId}:${Date.now()}` },
    );
  }

  logger.info(
    { checkId, userId, docCount: createdDocIds.length },
    '[policyCheck] documents uploaded, extraction queued',
  );

  ok(res, { checkId, uploadedDocIds: createdDocIds });
}

// ---------------------------------------------------------------------------
// POST /api/insurance/health-check/:checkId/extract
// ---------------------------------------------------------------------------

/** Trigger LLM extraction for a check that has EXTRACTED docs. */
export async function triggerExtractionHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: { id: true, status: true },
  });
  if (!check) throw new NotFoundError('Health check not found');

  if (!['EXTRACTED', 'EXTRACTING'].includes(check.status)) {
    throw new BadRequestError(`Check status is '${check.status}' — expected EXTRACTED or EXTRACTING`);
  }

  const result = await extractPolicyData(checkId, userId);

  ok(res, result);
}

// ---------------------------------------------------------------------------
// GET /api/insurance/health-check/:checkId/extraction
// ---------------------------------------------------------------------------

/** Return extracted fields with confidence + source citations. */
export async function getExtractionHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  // Verify check ownership
  await getCheckOrThrow(checkId, userId);

  const data = await prisma.extractedPolicyData.findUnique({
    where: { checkId },
    select: { id: true, fields: true, verifiedAt: true, version: true, conflicts: true },
  });

  if (!data) throw new NotFoundError('Extracted data not found — run extraction first');

  ok(res, {
    id: data.id,
    checkId,
    fields: data.fields,
    conflicts: data.conflicts ?? [],
    verifiedAt: data.verifiedAt?.toISOString() ?? null,
    version: data.version,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/insurance/health-check/:checkId/extraction
// ---------------------------------------------------------------------------

/** Save user corrections to extracted fields; transitions status to VERIFIED. */
export async function patchExtractionHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  // Verify check ownership
  await getCheckOrThrow(checkId, userId);

  const existing = await prisma.extractedPolicyData.findUnique({
    where: { checkId },
    select: { id: true, fields: true, version: true, conflicts: true },
  });
  if (!existing) throw new NotFoundError('No extracted data to update');

  // Merge corrections: the body is a partial set of field overrides.
  // Each overridden field gets status USER_EDITED.
  const corrections = req.body as Record<string, unknown>;
  const currentFields = existing.fields as Record<string, unknown>;

  const updatedFields = { ...currentFields };
  for (const [key, correctedValue] of Object.entries(corrections ?? {})) {
    // Only known extraction fields may be edited — unknown keys would flow
    // straight into the rule engine.
    if (!Object.prototype.hasOwnProperty.call(currentFields, key)) {
      throw new BadRequestError(`Unknown field: ${key}`);
    }
    if (correctedValue && typeof correctedValue === 'object') {
      updatedFields[key] = {
        ...(currentFields[key] as Record<string, unknown> ?? {}),
        ...(correctedValue as Record<string, unknown>),
        status: 'USER_EDITED',
      };
    }
  }
  // The merged result must still be a valid extraction.
  const validated = PolicyExtractionSchema.safeParse(updatedFields);
  if (!validated.success) {
    throw new BadRequestError('Corrected values are invalid: ' + validated.error.issues.slice(0, 3).map((i) => i.path.join('.') + ' ' + i.message).join('; '));
  }

  // A field the user has set is no longer in dispute between documents.
  const edited = Object.keys(corrections ?? {});
  const remainingConflicts = ((existing.conflicts as unknown as Array<{ field: string }> | null) ?? []).filter(
    (c) => !edited.some((k) => c.field === k || c.field.startsWith(k + '.')),
  );

  await runInTransaction(async (tx) => {
    await tx.extractedPolicyData.update({
      where: { checkId },
      data: {
        conflicts: remainingConflicts.length > 0 ? (remainingConflicts as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        fields: updatedFields as Parameters<typeof tx.extractedPolicyData.update>[0]['data']['fields'],
        verifiedAt: new Date(),
        version: existing.version + 1,
      },
    });

    await tx.policyHealthCheck.update({
      where: { id: checkId },
      data: { status: 'VERIFIED' },
    });
  });

  ok(res, { checkId, version: existing.version + 1, status: 'VERIFIED' });
}

// ---------------------------------------------------------------------------
// GET /api/insurance/health-check/:checkId
// ---------------------------------------------------------------------------

/** Polling endpoint: returns check status + extraction docs. */
export async function getHealthCheckHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  const check = await getCheckOrThrow(checkId, userId);

  ok(res, {
    id: check.id,
    userId: check.userId,
    policyId: check.policyId,
    status: check.status,
    asOf: check.asOf.toISOString(),
    scoringVersion: check.scoringVersion,
    triggeredBy: check.triggeredBy,
    startedAt: check.startedAt.toISOString(),
    completedAt: check.completedAt?.toISOString() ?? null,
    llmSpendInr: check.llmSpendInr?.toString() ?? null,
    docs: check.docs,
  });
}

// ---------------------------------------------------------------------------
// POST /api/insurance/health-check/:checkId/analyze
// ---------------------------------------------------------------------------

/** Trigger the full rules + scoring + verdict analysis for a VERIFIED check. */
export async function triggerAnalysisHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: { id: true, status: true },
  });
  if (!check) throw new NotFoundError('Health check not found');

  // Already running (page reload, double click, React dev double-mount): not an error.
  if (check.status === 'ANALYZING') {
    ok(res, { checkId, status: 'ANALYZING', alreadyRunning: true });
    return;
  }

  // A failed or finished run can be re-run; an unextracted one cannot.
  if (!['VERIFIED', 'EXTRACTED', 'FAILED', 'COMPLETED', 'PARTIAL'].includes(check.status)) {
    throw new BadRequestError(
      `Check status is '${check.status}' — finish extraction and review before analysing`,
    );
  }

  await assertAnalysisCooldown(checkId, userId);

  // The rules, scoring and verdict are deterministic and take well under a
  // second, so run them here rather than depending on a queue worker: nothing
  // to stall, and the caller gets the outcome (or the error) in one response.
  const result = await runPolicyAnalysis(checkId, userId);

  // Optional plain-language summary (LLM). Best effort — never fails the analysis.
  try {
    enqueuePolicyProse(userId, checkId);
  } catch (err) {
    logger.warn({ err, checkId }, '[policyCheck] could not queue verdict prose');
  }

  ok(res, { checkId, status: result.status, verdictId: result.verdictId });
}

// ---------------------------------------------------------------------------
// GET /api/insurance/health-check/:checkId/report
// ---------------------------------------------------------------------------

/**
 * Assemble and return the full health check report with all 10 sections:
 *  1. Policy Overview
 *  2. Verdict + score
 *  3. What's Good (INFO findings)
 *  4. Needs Attention (NOTICE + WARNING findings)
 *  5. Critical Limitations (CRITICAL findings)
 *  6. Parameter analysis table (extracted fields)
 *  7. Financial Simulator inputs (populated from extraction)
 *  8. Insurer Performance (IRDAI metrics)
 *  9. Recommendations
 *  10. Evidence & References
 */
export async function getReportHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: {
      id: true,
      policyId: true,
      status: true,
      asOf: true,
      scoringVersion: true,
      scoreSnapshot: true,
      llmSpendInr: true,
      startedAt: true,
      completedAt: true,
      docs: { select: { id: true, documentId: true, classification: true, pageCount: true, ocrUsed: true } },
    },
  });

  if (!check) throw new NotFoundError('Health check not found');
  if (!['COMPLETED', 'PARTIAL'].includes(check.status)) {
    throw new BadRequestError(`Report is not ready — check status is '${check.status}'`);
  }

  const [extractedData, findings, verdict, policy] = await Promise.all([
    prisma.extractedPolicyData.findUnique({
      where: { checkId },
      select: { fields: true, verifiedAt: true, version: true },
    }),
    prisma.policyFinding.findMany({
      where: { checkId, userId },
      orderBy: [{ severity: 'asc' }, { code: 'asc' }],
    }),
    prisma.policyVerdict.findFirst({
      where: { checkId, userId, supersededById: null },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.insurancePolicy.findFirst({
      where: { id: check.policyId, userId },
      select: { id: true, insurer: true, type: true, planName: true, sumAssured: true, startDate: true, maturityDate: true },
    }),
  ]);

  // Insurer intelligence
  const insurerName =
    extractedData?.fields !== null &&
    typeof extractedData?.fields === 'object' &&
    (extractedData.fields as Record<string, unknown>)['insurerName'] !== undefined
      ? ((extractedData.fields as Record<string, { value: string | null }>)['insurerName']?.value ?? policy?.insurer ?? null)
      : policy?.insurer ?? null;

  const insurerIntel = insurerName
    ? await getInsurerIntelligence(insurerName)
    : null;

  ok(res, {
    checkId,
    policyId: check.policyId,
    status: check.status,
    asOf: check.asOf.toISOString(),
    generatedAt: new Date().toISOString(),
    sections: {
      policyOverview: { policy, extractedFields: extractedData?.fields ?? null },
      verdict: verdict
        ? {
            verdict: verdict.verdict,
            score: verdict.score?.toString() ?? null,
            reasons: verdict.reasons,
            prose: verdict.prose,
            proseVerified: verdict.proseVerified,
          }
        : null,
      scoreSnapshot: check.scoreSnapshot,
      whatsGood: findings.filter((f) => f.severity === 'INFO').map(toFindingDTO),
      needsAttention: findings
        .filter((f) => f.severity === 'NOTICE' || f.severity === 'WARNING')
        .map(toFindingDTO),
      criticalLimitations: findings.filter((f) => f.severity === 'CRITICAL').map(toFindingDTO),
      parameterAnalysis: extractedData?.fields ?? null,
      insurerPerformance: insurerIntel,
      docs: check.docs,
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/insurance/policies/:id/health-checks  (analysis history)
// ---------------------------------------------------------------------------

export async function listHealthChecksHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const policyId = req.params['id']!;

  const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId }, select: { id: true } });
  if (!policy) throw new NotFoundError('Policy not found');

  const checks = await prisma.policyHealthCheck.findMany({
    where: { policyId, userId },
    orderBy: { startedAt: 'desc' },
    take: 50,
    select: { id: true, status: true, asOf: true, completedAt: true, scoreSnapshot: true },
  });
  const verdicts = await prisma.policyVerdict.findMany({
    where: { userId, checkId: { in: checks.map((c) => c.id) }, supersededById: null },
    select: { checkId: true, verdict: true },
  });
  const verdictByCheck = new Map(verdicts.map((v) => [v.checkId, v.verdict]));

  ok(res, {
    checks: checks.map((c) => ({
      checkId: c.id,
      status: c.status,
      asOf: c.asOf.toISOString(),
      completedAt: c.completedAt?.toISOString() ?? null,
      score: (c.scoreSnapshot as { overall?: string | null } | null)?.overall ?? null,
      verdict: verdictByCheck.get(c.id) ?? null,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST /api/insurance/health-check/:checkId/simulate
// ---------------------------------------------------------------------------

/** Run the financial simulator for a health check. */
export async function simulateHandler(req: Request, res: Response) {
  const userId = getUserId(req);
  const checkId = req.params['checkId']!;

  // Ownership check
  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: { id: true },
  });
  if (!check) throw new NotFoundError('Health check not found');

  const data = await prisma.extractedPolicyData.findUnique({
    where: { checkId },
    select: { fields: true },
  });
  if (!data) throw new BadRequestError('No extracted data — run extraction first');

  const input = req.body as FinancialSimulatorInput;
  if (!input.totalBillInr) throw new BadRequestError('totalBillInr is required');

  const extraction = data.fields as unknown as import('../services/policyCheck/extractionSchema.js').PolicyExtraction;
  const result = simulateFinancialOutcome(input, extraction);

  ok(res, result);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFindingDTO(f: {
  id: string;
  checkId: string;
  ruleId: string;
  ruleVersion: string;
  code: string;
  category: string;
  severity: string;
  confidence: { toString(): string };
  headline: string;
  evidence: unknown;
  whatWouldChangeThis: string;
  createdAt: Date;
}) {
  return {
    id: f.id,
    checkId: f.checkId,
    ruleId: f.ruleId,
    ruleVersion: f.ruleVersion,
    code: f.code,
    category: f.category,
    severity: f.severity,
    confidence: f.confidence.toString(),
    headline: f.headline,
    evidence: f.evidence,
    whatWouldChangeThis: f.whatWouldChangeThis,
    createdAt: f.createdAt.toISOString(),
  };
}