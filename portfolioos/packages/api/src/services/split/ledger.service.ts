/** Read models: group balances, the cross-group friend list, the activity feed. */
import { Decimal } from 'decimal.js';
import type { SplitActivityDto, SplitBalancesDto, SplitFriendDto, SplitTransferDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { BadRequestError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';
import { requireMember, loadLedger, listGroups } from './groups.service.js';
import { memberNets, pairwiseDebts, simplify, type Transfer } from './balances.js';

async function transfersFor(groupId: string, simplifyDebts: boolean) {
  const ledger = await loadLedger(groupId);
  const nets = memberNets(ledger.expenses, ledger.settlements, ledger.memberIds);
  const transfers = simplifyDebts ? simplify(nets) : pairwiseDebts(ledger.expenses, ledger.settlements);
  return { nets, transfers };
}

const dto = (t: Transfer): SplitTransferDto => ({ fromMemberId: t.fromMemberId, toMemberId: t.toMemberId, amount: serializeMoney(t.amount) });

export async function groupBalances(userId: string, groupId: string): Promise<SplitBalancesDto> {
  await requireMember(userId, groupId);
  const g = await prisma.splitGroup.findUniqueOrThrow({ where: { id: groupId }, select: { baseCurrency: true, simplifyDebts: true } });
  const { nets, transfers } = await transfersFor(groupId, g.simplifyDebts);
  return {
    groupId,
    baseCurrency: g.baseCurrency,
    nets: [...nets].map(([memberId, net]) => ({ memberId, net: serializeMoney(net) })),
    transfers: transfers.map(dto),
    simplified: g.simplifyDebts,
  };
}

export async function listFriends(userId: string): Promise<SplitFriendDto[]> {
  const settings = await prisma.splitSettings.findUnique({ where: { userId }, select: { homeCurrency: true } });
  const home = settings?.homeCurrency ?? 'INR';
  const groups = await listGroups(userId, { includeDirect: true, includeArchived: true });
  const friends = new Map<string, SplitFriendDto & { total: Decimal }>();
  // A placeholder is the same person across groups when it came from one of my contacts.
  const myContacts = await prisma.splitContact.findMany({ where: { ownerUserId: userId }, select: { id: true, linkedUserId: true } });
  const myContactIds = new Set(myContacts.map((c) => c.id));
  const contactByLinkedUser = new Map(myContacts.filter((c) => c.linkedUserId).map((c) => [c.linkedUserId!, c.id]));

  for (const g of groups) {
    const me = g.members.find((m) => m.isMe);
    if (!me) continue;
    const { transfers } = await transfersFor(g.id, g.simplifyDebts);
    const rate = g.baseCurrency === home ? new Decimal(1) : await getLatestFxRate(g.baseCurrency, home);
    for (const other of g.members) {
      if (other.isMe) continue;
      let net = new Decimal(0); // > 0: they owe me
      for (const t of transfers) {
        if (t.fromMemberId === other.id && t.toMemberId === me.id) net = net.plus(t.amount);
        if (t.fromMemberId === me.id && t.toMemberId === other.id) net = net.minus(t.amount);
      }
      const key = other.userId ? `u:${other.userId}` : other.contactId && myContactIds.has(other.contactId) ? `c:${other.contactId}` : `m:${other.id}`;
      const f = friends.get(key) ?? { key, displayName: other.displayName, userId: other.userId, contactId: key.startsWith('c:') ? key.slice(2) : other.userId ? contactByLinkedUser.get(other.userId) ?? null : null, currency: home, net: serializeMoney(0), approx: false, groups: [], total: new Decimal(0) };
      f.groups.push({ groupId: g.id, groupName: g.name, net: serializeMoney(net), currency: g.baseCurrency });
      if (rate) f.total = f.total.plus(net.mul(rate));
      if (g.baseCurrency !== home) f.approx = true;
      friends.set(key, f);
    }
  }
  return [...friends.values()]
    .map(({ total, ...f }) => ({ ...f, net: serializeMoney(total.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)) }))
    .sort((x, y) => x.displayName.localeCompare(y.displayName));
}

export async function listActivity(userId: string, opts: { groupId?: string; limit?: number; before?: string }): Promise<SplitActivityDto[]> {
  if (opts.groupId) await requireMember(userId, opts.groupId);
  let beforeDate: Date | undefined;
  if (opts.before) {
    beforeDate = new Date(opts.before);
    if (Number.isNaN(beforeDate.getTime())) throw new BadRequestError('Invalid before cursor');
  }
  const rawLimit = Math.trunc(opts.limit ?? 50);
  const take = Math.min(Math.max(Number.isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
  const rows = await prisma.splitActivity.findMany({
    where: {
      ...(opts.groupId ? { groupId: opts.groupId } : { group: { members: { some: { userId, leftAt: null } } } }),
      ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { group: { select: { name: true, members: { select: { userId: true, displayName: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    groupName: r.group.name,
    actorUserId: r.actorUserId,
    actorName: r.group.members.find((m) => m.userId === r.actorUserId)?.displayName ?? 'Someone',
    kind: r.kind,
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
  }));
}
