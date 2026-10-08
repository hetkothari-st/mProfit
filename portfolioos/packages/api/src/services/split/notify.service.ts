/** Payment reminders and email digests for Split (spec §9). */
import { Decimal } from 'decimal.js';
import { formatCurrency, formatINR } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem, runAsUser } from '../../lib/requestContext.js';
import { BadRequestError, ConflictError, NotFoundError, TooManyRequestsError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { openText } from '../piiAtRest.service.js';
import { sendEmail } from '../notifications/email.service.js';
import { requireMember } from './groups.service.js';
import { listFriends } from './ledger.service.js';
import { buildUpiUri, owedBetween } from './settings.service.js';
import { renderReminderEmail, renderActivityDigestEmail, renderWeeklyDigestEmail } from './splitEmail.templates.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_LINES = 10;
const DAILY_REMINDER_CAP = 30;

/** UTC-midnight Date of the IST calendar day (IST is UTC+05:30, no DST). */
export function istDay(d: Date): Date {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

const money = (v: Decimal.Value, ccy: string): string => (ccy === 'INR' ? formatINR(v.toString()) : formatCurrency(v.toString(), ccy));

export async function remind(userId: string, groupId: string, memberId: string, now: Date = new Date()): Promise<{ sent: boolean }> {
  const { memberId: myId } = await requireMember(userId, groupId);
  const group = await prisma.splitGroup.findUnique({ where: { id: groupId }, select: { name: true, baseCurrency: true } });
  const target = await prisma.splitMember.findFirst({ where: { id: memberId, groupId, leftAt: null } });
  if (!group || !target || target.id === myId) throw new NotFoundError('Member not found');

  const owedAmount = await owedBetween(groupId, memberId, myId);
  const owed = owedAmount === null ? null : { amount: owedAmount };
  if (!owed) throw new BadRequestError(`SPLIT_NOTHING_OWED: ${target.displayName} doesn't owe you anything here`);

  // Cross-user reads run as system only after the membership checks above.
  const lookup = await runAsSystem(async () => {
    let email: string | null = null;
    if (target.userId) {
      email = (await prisma.user.findUnique({ where: { id: target.userId }, select: { email: true } }))?.email ?? null;
    } else if (target.contactId) {
      const c = await prisma.splitContact.findUnique({ where: { id: target.contactId }, select: { email: true, emailEnc: true } });
      email = c ? openText(c.emailEnc, c.email) : null;
    }
    return { email };
  });
  // The name the group knows the sender by (not their account name or email).
  const me = await prisma.splitMember.findUnique({ where: { id: myId }, select: { displayName: true } });
  const senderName = me?.displayName?.trim() || 'A friend';
  if (!lookup.email) throw new BadRequestError(`SPLIT_NO_EMAIL: ${target.displayName} has no email on file`);

  // Per-user cap protects the shared mail account from abuse; checked before the insert.
  const today = await prisma.splitReminder.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } } });
  if (today >= DAILY_REMINDER_CAP) throw new TooManyRequestsError('Daily reminder limit reached - try again tomorrow');

  // Insert first: the unique index is the once-a-day guard, even across retries.
  try {
    await prisma.splitReminder.create({ data: { userId, groupId, memberId, sentOn: istDay(now) } });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw new ConflictError('Already reminded today');
    throw err;
  }

  const settings = await prisma.splitSettings.findUnique({ where: { userId }, select: { upiId: true } });
  const amount = money(owed.amount, group.baseCurrency);
  const upiId = group.baseCurrency === 'INR' ? settings?.upiId ?? null : null;
  const mail = renderReminderEmail({
    senderName,
    amount,
    groupName: group.name,
    upiId,
    upiUri: upiId ? buildUpiUri({ vpa: upiId, name: senderName, amount: owed.amount.toFixed(2), note: `${group.name} settle-up`.slice(0, 40) }) : null,
    url: `${env.FRONTEND_URL}/split/groups/${groupId}`,
  });
  const r = await sendEmail({ to: lookup.email, subject: `Reminder: you owe ${senderName} ${amount}`, html: mail.html, text: mail.text });
  // A failed send keeps the row on purpose, so retries cannot spam.
  return { sent: r.sent };
}

const VERB: Record<string, string> = {
  EXPENSE_ADDED: 'added', EXPENSE_EDITED: 'edited', EXPENSE_DELETED: 'deleted',
  SETTLED: 'recorded a payment', COMMENTED: 'commented on', MEMBER_ADDED: 'added a member to',
};
const DIGEST_KINDS = Object.keys(VERB);

function activityLine(actor: string, kind: string, payload: unknown, groupName: string): string {
  const description = (payload as { description?: unknown } | null)?.description;
  const verb = VERB[kind]!;
  if (typeof description === 'string' && description) return `${actor} ${verb} “${description}” in ${groupName}`;
  return kind === 'SETTLED' ? `${actor} ${verb} in ${groupName}` : `${actor} ${verb} ${groupName}`;
}

export async function sendActivityDigests(now: Date = new Date()): Promise<{ users: number; emails: number }> {
  return runAsSystem(async () => {
    const rows = await prisma.splitMember.findMany({ where: { userId: { not: null }, leftAt: null }, select: { userId: true, groupId: true, createdAt: true } });
    // createdAt is the join time; a re-join reactivates the same row and keeps it, so a re-joined member may see some older activity.
    const groupsByUser = new Map<string, Array<{ groupId: string; joinedAt: Date }>>();
    for (const r of rows) groupsByUser.set(r.userId!, [...(groupsByUser.get(r.userId!) ?? []), { groupId: r.groupId, joinedAt: r.createdAt }]);

    let users = 0; let emails = 0;
    for (const [userId, memberships] of groupsByUser) {
      try {
        const settings = await prisma.splitSettings.findUnique({ where: { userId }, select: { emailOnActivity: true, lastActivityEmailAt: true } });
        if (settings && !settings.emailOnActivity) continue;
        users += 1;
        // Cap the window so a long outage cannot produce a giant email.
        const since = new Date(Math.max((settings?.lastActivityEmailAt ?? new Date(now.getTime() - HOUR_MS)).getTime(), now.getTime() - 7 * DAY_MS));
        const acts = await prisma.splitActivity.findMany({
          where: { OR: memberships.map((m) => ({ groupId: m.groupId, createdAt: { gt: new Date(Math.max(since.getTime(), m.joinedAt.getTime())), lte: now } })), actorUserId: { not: userId }, kind: { in: DIGEST_KINDS } },
          orderBy: { createdAt: 'asc' },
          include: { group: { select: { name: true } } },
        });
        if (acts.length === 0) continue;
        const [user, actors, actorMembers] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId }, select: { email: true, isActive: true } }),
          prisma.user.findMany({ where: { id: { in: [...new Set(acts.map((a) => a.actorUserId))] } }, select: { id: true, name: true } }),
          prisma.splitMember.findMany({ where: { groupId: { in: memberships.map((m) => m.groupId) }, userId: { in: [...new Set(acts.map((a) => a.actorUserId))] } }, select: { groupId: true, userId: true, displayName: true } }),
        ]);
        if (!user?.email || !user.isActive) continue;
        const userName = new Map(actors.map((a) => [a.id, a.name?.trim() || 'Someone']));
        const groupName = new Map(actorMembers.map((m) => [`${m.groupId}:${m.userId}`, m.displayName.trim()]));
        const nameOf = (a: { groupId: string; actorUserId: string }) => groupName.get(`${a.groupId}:${a.actorUserId}`) || userName.get(a.actorUserId) || 'Someone';
        const mail = renderActivityDigestEmail({
          count: acts.length,
          lines: acts.slice(0, MAX_LINES).map((a) => activityLine(nameOf(a), a.kind, a.payload, a.group.name)),
          more: Math.max(0, acts.length - MAX_LINES),
          url: `${env.FRONTEND_URL}/split`,
        });
        const r = await sendEmail({ to: user.email, subject: `${acts.length} update${acts.length === 1 ? '' : 's'} in your shared expenses`, html: mail.html, text: mail.text });
        if (r.sent) {
          await prisma.splitSettings.upsert({ where: { userId }, create: { userId, lastActivityEmailAt: now }, update: { lastActivityEmailAt: now } });
          emails += 1;
        }
      } catch (err) {
        // Sanctioned catch: one user's failure must not stop everyone else's
        // digest; their timestamp is untouched so the next run retries.
        logger.error({ err, userId }, '[split] activity digest failed for user');
      }
    }
    return { users, emails };
  });
}

export async function sendWeeklyDigests(_now: Date = new Date()): Promise<{ emails: number }> {
  return runAsSystem(async () => {
    const targets = await prisma.splitSettings.findMany({ where: { weeklyDigest: true }, select: { userId: true, homeCurrency: true } });
    let emails = 0;
    for (const t of targets) {
      try {
        const user = await prisma.user.findUnique({ where: { id: t.userId }, select: { email: true, isActive: true } });
        if (!user?.email || !user.isActive) continue;
        const friends = (await runAsUser(t.userId, () => listFriends(t.userId)))
          .map((f) => ({ name: f.displayName, net: new Decimal(f.net) }))
          .filter((f) => !f.net.isZero());
        if (friends.length === 0) continue;
        friends.sort((a, b) => b.net.abs().comparedTo(a.net.abs()));
        const ccy = t.homeCurrency;
        const owedToMe = friends.filter((f) => f.net.gt(0)).reduce((s, f) => s.plus(f.net), new Decimal(0));
        const iOwe = friends.filter((f) => f.net.lt(0)).reduce((s, f) => s.plus(f.net.abs()), new Decimal(0));
        const totals: string[] = [];
        if (owedToMe.gt(0)) totals.push(`In total you are owed ${money(owedToMe, ccy)}`);
        if (iOwe.gt(0)) totals.push(`In total you owe ${money(iOwe, ccy)}`);
        const mail = renderWeeklyDigestEmail({
          lines: friends.slice(0, MAX_LINES).map((f) => (f.net.gt(0) ? `${f.name} owes you ${money(f.net, ccy)}` : `You owe ${f.name} ${money(f.net.abs(), ccy)}`)),
          more: Math.max(0, friends.length - MAX_LINES),
          totals,
          url: `${env.FRONTEND_URL}/split`,
        });
        const r = await sendEmail({ to: user.email, subject: 'Your weekly balances', html: mail.html, text: mail.text });
        if (r.sent) emails += 1;
      } catch (err) {
        // Sanctioned catch: isolate per-user failures (see sendActivityDigests).
        logger.error({ err, userId: t.userId }, '[split] weekly digest failed for user');
      }
    }
    return { emails };
  });
}
