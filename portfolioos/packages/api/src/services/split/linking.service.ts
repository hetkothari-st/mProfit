// packages/api/src/services/split/linking.service.ts
/**
 * Turn placeholder contacts into real members once the person has a verified
 * account (spec §10). Only verified emails link: registration verifies by code
 * before the User row exists, and Google sign-in requires email_verified.
 */
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { ConflictError, NotFoundError, BadRequestError, TooManyRequestsError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { hashIdentifier } from '../pfCredentials.service.js';
import { openText } from '../piiAtRest.service.js';
import { sendEmail } from '../notifications/email.service.js';
import { renderInviteShell } from '../notifications/caInviteEmail.template.js';
import { normalizeEmail } from './validate.js';
import { writeActivity } from './activity.js';

const EMAIL_PURPOSE = 'split-contact-email';
const DAY_MS = 86_400_000;

async function linkContactRows(contactIds: string[], userId: string): Promise<number> {
  let members = 0;
  for (const contactId of contactIds) {
    const rows = await prisma.splitMember.findMany({ where: { contactId, userId: null, leftAt: null } });
    for (const m of rows) {
      const already = await prisma.splitMember.findFirst({ where: { groupId: m.groupId, userId, leftAt: null } });
      if (already) { logger.info({ groupId: m.groupId, userId }, '[split] link skipped: user already in group'); continue; }
      await runInTransaction(async (tx) => {
        await tx.splitMember.update({ where: { id: m.id }, data: { userId } });
        await writeActivity(tx, m.groupId, userId, 'MEMBER_LINKED', { memberId: m.id, displayName: m.displayName });
      });
      members += 1;
    }
  }
  return members;
}

export async function linkContactsForUser(user: { id: string; email: string }): Promise<{ contacts: number; members: number }> {
  return runAsSystem(async () => {
    const hash = hashIdentifier(normalizeEmail(user.email), EMAIL_PURPOSE);
    const contacts = await prisma.splitContact.findMany({ where: { emailHash: hash, linkedUserId: null, ownerUserId: { not: user.id } }, select: { id: true } });
    if (contacts.length === 0) return { contacts: 0, members: 0 };
    const ids = contacts.map((c) => c.id);
    await prisma.splitContact.updateMany({ where: { id: { in: ids } }, data: { linkedUserId: user.id } });
    return { contacts: ids.length, members: await linkContactRows(ids, user.id) };
  });
}

export async function linkContactToExistingUser(contactId: string): Promise<boolean> {
  return runAsSystem(async () => {
    const c = await prisma.splitContact.findUnique({ where: { id: contactId } });
    if (!c || c.linkedUserId) return false;
    const email = openText(c.emailEnc, c.email);
    if (!email) return false;
    const u = await prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
    if (!u || u.id === c.ownerUserId) return false;
    await prisma.splitContact.update({ where: { id: c.id }, data: { linkedUserId: u.id } });
    await linkContactRows([c.id], u.id);
    return true;
  });
}

export async function sendInvite(userId: string, contactId: string): Promise<{ sent: boolean }> {
  const c = await prisma.splitContact.findFirst({ where: { id: contactId, ownerUserId: userId } });
  if (!c) throw new NotFoundError('Contact not found');
  if (c.linkedUserId) throw new ConflictError("They're already on EveryPaisa");
  const to = openText(c.emailEnc, c.email);
  if (!to) throw new BadRequestError('Add their email address first');
  const last = await prisma.auditLog.findFirst({ where: { userId, action: 'split_invite', resource: `SplitContact:${c.id}` }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < DAY_MS) throw new TooManyRequestsError('Already invited today');
  const sender = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const senderName = sender?.name?.trim() || 'A friend';
  const url = `${env.FRONTEND_URL}/register?email=${encodeURIComponent(to)}`;
  const mail = renderInviteShell({
    title: 'Split expenses on EveryPaisa',
    heading: `${senderName} invited you to split expenses`,
    preheader: `${senderName} uses EveryPaisa to share costs and settle up.`,
    message: `${senderName} added you to share expenses on EveryPaisa. Sign up with this email address to see what you share and settle up.`,
    acceptUrl: url,
    buttonLabel: 'Join EveryPaisa',
    closingHtml: '',
    expiresOn: '',
  });
  const result = await sendEmail({ to, subject: `${senderName} invited you to EveryPaisa`, html: mail.html, text: mail.text });
  await prisma.auditLog.create({ data: { userId, action: 'split_invite', resource: `SplitContact:${c.id}`, metadata: { sent: result.sent } } });
  return { sent: result.sent };
}
