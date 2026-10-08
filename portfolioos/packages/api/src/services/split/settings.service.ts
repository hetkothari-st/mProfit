/** Per-user Split preferences and the UPI pay-now deep link (spec §5, §9). */
import { Decimal } from 'decimal.js';
import type { SplitSettingsDto, SplitUpiLinkDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { requireMember, loadLedger } from './groups.service.js';
import { memberNets, simplify } from './balances.js';

export const UPI_VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
const DEFAULTS: SplitSettingsDto = { upiId: null, homeCurrency: 'INR', defaultPortfolioId: null, emailOnActivity: true, weeklyDigest: false };

const toDto = (s: { upiId: string | null; homeCurrency: string; defaultPortfolioId: string | null; emailOnActivity: boolean; weeklyDigest: boolean }): SplitSettingsDto =>
  ({ upiId: s.upiId, homeCurrency: s.homeCurrency, defaultPortfolioId: s.defaultPortfolioId, emailOnActivity: s.emailOnActivity, weeklyDigest: s.weeklyDigest });

export async function getSettings(userId: string): Promise<SplitSettingsDto> {
  const s = await prisma.splitSettings.findUnique({ where: { userId } });
  return s ? toDto(s) : { ...DEFAULTS };
}

export async function updateSettings(userId: string, patch: Partial<SplitSettingsDto>): Promise<SplitSettingsDto> {
  const data: Record<string, unknown> = {};
  if (patch.upiId !== undefined) {
    const v = patch.upiId?.trim() || null;
    if (v && !UPI_VPA.test(v)) throw new BadRequestError('Invalid UPI ID');
    data.upiId = v;
  }
  if (patch.homeCurrency !== undefined) {
    const c = patch.homeCurrency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) throw new BadRequestError('Invalid currency code');
    data.homeCurrency = c;
  }
  if (patch.defaultPortfolioId !== undefined) {
    const pid = patch.defaultPortfolioId?.trim() || null;
    if (pid) {
      const p = await prisma.portfolio.findFirst({ where: { id: pid, userId }, select: { id: true } });
      if (!p) throw new BadRequestError('Pick one of your own portfolios');
    }
    data.defaultPortfolioId = pid;
  }
  if (patch.emailOnActivity !== undefined) data.emailOnActivity = patch.emailOnActivity;
  if (patch.weeklyDigest !== undefined) data.weeklyDigest = patch.weeklyDigest;
  const s = await prisma.splitSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return toDto(s);
}

export function buildUpiUri(p: { vpa: string; name: string; amount: string; note: string }): string {
  const e = encodeURIComponent;
  return `upi://pay?pa=${e(p.vpa)}&pn=${e(p.name)}&am=${e(p.amount)}&cu=INR&tn=${e(p.note)}`;
}

export async function upiLink(userId: string, groupId: string, toMemberId: string, amount?: string): Promise<SplitUpiLinkDto> {
  const { memberId: myId } = await requireMember(userId, groupId);
  const group = await prisma.splitGroup.findUniqueOrThrow({ where: { id: groupId }, select: { name: true, baseCurrency: true } });
  if (group.baseCurrency !== 'INR') throw new BadRequestError('SPLIT_UPI_INR_ONLY: UPI works only for INR groups');
  const target = await prisma.splitMember.findFirst({ where: { id: toMemberId, groupId, leftAt: null } });
  if (!target || target.id === myId) throw new NotFoundError('Member not found');

  // Privacy: a co-member's UPI ID is revealed only to someone who actually owes them.
  const ledger = await loadLedger(groupId);
  const owed = simplify(memberNets(ledger.expenses, ledger.settlements, ledger.memberIds))
    .find((x) => x.fromMemberId === myId && x.toMemberId === toMemberId);
  if (!owed) throw new BadRequestError(`SPLIT_NOTHING_OWED: you don't owe ${target.displayName} anything here`);

  let value: Decimal = owed.amount;
  if (amount !== undefined) {
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || new Decimal(amount).lte(0)) throw new BadRequestError('SPLIT_BAD_INPUT: amount must be > 0 with at most 2 decimals');
    value = new Decimal(amount);
    if (value.gt(owed.amount)) throw new BadRequestError('SPLIT_BAD_INPUT: amount is more than you owe');
  }

  const vpa = await runAsSystem(async () => {
    if (target.userId) {
      const s = await prisma.splitSettings.findUnique({ where: { userId: target.userId }, select: { upiId: true } });
      if (s?.upiId) return s.upiId;
    }
    if (target.contactId) {
      const c = await prisma.splitContact.findUnique({ where: { id: target.contactId }, select: { upiId: true } });
      if (c?.upiId) return c.upiId;
    }
    return null;
  });
  if (!vpa) throw new NotFoundError(`SPLIT_NO_UPI: ${target.displayName} hasn't added a UPI ID`);

  const note = `${group.name} settle-up`.slice(0, 40);
  const amt = value.toFixed(2);
  return { uri: buildUpiUri({ vpa, name: target.displayName, amount: amt, note }), payeeName: target.displayName, payeeVpa: vpa, amount: serializeMoney(value), note };
}
