import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { readPdfText, getUserPdfPasswords } from '../../lib/pdf.js';
import { writeIngestionFailure } from '../ingestionFailures.service.js';
import { createTransaction } from '../transaction.service.js';
import { parseMfCasText } from '../imports/parsers/mfCas.parser.js';
import {
  initiateMFCentralSync,
  submitMFCentralOtp,
  MFCentralError,
} from '../../adapters/mfcentral/mfCentralPlaywright.js';
import type { ParsedTransaction } from '../imports/parsers/types.js';

const SOURCE_ADAPTER = 'mfcentral.cas.v1';
const SOURCE_ADAPTER_VER = '1.0.0';
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const OTP_TTL_MS = 5 * 60 * 1000;

export interface RequestOtpInput {
  userId: string;
  pan: string;
  otpMethod: 'PHONE' | 'EMAIL';
  contactValue: string;
  portfolioId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  nickname?: string | null;
}

export interface RequestOtpResult {
  jobId: string;
  maskedContact: string;
  status: 'OTP_PENDING';
}

export interface SubmitOtpInput {
  userId: string;
  jobId: string;
  otp: string;
}

export interface SubmitOtpResult {
  jobId: string;
  status: 'COMPLETED' | 'FAILED';
  txnsCreated: number;
  fundsFound: number;
  warnings: string[];
  portfolioId: string | null;
  errorMessage?: string;
}

function mfCentralTxnHash(pan: string, tx: ParsedTransaction): string {
  return createHash('sha256')
    .update(
      `mfcentral:${pan}:${tx.isin ?? tx.assetName ?? ''}:${tx.tradeDate}:${tx.quantity}:${tx.transactionType}`,
    )
    .digest('hex');
}

async function resolvePortfolioId(
  userId: string,
  requested: string | null | undefined,
): Promise<string> {
  if (requested) {
    const p = await prisma.portfolio.findUnique({ where: { id: requested } });
    if (!p) throw new NotFoundError('Portfolio not found');
    if (p.userId !== userId) throw new ForbiddenError();
    return p.id;
  }
  const def =
    (await prisma.portfolio.findFirst({
      where: { userId, isDefault: true },
    })) ?? (await prisma.portfolio.findFirst({ where: { userId } }));
  if (!def) throw new BadRequestError('No portfolio found — create one first');
  return def.id;
}

export async function requestMFCentralOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
  const pan = input.pan.trim().toUpperCase();
  if (!PAN_REGEX.test(pan)) throw new BadRequestError('Invalid PAN format');
  if (!input.contactValue?.trim()) throw new BadRequestError('Phone or email required');

  const portfolioId = await resolvePortfolioId(input.userId, input.portfolioId);

  const job = await prisma.mFCentralSyncJob.create({
    data: {
      userId: input.userId,
      portfolioId,
      panLast4: pan.slice(-4),
      otpMethod: input.otpMethod,
      contactMasked: '',
      periodFrom: input.periodFrom ? new Date(`${input.periodFrom}T00:00:00.000Z`) : null,
      periodTo: input.periodTo ? new Date(`${input.periodTo}T00:00:00.000Z`) : null,
      nickname: input.nickname ?? null,
      status: 'OTP_PENDING',
    },
  });

  try {
    const { maskedContact } = await initiateMFCentralSync({
      jobId: job.id,
      pan,
      otpMethod: input.otpMethod,
      contactValue: input.contactValue,
    });

    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { contactMasked: maskedContact, playwrightSessionId: job.id },
    });

    return { jobId: job.id, maskedContact, status: 'OTP_PENDING' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OTP request failed';
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: msg },
    });
    await writeIngestionFailure({
      userId: input.userId,
      sourceAdapter: SOURCE_ADAPTER,
      adapterVersion: SOURCE_ADAPTER_VER,
      sourceRef: `mfcentral:job:${job.id}`,
      error: err instanceof Error ? err : new Error(msg),
      rawPayload: { stage: 'request-otp', otpMethod: input.otpMethod },
    });
    throw err;
  }
}

export async function submitOtpAndSync(input: SubmitOtpInput): Promise<SubmitOtpResult> {
  const job = await prisma.mFCentralSyncJob.findUnique({ where: { id: input.jobId } });
  if (!job) throw new NotFoundError('Sync job not found');
  if (job.userId !== input.userId) throw new ForbiddenError();
  if (job.status !== 'OTP_PENDING') {
    throw new BadRequestError(`Job is in status ${job.status}, expected OTP_PENDING`);
  }
  if (Date.now() - job.createdAt.getTime() > OTP_TTL_MS) {
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'EXPIRED', errorMessage: 'OTP timeout' },
    });
    throw new BadRequestError('OTP expired — please start a new sync');
  }

  await prisma.mFCentralSyncJob.update({
    where: { id: job.id },
    data: { status: 'OTP_SUBMITTED' },
  });

  let pdfPath: string | null = null;
  try {
    // Submit OTP, download PDF
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'DOWNLOADING' },
    });
    const submitResult = await submitMFCentralOtp({ jobId: job.id, otp: input.otp });
    pdfPath = submitResult.pdfPath;

    // Decrypt + parse
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'PARSING' },
    });

    // Decrypt CAS PDF. CAMS uses uppercase PAN; some variants use PAN+DOB.
    // getUserPdfPasswords returns all candidates ordered most→least likely.
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { pan: true, dob: true },
    });
    const userPan = user?.pan?.trim().toUpperCase() ?? '';
    if (!userPan) {
      throw new BadRequestError(
        'No PAN saved on user profile — cannot decrypt CAS PDF. Save your PAN in Settings.',
      );
    }
    if (userPan.slice(-4) !== job.panLast4) {
      logger.warn(
        { jobId: job.id, jobLast4: job.panLast4, userLast4: userPan.slice(-4) },
        '[mfcentral] PAN entered for sync differs from user.pan — decrypt may fail',
      );
    }

    const passwords = await getUserPdfPasswords(input.userId);
    const { text } = await readPdfText(pdfPath, passwords);
    const { transactions: parsed, warnings } = parseMfCasText(text);

    if (parsed.length === 0) {
      const finalWarnings = [...warnings, 'No mutual fund transactions found in CAS'];
      await prisma.mFCentralSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          txnsCreated: 0,
          fundsFound: 0,
          warningLog: finalWarnings,
          completedAt: new Date(),
          playwrightSessionId: null,
        },
      });
      return {
        jobId: job.id,
        status: 'COMPLETED',
        txnsCreated: 0,
        fundsFound: 0,
        warnings: finalWarnings,
        portfolioId: job.portfolioId,
      };
    }

    // Project to Transactions. createTransaction handles sourceHash dedup.
    let inserted = 0;
    const fundsSeen = new Set<string>();
    for (const tx of parsed) {
      try {
        const sourceHash = mfCentralTxnHash(userPan, tx);
        const existing = await prisma.transaction.findUnique({ where: { sourceHash } });
        const before = existing?.id;
        await createTransaction(input.userId, {
          portfolioId: job.portfolioId!,
          assetClass: tx.assetClass,
          transactionType: tx.transactionType,
          schemeName: tx.schemeName,
          assetName: tx.assetName,
          isin: tx.isin,
          tradeDate: tx.tradeDate,
          quantity: tx.quantity,
          price: tx.price,
          narration: tx.narration,
          sourceAdapter: SOURCE_ADAPTER,
          sourceAdapterVer: SOURCE_ADAPTER_VER,
          sourceHash,
        });
        if (!before) inserted++;
        const fundKey = tx.isin ?? tx.assetName ?? '';
        if (fundKey) fundsSeen.add(fundKey);
      } catch (err) {
        logger.warn({ err, jobId: job.id }, '[mfcentral] tx insert failed');
        warnings.push(`Failed to insert ${tx.assetName ?? tx.isin ?? 'a row'}: ${(err as Error).message}`);
      }
    }

    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        txnsCreated: inserted,
        fundsFound: fundsSeen.size,
        warningLog: warnings,
        completedAt: new Date(),
        playwrightSessionId: null,
      },
    });

    return {
      jobId: job.id,
      status: 'COMPLETED',
      txnsCreated: inserted,
      fundsFound: fundsSeen.size,
      warnings,
      portfolioId: job.portfolioId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed';
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: msg, playwrightSessionId: null },
    });
    await writeIngestionFailure({
      userId: input.userId,
      sourceAdapter: SOURCE_ADAPTER,
      adapterVersion: SOURCE_ADAPTER_VER,
      sourceRef: `mfcentral:job:${job.id}`,
      error: err instanceof Error ? err : new Error(msg),
      rawPayload: {
        stage: 'submit-otp',
        code: err instanceof MFCentralError ? err.code : undefined,
      },
    });
    throw err;
  } finally {
    if (pdfPath) {
      await fs.unlink(pdfPath).catch(() => undefined);
    }
  }
}

export async function getMFCentralSyncJob(userId: string, jobId: string) {
  const job = await prisma.mFCentralSyncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError('Sync job not found');
  if (job.userId !== userId) throw new ForbiddenError();
  return job;
}

export async function listMFCentralSyncJobs(userId: string, limit = 50) {
  return prisma.mFCentralSyncJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
