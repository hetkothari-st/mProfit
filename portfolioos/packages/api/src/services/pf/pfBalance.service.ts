/**
 * pfBalance.service.ts
 *
 * Sets ProvidentFundAccount.currentBalance from the passbook rows already
 * stored as CanonicalEvents. Every path that ingests a passbook (portal fetch,
 * browser extension, manual PDF upload) calls `refreshPfAccountBalance` after
 * its events are written; before this existed nothing wrote currentBalance at
 * all, so the PF page, the PF statement, the estate view and the AI tools
 * showed no balance however many passbooks were imported.
 *
 * The balance is the running balance printed on the latest passbook row, per
 * member ID (an EPF UAN can carry several, one per employer), summed. It is
 * deliberately NOT a sum of event amounts: passbooks repeat an opening-balance
 * row every year, so summing would count the corpus once per year.
 */

import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export const PF_EVENT_TYPES = [
  'PF_EMPLOYER_CONTRIBUTION',
  'PF_EMPLOYEE_CONTRIBUTION',
  'PF_VPF_CONTRIBUTION',
  'PF_INTEREST_CREDIT',
  'PF_WITHDRAWAL',
  'PF_TRANSFER_IN',
  'PF_TRANSFER_OUT',
  'PF_OPENING_BALANCE',
] as const;

export interface PfBalanceEvent {
  eventDate: Date;
  createdAt: Date;
  metadata: unknown;
}

function meta(e: PfBalanceEvent): { member: string; balance: string | null; position: number } {
  const m = (e.metadata ?? {}) as Record<string, unknown>;
  const balance = typeof m['balance'] === 'string' && m['balance'] !== '' ? (m['balance'] as string) : null;
  const member = typeof m['memberIdLast4'] === 'string' ? (m['memberIdLast4'] as string) : '';
  const position = typeof m['position'] === 'number' ? (m['position'] as number) : 0;
  return { member, balance, position };
}

/**
 * Closing balance from stored passbook events, or null when none of them
 * carries a running balance (events imported before balances were captured).
 * Latest row per member wins: by date, then by import time, then by position
 * on the passbook (same-day rows keep the passbook's own order).
 */
export function closingBalanceFromEvents(events: PfBalanceEvent[]): Decimal | null {
  const latest = new Map<string, { e: PfBalanceEvent; position: number; balance: string }>();
  for (const e of events) {
    const { member, balance, position } = meta(e);
    if (balance === null) continue;
    const cur = latest.get(member);
    const later =
      !cur ||
      e.eventDate.getTime() > cur.e.eventDate.getTime() ||
      (e.eventDate.getTime() === cur.e.eventDate.getTime() &&
        (e.createdAt.getTime() > cur.e.createdAt.getTime() ||
          (e.createdAt.getTime() === cur.e.createdAt.getTime() && position > cur.position)));
    if (later) latest.set(member, { e, position, balance });
  }
  if (latest.size === 0) return null;
  let total = new Decimal(0);
  for (const { balance } of latest.values()) total = total.plus(new Decimal(balance));
  return total;
}

/**
 * Recompute and store the account's balance from its passbook events.
 * Leaves the stored balance alone when no event carries a running balance,
 * rather than overwriting a known figure with zero.
 */
export async function refreshPfAccountBalance(
  userId: string,
  accountId: string,
): Promise<Decimal | null> {
  const events = await prisma.canonicalEvent.findMany({
    where: { userId, sourceRef: accountId, eventType: { in: [...PF_EVENT_TYPES] } },
    select: { eventDate: true, createdAt: true, metadata: true },
  });
  const balance = closingBalanceFromEvents(events);
  if (balance === null) return null;
  await prisma.providentFundAccount.update({
    where: { id: accountId },
    data: { currentBalance: new Prisma.Decimal(balance.toFixed(4)) },
  });
  return balance;
}
