import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import type { TransactionType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { writeIngestionFailure } from '../ingestionFailures.service.js';
import { createTransaction } from '../transaction.service.js';
import {
  cdslFetchInit,
  cdslFetchVerify,
  kfintechGenerate,
  CasparserError,
  type CasUnifiedResponse,
  type MfTxn,
} from '../../lib/casparserClient.js';

// Reuse MFCentralSyncJob row to track state — fields fit cleanly:
//   panLast4 = last 4 of PAN
//   otpMethod = always 'PHONE' for CDSL (OTP goes to PAN-registered mobile)
//   contactMasked = otp_sent_to from casparser response
//   playwrightSessionId = casparser session_id
//   status = OTP_PENDING → OTP_SUBMITTED → PARSING → COMPLETED / FAILED / EXPIRED

const SOURCE_ADAPTER = 'casparser.cdsl.v4';
const SOURCE_ADAPTER_VER = '1.0.0';
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const OTP_TTL_MS = 10 * 60 * 1000;

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

function txnHash(pan: string, schemeKey: string, t: MfTxn): string {
  return createHash('sha256')
    .update(
      `casparser:${pan}:${schemeKey}:${t.date ?? ''}:${t.units ?? ''}:${t.amount ?? ''}:${t.type ?? ''}`,
    )
    .digest('hex');
}

const TYPE_MAP: Record<string, TransactionType> = {
  PURCHASE: 'BUY',
  PURCHASE_SIP: 'SIP',
  SIP: 'SIP',
  REDEMPTION: 'REDEMPTION',
  REDEEM: 'REDEMPTION',
  SELL: 'SELL',
  SWITCH_IN: 'SWITCH_IN',
  SWITCH_OUT: 'SWITCH_OUT',
  DIVIDEND_PAYOUT: 'DIVIDEND_PAYOUT',
  DIVIDEND_REINVEST: 'DIVIDEND_REINVEST',
  DIVIDEND_REINVESTMENT: 'DIVIDEND_REINVEST',
  STT_TAX: 'BUY', // stamp duty etc — treat as part of BUY adjustment
};

function mapTxnType(raw: string | undefined): TransactionType | null {
  if (!raw) return null;
  const key = raw.toUpperCase().replace(/\s+/g, '_');
  return TYPE_MAP[key] ?? null;
}

function toIso(d: string | undefined): string | null {
  if (!d) return null;
  // casparser usually returns YYYY-MM-DD already; fall back to DD-MM-YYYY → ISO.
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

async function projectMfFolios(
  userId: string,
  portfolioId: string,
  pan: string,
  resp: CasUnifiedResponse,
): Promise<{ inserted: number; fundsFound: number; warnings: string[] }> {
  const warnings: string[] = [];
  const fundsSeen = new Set<string>();
  let inserted = 0;

  const folios = resp.mutual_funds ?? [];
  for (const folio of folios) {
    const schemes = folio.schemes ?? [];
    for (const scheme of schemes) {
      const schemeName = scheme.scheme ?? '';
      const isin = typeof scheme.isin === 'string' ? scheme.isin : undefined;
      const schemeKey = isin || schemeName || `${folio.amc ?? ''}:${folio.folio ?? ''}`;
      if (!schemeName && !isin) {
        warnings.push(`Skipped folio ${folio.folio ?? '?'} — no scheme name/isin`);
        continue;
      }
      fundsSeen.add(schemeKey);

      const txns = scheme.transactions ?? [];
      for (const t of txns) {
        const isoDate = toIso(t.date);
        const txType = mapTxnType(t.type);
        if (!isoDate || !txType) continue;

        const units = new Decimal(String(t.units ?? 0)).abs();
        const nav = new Decimal(String(t.nav ?? 0)).abs();
        if (units.isZero() || nav.isZero()) {
          // Stamp-duty / dividend-payout rows have no units/nav meaningful.
          continue;
        }

        const sourceHash = txnHash(pan, schemeKey, t);
        try {
          const existing = await prisma.transaction.findUnique({ where: { sourceHash } });
          await createTransaction(userId, {
            portfolioId,
            assetClass: 'MUTUAL_FUND',
            transactionType: txType,
            schemeName: schemeName || undefined,
            assetName: schemeName || undefined,
            isin,
            tradeDate: isoDate,
            quantity: units.toString(),
            price: nav.toString(),
            narration: t.description ?? undefined,
            sourceAdapter: SOURCE_ADAPTER,
            sourceAdapterVer: SOURCE_ADAPTER_VER,
            sourceHash,
          });
          if (!existing) inserted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Failed to insert ${schemeName} ${t.date}: ${msg}`);
          logger.warn({ err, schemeName, date: t.date }, '[casparser] tx insert failed');
        }
      }
    }
  }

  return { inserted, fundsFound: fundsSeen.size, warnings };
}

// ─── CDSL OTP Fetch (sync, paid: 0.5 credit) ─────────────────────

export interface CdslRequestOtpInput {
  userId: string;
  pan: string;
  boId: string;       // 16-digit CDSL Client ID
  dob: string;        // YYYY-MM-DD
  portfolioId?: string | null;
  nickname?: string | null;
}

export interface CdslRequestOtpResult {
  jobId: string;
  maskedContact: string;
  status: 'OTP_PENDING';
}

export async function cdslRequestOtp(input: CdslRequestOtpInput): Promise<CdslRequestOtpResult> {
  const pan = input.pan.trim().toUpperCase();
  if (!PAN_REGEX.test(pan)) throw new BadRequestError('Invalid PAN format');
  const boId = input.boId.trim().replace(/\s+/g, '');
  if (!/^\d{16}$/.test(boId)) {
    throw new BadRequestError('BO ID must be 16 digits (DP ID + Client ID, no spaces)');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) {
    throw new BadRequestError('DOB must be in YYYY-MM-DD format');
  }

  const portfolioId = await resolvePortfolioId(input.userId, input.portfolioId);

  const job = await prisma.mFCentralSyncJob.create({
    data: {
      userId: input.userId,
      portfolioId,
      panLast4: pan.slice(-4),
      otpMethod: 'PHONE',
      contactMasked: '',
      nickname: input.nickname ?? null,
      status: 'OTP_PENDING',
    },
  });

  try {
    const r = await cdslFetchInit({ pan, bo_id: boId, dob: input.dob });
    const masked = (r.otp_sent_to as string) ?? r.message ?? 'PAN-registered mobile';
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { contactMasked: masked, playwrightSessionId: r.session_id },
    });
    return { jobId: job.id, maskedContact: masked, status: 'OTP_PENDING' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'CDSL OTP request failed';
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: msg },
    });
    await writeIngestionFailure({
      userId: input.userId,
      sourceAdapter: SOURCE_ADAPTER,
      adapterVersion: SOURCE_ADAPTER_VER,
      sourceRef: `casparser:cdsl:${job.id}`,
      error: err instanceof Error ? err : new Error(msg),
      rawPayload: {
        stage: 'request-otp',
        casparserCode: err instanceof CasparserError ? err.code : undefined,
      },
    });
    throw err;
  }
}

export interface CdslSubmitOtpInput {
  userId: string;
  jobId: string;
  otp: string;
}

export interface CdslSubmitOtpResult {
  jobId: string;
  status: 'COMPLETED' | 'FAILED';
  txnsCreated: number;
  fundsFound: number;
  warnings: string[];
  portfolioId: string | null;
}

export async function cdslSubmitOtp(input: CdslSubmitOtpInput): Promise<CdslSubmitOtpResult> {
  const job = await prisma.mFCentralSyncJob.findUnique({ where: { id: input.jobId } });
  if (!job) throw new NotFoundError('Sync job not found');
  if (job.userId !== input.userId) throw new ForbiddenError();
  if (job.status !== 'OTP_PENDING') {
    throw new BadRequestError(`Job in status ${job.status}, expected OTP_PENDING`);
  }
  if (!job.playwrightSessionId) {
    throw new BadRequestError('Missing casparser session id on job');
  }
  if (Date.now() - job.createdAt.getTime() > OTP_TTL_MS) {
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'EXPIRED', errorMessage: 'OTP timeout' },
    });
    throw new BadRequestError('OTP expired — request a new one');
  }

  await prisma.mFCentralSyncJob.update({
    where: { id: job.id },
    data: { status: 'OTP_SUBMITTED' },
  });

  try {
    const cas = await cdslFetchVerify(job.playwrightSessionId, { otp: input.otp });

    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'PARSING' },
    });

    const investorPan =
      typeof cas.investor?.pan === 'string' ? cas.investor.pan.toUpperCase() : `XXXXX${job.panLast4}`;
    const { inserted, fundsFound, warnings } = await projectMfFolios(
      input.userId,
      job.portfolioId!,
      investorPan,
      cas,
    );

    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        txnsCreated: inserted,
        fundsFound,
        warningLog: warnings,
        completedAt: new Date(),
        playwrightSessionId: null,
      },
    });

    return {
      jobId: job.id,
      status: 'COMPLETED',
      txnsCreated: inserted,
      fundsFound,
      warnings,
      portfolioId: job.portfolioId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'CDSL submit failed';
    await prisma.mFCentralSyncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: msg, playwrightSessionId: null },
    });
    await writeIngestionFailure({
      userId: input.userId,
      sourceAdapter: SOURCE_ADAPTER,
      adapterVersion: SOURCE_ADAPTER_VER,
      sourceRef: `casparser:cdsl:${job.id}`,
      error: err instanceof Error ? err : new Error(msg),
      rawPayload: {
        stage: 'submit-otp',
        casparserCode: err instanceof CasparserError ? err.code : undefined,
      },
    });
    throw err;
  }
}

// ─── KFintech mailback (async, paid: 0.5 credit) ─────────────────

export interface KfintechMailbackInput {
  userId: string;
  pan: string;
  email: string;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface KfintechMailbackResult {
  ok: boolean;
  message: string;
  requestId: string | null;
}

export async function kfintechMailbackRequest(
  input: KfintechMailbackInput,
): Promise<KfintechMailbackResult> {
  const pan = input.pan.trim().toUpperCase();
  if (!PAN_REGEX.test(pan)) throw new BadRequestError('Invalid PAN format');
  if (!input.email.includes('@')) throw new BadRequestError('Email required');

  // Casparser requires from_date + to_date + password. Default to full history.
  // Password = uppercase PAN — matches our getUserPdfPasswords decrypt path so
  // the resulting PDF auto-unlocks on import without prompting the user.
  const fromDate = input.fromDate ?? '1990-01-01';
  const toDate = input.toDate ?? new Date().toISOString().slice(0, 10);

  try {
    const r = await kfintechGenerate({
      pan,
      email: input.email,
      from_date: fromDate,
      to_date: toDate,
      password: pan,
    });

    // Auto-add the KFintech CAS sender addresses to the user's MonitoredSender
    // list so the Gmail poller fetches the resulting email automatically. The
    // create call is idempotent — a duplicate-address error is swallowed.
    await ensureCasSendersMonitored(input.userId).catch((e) =>
      logger.warn({ err: e, userId: input.userId }, '[casparser] auto-add senders failed'),
    );

    // Immediately kick off a Gmail poll so users don't wait 10 min for the
    // first scheduled tick. Best-effort — the scheduled poller still catches
    // late arrivals.
    pollMailboxesForUser(input.userId).catch((e) =>
      logger.warn({ err: e, userId: input.userId }, '[casparser] post-submit poll failed'),
    );

    return {
      ok: true,
      message: r.message ?? 'KFintech mailback requested',
      requestId: (r.request_id as string) ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'KFintech mailback failed';
    await writeIngestionFailure({
      userId: input.userId,
      sourceAdapter: 'casparser.kfintech.v4',
      adapterVersion: SOURCE_ADAPTER_VER,
      sourceRef: `casparser:kfintech:${pan.slice(-4)}`,
      error: err instanceof Error ? err : new Error(msg),
      rawPayload: { stage: 'kfintech-generate' },
    });
    throw err;
  }
}

// Known sender addresses CAMS / KFintech / casparser use to deliver CAS
// emails. Auto-added to MonitoredSender so the poller can fetch the resulting
// statement without manual setup.
const CAS_SENDER_ADDRESSES: Array<{ address: string; label: string }> = [
  { address: '@camsonline.com', label: 'CAMS' },
  { address: '@cams-cas.com', label: 'CAMS CAS' },
  { address: '@kfintech.com', label: 'KFintech' },
  { address: '@karvy.com', label: 'KFintech (legacy)' },
  { address: '@cdslindia.com', label: 'CDSL' },
  { address: '@cdslstatement.com', label: 'CDSL eCAS' },
  { address: '@nsdl.co.in', label: 'NSDL' },
  { address: '@nsdlcas.nsdl.com', label: 'NSDL eCAS' },
  { address: '@casparser.in', label: 'CASParser delivery' },
];

async function ensureCasSendersMonitored(userId: string): Promise<void> {
  for (const { address, label } of CAS_SENDER_ADDRESSES) {
    try {
      await prisma.monitoredSender.upsert({
        where: { userId_address: { userId, address } },
        create: {
          userId,
          address,
          displayLabel: label,
          autoCommitEnabled: true,
          isActive: true,
        },
        update: {}, // never overwrite user's own settings
      });
    } catch (err) {
      logger.warn({ err, userId, address }, '[casparser] sender upsert failed');
    }
  }
}

async function pollMailboxesForUser(userId: string): Promise<void> {
  const accounts = await prisma.mailboxAccount.findMany({
    where: { userId, provider: 'GMAIL_OAUTH', isActive: true },
    select: { id: true },
  });
  // Lazy import to avoid circular dep with the connector.
  const { syncGmailAccount } = await import('../../connectors/gmail.connector.js');
  for (const a of accounts) {
    try {
      await syncGmailAccount(a.id);
    } catch (err) {
      logger.warn({ err, accountId: a.id }, '[casparser] post-submit gmail sync failed');
    }
  }
}
