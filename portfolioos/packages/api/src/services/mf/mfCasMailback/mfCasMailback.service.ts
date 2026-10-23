import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../lib/errors.js';
import { writeIngestionFailure } from '../../imports/ingestionFailures.service.js';
import {
  initiateCamsMailback,
  submitCamsMailback,
  CamsMailbackError,
} from '../../../ingestion/mfMailback/camsMailback.js';
import {
  initiateKfintechMailback,
  submitKfintechMailback,
  KfintechMailbackError,
} from '../../../ingestion/mfMailback/kfintechMailback.js';
import { readPan } from '../../security/piiAtRest.service.js';
import { maskPan } from '../../auth/auth.service.js';

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

/**
 * The PAN a mailback for `userId` will use, masked for display.
 *
 * `userId` is the effective user — the managed profile while a manager is
 * acting for them. The dialog used to pre-fill the PAN from `/api/auth/pan/
 * reveal`, an account route that always runs as the signed-in person, so a
 * manager acting for a family member saw (and submitted) their OWN PAN while
 * the PDF password came from the member's profile. Reading it here, on a
 * data route, makes the displayed PAN the one the request will use.
 */
export async function getMailbackPan(userId: string): Promise<{ panMasked: string | null }> {
  return { panMasked: maskPan(await storedPan(userId)) };
}

async function storedPan(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pan: true, panEnc: true },
  });
  return readPan(user);
}

export interface InitiateInput {
  userId: string;
  /**
   * Omit to use the PAN on the effective user's profile — what the dialog
   * does, so it never has to hold the full PAN. Accepted when given, for
   * older clients.
   */
  pan?: string | null;
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
  const pan = (input.pan ?? (await storedPan(input.userId)) ?? '').trim().toUpperCase();
  if (!pan) {
    throw new BadRequestError('PAN not set on this profile. Add it in Settings → Profile first.');
  }
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
    pdfPassword = (await storedPan(input.userId)) ?? '';
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

/**
 * Senders that deliver a statement the user requested by mailback (CAMS,
 * KFintech, casparser.in). Depository senders (CDSL / NSDL) are left out on
 * purpose: their eCAS arrives every month whether or not anyone asked, so it
 * must not be routed by a mailback request made for something else.
 */
const MAILBACK_DELIVERY_DOMAINS = ['camsonline.com', 'cams-cas.com', 'kfintech.com', 'karvy.com', 'casparser.in'];

/** How long after a request its delivery is still matched to it. CAMS and
 *  KFintech deliver in minutes to hours; a week covers a slow queue. */
export const MAILBACK_TARGET_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** `submittedAt` is stamped after the portal call returns; a fast delivery
 *  can be timestamped a little before it. */
const MAILBACK_CLOCK_SLACK_MS = 10 * 60 * 1000;

/**
 * Which portfolio a CAS that arrived by email should be imported into.
 *
 * The mailback dialogs ask for a portfolio, but the statement arrives later
 * with nothing in it that says what was chosen. The request row recorded at
 * submit time carries the choice; this reads the latest request submitted in
 * the week before the email was received. Returns `null` — "use the default
 * portfolio", what the import did before — when the sender is not a mailback
 * sender, no request precedes the email, the request chose Default, or the
 * chosen portfolio has since been deleted.
 */
export async function casMailbackTarget(
  userId: string,
  from: string,
  receivedAt: Date,
): Promise<string | null> {
  const sender = from.toLowerCase();
  if (!MAILBACK_DELIVERY_DOMAINS.some((d) => sender.includes(`@${d}`) || sender.includes(`.${d}`))) {
    return null;
  }
  const job = await prisma.mFCasMailbackJob.findFirst({
    where: {
      userId,
      status: 'SUBMITTED',
      submittedAt: {
        gte: new Date(receivedAt.getTime() - MAILBACK_TARGET_WINDOW_MS),
        lte: new Date(receivedAt.getTime() + MAILBACK_CLOCK_SLACK_MS),
      },
    },
    orderBy: { submittedAt: 'desc' },
    select: { portfolioId: true },
  });
  if (!job?.portfolioId) return null;
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: job.portfolioId, userId },
    select: { id: true },
  });
  return portfolio?.id ?? null;
}
