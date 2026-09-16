import type { Request } from 'express';
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { runAsSystem } from './requestContext.js';

/**
 * Audit trail for sensitive operations (§15.8).
 *
 * The AuditLog model has existed since the Phase 4.5 schema but had exactly
 * one write in the whole codebase, in an unrelated admin controller. So there
 * was no way to answer "when was my PAN last viewed", "who exported this
 * data", or "was this account accessed before the password reset" — which is
 * precisely what you need after any of the other findings in this sweep turns
 * out to have been exploited.
 *
 * Writes are best-effort: an audit failure must never take down the operation
 * being audited. They are loud in the log when they fail, so a silently
 * broken trail is detectable.
 */
export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'pii_view'
  | 'data_export'
  | 'oauth_grant'
  | 'oauth_revoke'
  | 'vehicle_modified'
  | 'insurance_modified';

export interface AuditInput {
  userId?: string | null;
  action: AuditAction;
  /** e.g. "User:abc123", "Vehicle:xyz" */
  resource?: string | null;
  metadata?: Record<string, unknown>;
  req?: Request;
}

function clientIp(req?: Request): string | null {
  if (!req) return null;
  // `app.set('trust proxy', 1)` makes req.ip the real client behind Railway.
  return req.ip ?? null;
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    // Audit rows are written on behalf of the user but must succeed even on
    // paths where no ambient user context is set yet (a failed login has no
    // authenticated user at all). System context keeps the write from being
    // dropped by RLS.
    await runAsSystem(async () => {
      await prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          resource: input.resource ?? null,
          ip: clientIp(input.req),
          userAgent: input.req?.header('user-agent') ?? null,
          metadata: (input.metadata ?? {}) as object,
        },
      });
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'audit.write_failed');
  }
}
