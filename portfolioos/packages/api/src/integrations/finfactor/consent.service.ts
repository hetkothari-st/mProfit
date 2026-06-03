/**
 * Account Aggregator consent lifecycle (Finfactor / Finvu).
 *
 * Wraps the documented `/submit-consent-request-plus` →
 * `/user-consents` → `/submit-consent-revoke-request` flow and persists
 * each consent as an `AaConsent` row so the UI can track state across
 * requests. Demo mode short-circuits every upstream call to deterministic
 * fixtures, letting the operator walk through the UX without a live FIU
 * token (no real bank/AA flow is triggered).
 */

import { prisma } from '../../lib/prisma.js';
import { finfactorPost } from './client.js';
import {
  demoConsentApproved,
  demoConsentInitiate,
  isFinfactorDemoMode,
} from './demo.js';

export interface InitiateConsentInput {
  fiTypes?: string[];
  fipIds?: string[];
  purposeCode?: string;
  purposeText?: string;
  durationDays?: number;
  customerIdentifier?: string;
}

const DEFAULT_FI_TYPES = ['MUTUAL_FUNDS', 'EQUITIES'];
const DEFAULT_PURPOSE_CODE = '101';
const DEFAULT_PURPOSE_TEXT = 'Explicit consent for monitoring of the accounts';

function pickString(o: unknown, ...keys: string[]): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const obj = o as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

export async function initiateConsent(userId: string, input: InitiateConsentInput) {
  const fiTypes = input.fiTypes && input.fiTypes.length > 0 ? input.fiTypes : DEFAULT_FI_TYPES;
  const fipIds = input.fipIds ?? [];
  const purposeCode = input.purposeCode ?? DEFAULT_PURPOSE_CODE;
  const purposeText = input.purposeText ?? DEFAULT_PURPOSE_TEXT;

  if (isFinfactorDemoMode()) {
    const upstream = demoConsentInitiate({ fiTypes, fipIds });
    const consent = await prisma.aaConsent.create({
      data: {
        userId,
        consentHandle: upstream.consentHandle,
        fiTypes,
        fipIds,
        purposeCode,
        purposeText,
        redirectUrl: upstream.redirectUrl,
        status: 'PENDING',
        metadata: upstream as unknown as object,
      },
    });
    return { consent, upstream, demoMode: true };
  }

  const upstream = await finfactorPost<Record<string, unknown>, Record<string, unknown>>(
    '/pfm/api/v2/submit-consent-request-plus',
    {
      fiTypes,
      fipIds,
      purposeCode,
      purposeText,
      durationDays: input.durationDays ?? 730,
      customerIdentifier: input.customerIdentifier,
    },
  );

  const handle = pickString(upstream, 'consentHandle', 'ConsentHandle');
  const redirectUrl = pickString(upstream, 'redirectUrl', 'RedirectUrl', 'url');

  const consent = await prisma.aaConsent.create({
    data: {
      userId,
      consentHandle: handle ?? null,
      fiTypes,
      fipIds,
      purposeCode,
      purposeText,
      redirectUrl: redirectUrl ?? null,
      status: handle ? 'PENDING' : 'INITIATED',
      metadata: upstream as unknown as object,
    },
  });
  return { consent, upstream, demoMode: false };
}

export async function listUserConsents(userId: string) {
  // Demo mode: return whatever is in DB; live mode: refresh from upstream
  // and merge before returning so a webhook-missed status change still
  // surfaces eventually.
  if (!isFinfactorDemoMode()) {
    try {
      const upstream = await finfactorPost<Record<string, unknown>, unknown>(
        '/pfm/api/v2/user-consents',
        {},
      );
      // Best-effort merge — we don't fail the request if Finfactor changes
      // its payload shape.
      await mergeUpstreamConsents(userId, upstream);
    } catch {
      // Surface the local view even if upstream is unreachable.
    }
  }
  return prisma.aaConsent.findMany({
    where: { userId },
    orderBy: { initiatedAt: 'desc' },
  });
}

async function mergeUpstreamConsents(userId: string, upstream: unknown) {
  if (!upstream || typeof upstream !== 'object') return;
  const arr = Array.isArray(upstream)
    ? upstream
    : Array.isArray((upstream as Record<string, unknown>)['consents'])
    ? ((upstream as Record<string, unknown>)['consents'] as unknown[])
    : [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    const obj = c as Record<string, unknown>;
    const handle = pickString(obj, 'consentHandle', 'ConsentHandle');
    if (!handle) continue;
    const existing = await prisma.aaConsent.findUnique({
      where: { userId_consentHandle: { userId, consentHandle: handle } },
    });
    const status = pickString(obj, 'status', 'consentStatus');
    if (!existing) {
      await prisma.aaConsent.create({
        data: {
          userId,
          consentHandle: handle,
          consentId: pickString(obj, 'consentId', 'ConsentId') ?? null,
          status: status ?? 'PENDING',
          metadata: obj as unknown as object,
        },
      });
    } else if (status && status !== existing.status) {
      await prisma.aaConsent.update({
        where: { id: existing.id },
        data: {
          status,
          consentId: pickString(obj, 'consentId', 'ConsentId') ?? existing.consentId,
          approvedAt: status === 'APPROVED' && !existing.approvedAt ? new Date() : existing.approvedAt,
          metadata: obj as unknown as object,
        },
      });
    }
  }
}

export async function approveConsentDemo(userId: string, consentHandle: string) {
  if (!isFinfactorDemoMode()) {
    throw new Error('approveConsentDemo is only available in demo mode');
  }
  const upstream = demoConsentApproved(consentHandle);
  return prisma.aaConsent.update({
    where: { userId_consentHandle: { userId, consentHandle } },
    data: {
      status: 'APPROVED',
      consentId: upstream.consentId,
      approvedAt: new Date(upstream.approvedAt),
      expiresAt: new Date(upstream.expiresAt),
      fiTypes: upstream.fiTypes,
      fipIds: upstream.fipIds,
      metadata: upstream as unknown as object,
    },
  });
}

export async function revokeConsent(userId: string, consentHandle: string) {
  const existing = await prisma.aaConsent.findUnique({
    where: { userId_consentHandle: { userId, consentHandle } },
  });
  if (!existing) throw new Error(`No consent found for handle ${consentHandle}`);

  if (!isFinfactorDemoMode()) {
    await finfactorPost('/pfm/api/v2/submit-consent-revoke-request', {
      consentHandle,
      consentId: existing.consentId,
    });
  }
  return prisma.aaConsent.update({
    where: { id: existing.id },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
}

export async function decryptEcres(ecres: string) {
  if (isFinfactorDemoMode()) {
    // Pretend the ecres encodes a known handle — return a synthetic match.
    return { consentHandle: 'demo-handle', consentId: 'demo-consent', status: 'APPROVED' };
  }
  return finfactorPost<{ ecres: string }, Record<string, unknown>>(
    '/pfm/api/v2/decrypt/ecres',
    { ecres },
  );
}

export async function getActiveConsentForUser(userId: string) {
  return prisma.aaConsent.findFirst({
    where: { userId, status: 'APPROVED' },
    orderBy: { approvedAt: 'desc' },
  });
}
