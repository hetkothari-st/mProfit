import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { writeIngestionFailure } from '../ingestionFailures.service.js';
import {
  initiateCamsMailback,
  submitCamsMailback,
  CamsMailbackError,
} from '../../adapters/mfMailback/camsMailback.js';
import {
  initiateKfintechMailback,
  submitKfintechMailback,
  KfintechMailbackError,
} from '../../adapters/mfMailback/kfintechMailback.js';

const SOURCE_ADAPTER = 'mfcas.mailback.v1';
const SOURCE_ADAPTER_VER = '1.0.0';
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function maskEmail(s: string): string {
  const [local, domain] = s.split('@');
  if (!local || !domain) return s;
  const visible = local.slice(0, 3);
  return `${visible}${'X'.repeat(Math.max(1, local.length - 3))}@${domain}`;
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
    (await prisma.portfolio.findFirst({ where: { userId, isDefault: true } })) ??
    (await prisma.portfolio.findFirst({ where: { userId } }));
  if (!def) throw new BadRequestError('No portfolio found — create one first');
  return def.id;
}

export interface InitiateInput {
  userId: string;
  pan: string;
  email: string;
  portfolioId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  nickname?: string | null;
  providers?: ('CAMS' | 'KFINTECH')[]; // default = both
}

export interface InitiateResult {
  jobId: string;
  emailMasked: string;
  cams: { sessionKey: string; captchaImageBase64: string | null } | null;
  kfintech: { sessionKey: string; captchaImageBase64: string | null } | null;
}

export async function initiateMailbackJob(input: InitiateInput): Promise<InitiateResult> {
  const pan = input.pan.trim().toUpperCase();
  if (!PAN_REGEX.test(pan)) throw new BadRequestError('Invalid PAN format');
  if (!input.email.includes('@')) throw new BadRequestError('Email required');

  const portfolioId = await resolvePortfolioId(input.userId, input.portfolioId);
  const providers = input.providers && input.providers.length > 0
    ? input.providers
    : (['CAMS', 'KFINTECH'] as const);

  const job = await prisma.mFCasMailbackJob.create({
    data: {
      userId: input.userId,
      portfolioId,
      panLast4: pan.slice(-4),
      emailMasked: maskEmail(input.email),
      periodFrom: input.periodFrom ? new Date(`${input.periodFrom}T00:00:00.000Z`) : null,
      periodTo: input.periodTo ? new Date(`${input.periodTo}T00:00:00.000Z`) : null,
      nickname: input.nickname ?? null,
      camsStatus: providers.includes('CAMS') ? 'PENDING' : 'NOT_REQUESTED',
      kfintechStatus: providers.includes('KFINTECH') ? 'PENDING' : 'NOT_REQUESTED',
      status: 'CAPTCHA_REQUIRED',
    },
  });

  let cams: InitiateResult['cams'] = null;
  let kfintech: InitiateResult['kfintech'] = null;

  if (providers.includes('CAMS')) {
    const sessionKey = `${job.id}:cams`;
    try {
      const r = await initiateCamsMailback({ sessionKey, pan, email: input.email });
      cams = { sessionKey, captchaImageBase64: r.captchaImageBase64 };
    } catch (err) {
      logger.warn({ err, jobId: job.id }, '[mfcas-mailback] CAMS initiate failed');
      await prisma.mFCasMailbackJob.update({
        where: { id: job.id },
        data: { camsStatus: 'FAILED', camsErrorMessage: (err as Error).message },
      });
    }
  }

  if (providers.includes('KFINTECH')) {
    const sessionKey = `${job.id}:kfin`;
    try {
      const r = await initiateKfintechMailback({ sessionKey, pan, email: input.email });
      kfintech = { sessionKey, captchaImageBase64: r.captchaImageBase64 };
    } catch (err) {
      logger.warn({ err, jobId: job.id }, '[mfcas-mailback] KFintech initiate failed');
      await prisma.mFCasMailbackJob.update({
        where: { id: job.id },
        data: { kfintechStatus: 'FAILED', kfintechErrorMessage: (err as Error).message },
      });
    }
  }

  if (!cams && !kfintech) {
    await prisma.mFCasMailbackJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'No provider initiated successfully' },
    });
    throw new BadRequestError(
      'Failed to reach CAMS or KFintech portals. Try again or use PDF upload.',
    );
  }

  return {
    jobId: job.id,
    emailMasked: maskEmail(input.email),
    cams,
    kfintech,
  };
}

export interface SubmitInput {
  userId: string;
  jobId: string;
  pdfPassword?: string; // optional — defaults to user.pan from profile
  cams?: { sessionKey: string; captcha: string } | null;
  kfintech?: { sessionKey: string; captcha: string } | null;
}

export interface SubmitResult {
  jobId: string;
  status: 'SUBMITTED' | 'FAILED';
  cams: { ok: boolean; requestRef: string | null; message: string } | null;
  kfintech: { ok: boolean; requestRef: string | null; message: string } | null;
}

export async function submitMailbackJob(input: SubmitInput): Promise<SubmitResult> {
  const job = await prisma.mFCasMailbackJob.findUnique({ where: { id: input.jobId } });
  if (!job) throw new NotFoundError('Mailback job not found');
  if (job.userId !== input.userId) throw new ForbiddenError();
  if (job.status !== 'CAPTCHA_REQUIRED') {
    throw new BadRequestError(`Job in status ${job.status}, expected CAPTCHA_REQUIRED`);
  }
  // PDF password defaults to user's saved PAN (Settings page). This guarantees
  // our existing decrypt path (getUserPdfPasswords) auto-unlocks the PDF when
  // it arrives via Gmail integration without prompting the user.
  let pdfPassword = input.pdfPassword;
  if (!pdfPassword) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { pan: true },
    });
    pdfPassword = user?.pan?.trim().toUpperCase() ?? '';
  }
  if (!pdfPassword || pdfPassword.length < 4) {
    throw new BadRequestError(
      'PAN not set on profile. Set PAN in Settings first — it doubles as the CAS PDF password.',
    );
  }

  await prisma.mFCasMailbackJob.update({
    where: { id: job.id },
    data: { status: 'SUBMITTING' },
  });

  const periodFrom = job.periodFrom?.toISOString().slice(0, 10) ?? null;
  const periodTo = job.periodTo?.toISOString().slice(0, 10) ?? null;

  let camsResult: SubmitResult['cams'] = null;
  let kfintechResult: SubmitResult['kfintech'] = null;

  if (input.cams && job.camsStatus === 'PENDING') {
    try {
      const r = await submitCamsMailback({
        sessionKey: input.cams.sessionKey,
        captcha: input.cams.captcha,
        periodFrom,
        periodTo,
        pdfPassword,
      });
      camsResult = r;
      await prisma.mFCasMailbackJob.update({
        where: { id: job.id },
        data: {
          camsStatus: r.ok ? 'SUBMITTED' : 'FAILED',
          camsRequestRef: r.requestRef,
          camsErrorMessage: r.ok ? null : r.message,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CAMS submit failed';
      camsResult = { ok: false, requestRef: null, message: msg };
      await prisma.mFCasMailbackJob.update({
        where: { id: job.id },
        data: { camsStatus: 'FAILED', camsErrorMessage: msg },
      });
      await writeIngestionFailure({
        userId: input.userId,
        sourceAdapter: `${SOURCE_ADAPTER}.cams`,
        adapterVersion: SOURCE_ADAPTER_VER,
        sourceRef: `mfcas-mailback:${job.id}:cams`,
        error: err instanceof Error ? err : new Error(msg),
        rawPayload: { stage: 'submit', code: err instanceof CamsMailbackError ? err.code : undefined },
      });
    }
  }

  if (input.kfintech && job.kfintechStatus === 'PENDING') {
    try {
      const r = await submitKfintechMailback({
        sessionKey: input.kfintech.sessionKey,
        captcha: input.kfintech.captcha,
        periodFrom,
        periodTo,
        pdfPassword,
      });
      kfintechResult = r;
      await prisma.mFCasMailbackJob.update({
        where: { id: job.id },
        data: {
          kfintechStatus: r.ok ? 'SUBMITTED' : 'FAILED',
          kfintechRequestRef: r.requestRef,
          kfintechErrorMessage: r.ok ? null : r.message,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'KFintech submit failed';
      kfintechResult = { ok: false, requestRef: null, message: msg };
      await prisma.mFCasMailbackJob.update({
        where: { id: job.id },
        data: { kfintechStatus: 'FAILED', kfintechErrorMessage: msg },
      });
      await writeIngestionFailure({
        userId: input.userId,
        sourceAdapter: `${SOURCE_ADAPTER}.kfintech`,
        adapterVersion: SOURCE_ADAPTER_VER,
        sourceRef: `mfcas-mailback:${job.id}:kfintech`,
        error: err instanceof Error ? err : new Error(msg),
        rawPayload: { stage: 'submit', code: err instanceof KfintechMailbackError ? err.code : undefined },
      });
    }
  }

  const camsOk = !camsResult || camsResult.ok;
  const kfinOk = !kfintechResult || kfintechResult.ok;
  const anyOk = (camsResult?.ok ?? false) || (kfintechResult?.ok ?? false);
  const allFailed = (camsResult && !camsResult.ok) && (kfintechResult && !kfintechResult.ok);

  const finalStatus: 'SUBMITTED' | 'FAILED' =
    allFailed || (!anyOk && (camsResult || kfintechResult)) ? 'FAILED' : 'SUBMITTED';

  await prisma.mFCasMailbackJob.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      submittedAt: new Date(),
      errorMessage: finalStatus === 'FAILED' ? 'Both providers failed; see per-provider details' : null,
    },
  });

  // Lint hint: camsOk/kfinOk computed for future use; intentional.
  void camsOk;
  void kfinOk;

  return {
    jobId: job.id,
    status: finalStatus,
    cams: camsResult,
    kfintech: kfintechResult,
  };
}

export async function getMailbackJob(userId: string, jobId: string) {
  const job = await prisma.mFCasMailbackJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError('Mailback job not found');
  if (job.userId !== userId) throw new ForbiddenError();
  return job;
}

export async function listMailbackJobs(userId: string, limit = 50) {
  return prisma.mFCasMailbackJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
