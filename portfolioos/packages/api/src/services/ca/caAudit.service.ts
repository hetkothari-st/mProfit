/**
 * The CA audit trail.
 *
 * Write access to somebody else's books is only defensible if what was done is
 * on the record and the client can read it. That is this module's whole job.
 *
 * Two properties it exists to guarantee:
 *
 *  1. **The entry and the change share a fate.** Every write takes the caller's
 *     transaction client and runs inside the same transaction as the mutation
 *     it describes. A rolled-back correction cannot leave an entry claiming it
 *     happened, and a committed one cannot fail to be recorded. There is no
 *     try/catch here on purpose: swallowing an audit failure would produce
 *     exactly the silent gap the trail exists to prevent, so it takes the
 *     mutation down with it.
 *
 *  2. **Before, not just after.** `metadata` carries the prior state as well as
 *     the new one. "Voucher 123 was edited" answers nothing a client actually
 *     asks; "the amount went from ₹40,000 to ₹4,000 on 3 March" does.
 */

import { Prisma, type CaAuditAction } from '@prisma/client';
import type { Request } from 'express';

export interface CaAuditContext {
  /** The CA performing the action. Always the authenticated caller. */
  actorUserId: string;
  /** The user whose books were touched. */
  subjectUserId: string;
  /** The grant this was done under. */
  clientId: string;
  req?: Request;
}

export interface CaAuditEntry {
  action: CaAuditAction;
  resourceType?: string;
  resourceId?: string;
  /** Read verbatim by a non-technical person in their activity feed. */
  summary: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Record one CA action. MUST be called with the transaction client of the
 * mutation being recorded — see property 1 above.
 */
export async function recordCaAudit(
  tx: Prisma.TransactionClient,
  ctx: CaAuditContext,
  entry: CaAuditEntry,
): Promise<void> {
  const metadata: Record<string, unknown> = {};
  if (entry.before !== undefined) metadata.before = entry.before;
  if (entry.after !== undefined) metadata.after = entry.after;

  await tx.caAuditLog.create({
    data: {
      actorUserId: ctx.actorUserId,
      subjectUserId: ctx.subjectUserId,
      clientId: ctx.clientId,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      summary: entry.summary,
      metadata: Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonValue) : undefined,
      ip: ctx.req?.ip ?? null,
      userAgent: ctx.req?.header('user-agent') ?? null,
    },
  });
}

/**
 * Record an accounting projection, if it actually created anything.
 *
 * `generateVouchersFromActivity` turns a client's transactions, loan payments,
 * rent receipts and premiums into double-entry vouchers. It runs when a CA
 * opens the books and again before an accounting report is built — so a CA can
 * create dozens of financial records in someone else's ledger without ever
 * pressing a button labelled "create". That is precisely the kind of write
 * that has to be on the record, and it was not.
 *
 * Silent when nothing was created, so a CA re-opening a tab does not fill the
 * client's activity feed with entries about nothing happening.
 */
export async function recordProjectionIfAny(
  tx: Prisma.TransactionClient,
  ctx: CaAuditContext,
  created: number,
): Promise<void> {
  if (created <= 0) return;
  await recordCaAudit(tx, ctx, {
    action: 'VOUCHER_CREATED',
    resourceType: 'Voucher',
    summary: `Generated ${created} voucher${created === 1 ? '' : 's'} from this client's recorded activity.`,
    after: { generated: created },
  });
}
