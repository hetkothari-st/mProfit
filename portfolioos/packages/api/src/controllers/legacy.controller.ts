import type { Request, Response, NextFunction } from 'express';
import { hasFeature, type PlanTierValue } from '@everypaisa/shared';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { decryptSecret } from '../lib/secrets.js';
import { writeAuditLog } from '../lib/audit.js';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { sendEmail } from '../services/notifications/email.service.js';
import * as plan from '../services/legacy/plan.service.js';
import * as pub from '../services/legacy/publicLinks.service.js';
import {
  checkOwnerGrant, createNomineeSession, issueNomineeOtp, resolveLinkToken, startOwnerStepUp,
  verifyNomineeOtp, verifyOwnerStepUp,
} from '../services/legacy/tokens.service.js';
import { renderNomineeOtpEmail, renderStepUpEmail } from '../services/legacy/emails.js';
import { buildLegacyView, loadViewDocument, renderLegacyPdf } from '../services/legacy/view.service.js';

const uid = (req: Request) => req.user!.id;
const changed = (req: Request) => { void plan.notifyPlanChanged(uid(req)); };

/** Every owner mutation needs a fresh step-up grant (design §4). */
export function requireLegacyGrant(req: Request, _res: Response, next: NextFunction): void {
  checkOwnerGrant(uid(req), req.header('x-legacy-grant'))
    .then((good) => (good ? next() : next(new ForbiddenError('Confirm it is you first.'))))
    .catch(next);
}

// ── owner ────────────────────────────────────────────────────────────

export async function overviewHandler(req: Request, res: Response) {
  ok(res, await plan.getOverview(uid(req), hasFeature(req.user!.plan as PlanTierValue, 'LEGACY_TRANSFER')));
}

export async function stepUpHandler(req: Request, res: Response) {
  const r = await startOwnerStepUp(uid(req));
  if (r.method === 'email') {
    const u = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: { name: true, email: true } }));
    const sent = await sendEmail({ to: u.email, ...renderStepUpEmail(u.name, r.code!) });
    if (!sent.sent) throw new BadRequestError("We couldn't send the code. Try again shortly.");
  }
  ok(res, { method: r.method });
}

export async function stepUpVerifyHandler(req: Request, res: Response) {
  ok(res, { grant: await verifyOwnerStepUp(uid(req), req.body.code) });
}

export async function saveSettingsHandler(req: Request, res: Response) {
  await plan.saveSettings(uid(req), req.body); changed(req); ok(res, { ok: true });
}
export async function addNomineeHandler(req: Request, res: Response) {
  const n = await plan.addNominee(uid(req), req.body); changed(req); ok(res, n);
}
export async function updateNomineeHandler(req: Request, res: Response) {
  const n = await plan.updateNominee(uid(req), req.params.id!, req.body); changed(req); ok(res, n);
}
export async function removeNomineeHandler(req: Request, res: Response) {
  await plan.removeNominee(uid(req), req.params.id!); changed(req); ok(res, { ok: true });
}
export async function activateHandler(req: Request, res: Response) {
  await plan.activate(uid(req)); changed(req); ok(res, { ok: true });
}
export async function pauseHandler(req: Request, res: Response) {
  await plan.pause(uid(req), req.body.until); changed(req); ok(res, { ok: true });
}
export async function resumeHandler(req: Request, res: Response) {
  await plan.resume(uid(req)); changed(req); ok(res, { ok: true });
}
export async function deactivateHandler(req: Request, res: Response) {
  await plan.deactivate(uid(req)); changed(req); ok(res, { ok: true });
}
export async function revokeHandler(req: Request, res: Response) {
  await plan.revoke(uid(req), req.body?.nomineeId); changed(req); ok(res, { ok: true });
}

// ── public link actions (no login; POSTed from a button page) ────────

const GONE = 'This link is no longer valid.';

export async function imOkHandler(req: Request, res: Response) {
  const r = await pub.imOk(req.params.token!);
  if (!r.ok) throw new NotFoundError(GONE);
  ok(res, r);
}
export async function ackHandler(req: Request, res: Response) {
  const r = await pub.acknowledgeInvite(req.params.token!);
  if (!r) throw new NotFoundError(GONE);
  ok(res, r);
}
export async function peekVerifyHandler(req: Request, res: Response) {
  const r = await pub.peekVerify(req.params.token!);
  if (!r) throw new NotFoundError(GONE);
  ok(res, r);
}
export async function answerVerifyHandler(req: Request, res: Response) {
  const r = await pub.answerVerify(req.params.token!, req.body.answer);
  if (!r.ok) throw new NotFoundError(GONE);
  ok(res, r);
}

const maskEmail = (email: string) =>
  email.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${'•'.repeat(Math.max(1, b.length))}${c}`);

async function accessNominee(token: string) {
  const t = await resolveLinkToken(token, 'ACCESS');
  if (!t || !t.nomineeId || t.plan.status !== 'RELEASED') throw new NotFoundError(GONE);
  const nomineeId = t.nomineeId;
  const n = await runAsSystem(() => prisma.legacyNominee.findUnique({ where: { id: nomineeId } }));
  if (!n) throw new NotFoundError(GONE);
  const owner = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { name: true } }));
  return { ownerId: t.userId, n, ownerName: owner.name };
}

export async function accessOtpHandler(req: Request, res: Response) {
  const { ownerId, n, ownerName } = await accessNominee(req.params.token!);
  const code = await issueNomineeOtp(n.id, ownerId);
  const email = decryptSecret(n.emailEnc);
  const sent = await sendEmail({ to: email, ...renderNomineeOtpEmail(decryptSecret(n.nameEnc), ownerName, code) });
  if (!sent.sent) throw new BadRequestError("We couldn't send the code. Try again shortly.");
  ok(res, { maskedEmail: maskEmail(email), ownerName });
}

export async function accessSessionHandler(req: Request, res: Response) {
  const { ownerId, n } = await accessNominee(req.params.token!);
  const r = await verifyNomineeOtp(n.id, req.body.code);
  if (r !== 'ok') {
    await writeAuditLog({ userId: ownerId, action: 'legacy_otp_failed', resource: `LegacyNominee:${n.id}`, req });
    throw new UnauthorizedError(
      r === 'locked' ? 'Too many attempts. Try again in 30 minutes.'
        : r === 'expired' ? 'That code has expired. Request a new one.'
          : "That code didn't match.",
    );
  }
  await writeAuditLog({ userId: ownerId, action: 'legacy_otp_ok', resource: `LegacyNominee:${n.id}`, req });
  ok(res, { session: await createNomineeSession(n.id, ownerId) });
}

// ── nominee view (X-Legacy-Session) ──────────────────────────────────

export async function viewHandler(req: Request, res: Response) {
  const { nomineeId, userId } = req.legacyNominee!;
  const v = await buildLegacyView(userId, nomineeId);
  await writeAuditLog({ userId, action: 'legacy_view', resource: `LegacyNominee:${nomineeId}`, req });
  ok(res, v);
}

export async function viewPdfHandler(req: Request, res: Response) {
  const { nomineeId, userId } = req.legacyNominee!;
  const pdf = await renderLegacyPdf(await buildLegacyView(userId, nomineeId));
  await writeAuditLog({ userId, action: 'legacy_pdf', resource: `LegacyNominee:${nomineeId}`, req });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="legacy-information.pdf"');
  res.send(pdf);
}

export async function viewDocumentHandler(req: Request, res: Response) {
  const { nomineeId, userId } = req.legacyNominee!;
  const d = await loadViewDocument(userId, nomineeId, req.params.id!);
  await writeAuditLog({ userId, action: 'legacy_document_download', resource: `Document:${req.params.id}`, req });
  res.setHeader('Content-Type', d.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.fileName)}`);
  res.send(d.bytes);
}
