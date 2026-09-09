/**
 * Projecting a client's activity into their books.
 *
 * `generateVouchersFromActivity` reads a user's transactions, loan payments,
 * rent receipts and premium payments and writes the double-entry vouchers that
 * Trial Balance, P&L, Balance Sheet and the Tally export are all computed
 * from. Nothing else writes those vouchers for a user who enters transactions
 * by hand, so every surface that reads them has to run it first or show blanks.
 *
 * That was the bug this module exists to close. The report downloads projected;
 * the CA's books tabs did not. A CA opening Trial balance saw a table of
 * dashes, downloaded the Trial Balance report for the same client and same
 * date, and got a populated one. Same data, two answers, no way to tell which
 * was wrong.
 *
 * The second thing it closes: the projection is a WRITE, and on the CA path it
 * is a write to someone else's ledger. It can create dozens of vouchers with
 * the CA never having pressed anything labelled "create". Every other CA write
 * lands on the audit trail; this one has to as well, or the client's activity
 * feed quietly understates what was done to their books.
 */

import type { Request } from 'express';
import { runInTransaction } from '../../lib/prisma.js';
import {
  generateVouchersFromActivity,
  type GenerateFromActivityResult,
} from '../accounting.service.js';
import { getCaScope } from './caAccess.service.js';
import { recordProjectionIfAny, type CaAuditContext } from './caAudit.service.js';
import { parseClientId } from '../../lib/clientHeader.js';

/**
 * Run the projection, recording it on the client's trail when a CA caused it.
 *
 * Throws. Callers that project defensively — before a read, where a stale set
 * of vouchers is better than a failed page — should catch; the explicit
 * "Generate from activity" action should not, because a user who asked for
 * this is owed the error.
 */
export async function projectBooks(
  userId: string,
  audit?: CaAuditContext,
): Promise<GenerateFromActivityResult> {
  const result = await generateVouchersFromActivity(userId);
  if (audit) {
    await runInTransaction((tx) => recordProjectionIfAny(tx, audit, result.created));
  }
  return result;
}

/**
 * The audit context for a projection this request is about to cause, or
 * undefined when nobody else's books are involved.
 *
 * Undefined covers two different cases that need the same answer. A user
 * projecting their own books is not audited — the CA trail records what a
 * professional did to a client, and filling it with the client's own actions
 * would bury the entries it exists to surface. A family member viewing a
 * relative's report runs as that relative under `runAsUser`, which is the
 * family layer's own consent mechanism, not a CA grant.
 */
export async function caProjectionAudit(
  req: Request,
  subjectUserId: string,
): Promise<CaAuditContext | undefined> {
  const clientId = parseClientId(req);
  if (!clientId) return undefined;

  const scope = await getCaScope(req.user!.id, clientId);
  // Defensive: the grant must actually be the one this subject came from.
  if (scope.subjectUserId !== subjectUserId) return undefined;

  return {
    actorUserId: req.user!.id,
    subjectUserId: scope.subjectUserId,
    clientId: scope.clientId,
    req,
  };
}
