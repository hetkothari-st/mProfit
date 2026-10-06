/**
 * FD / RD reminders for the alerts bell:
 *   - maturity, 30 / 15 / 7 / 1 days out (the app-wide expiry lead times);
 *   - for recurring deposits, the next monthly installment 3 / 1 / 0 days out,
 *     and once when it's overdue.
 *
 * Bank deposits are DEPOSIT transactions, and an RD has one per installment,
 * each carrying the maturity date. So transactions are grouped into deposits
 * first — same portfolio + asset class + account no. (isin) or name, the same
 * grouping the FD page uses — otherwise an RD with 8 installments would raise
 * 8 identical maturity alerts. A MATURITY or WITHDRAWAL transaction closes a
 * deposit, and closed deposits get no reminders.
 *
 * Installment reminders use the CUSTOM alert type with a stable metadata key
 * (as rent-overdue alerts do), so no AlertType enum migration is needed. Every
 * alert carries a key that includes the date and threshold, so a re-run of the
 * nightly scan never duplicates one.
 */
import { Decimal } from 'decimal.js';
import type { AlertType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const DEPOSIT_MATURITY_THRESHOLDS = [30, 15, 7, 1] as const;
export const RD_INSTALLMENT_THRESHOLDS = [3, 1, 0] as const;

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return isoDay(d);
}

function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/** "100000" → "1,00,000.00" (Indian grouping). */
function inr(value: string | Decimal): string {
  const [int, frac] = new Decimal(value).toFixed(2).split('.') as [string, string];
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${grouped}.${frac}`;
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

async function createOnce(
  userId: string,
  type: AlertType,
  key: string,
  alert: { title: string; description: string; metadata: Record<string, unknown> },
): Promise<number> {
  const existing = await prisma.alert.findFirst({
    where: { userId, type, metadata: { path: ['key'], equals: key } },
  });
  if (existing) return 0;
  await prisma.alert.create({
    data: {
      userId,
      type,
      title: alert.title,
      description: alert.description,
      triggerDate: new Date(),
      metadata: { key, ...alert.metadata },
    },
  });
  return 1;
}

export async function generateDepositReminderAlerts(userId?: string): Promise<number> {
  const today = isoDay(new Date());

  const txns = await prisma.transaction.findMany({
    where: {
      ...(userId ? { portfolio: { userId } } : {}),
      assetClass: { in: ['FIXED_DEPOSIT', 'RECURRING_DEPOSIT'] },
      transactionType: { in: ['DEPOSIT', 'MATURITY', 'WITHDRAWAL'] },
    },
    select: {
      id: true,
      portfolioId: true,
      assetClass: true,
      assetName: true,
      isin: true,
      transactionType: true,
      tradeDate: true,
      maturityDate: true,
      price: true,
      netAmount: true,
      portfolio: { select: { userId: true } },
    },
    orderBy: { tradeDate: 'asc' },
  });

  const deposits = new Map<string, typeof txns>();
  for (const t of txns) {
    const identity =
      t.isin?.trim().toLowerCase() || (t.assetName ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const key = `${t.portfolioId}:${t.assetClass}:${identity}`;
    const group = deposits.get(key);
    if (group) group.push(t);
    else deposits.set(key, [t]);
  }

  let created = 0;
  for (const [depositKey, group] of deposits) {
    // A maturity payout or premature withdrawal closes the deposit.
    if (group.some((t) => t.transactionType !== 'DEPOSIT')) continue;
    const first = group[0]!;
    const maturity = group.find((t) => t.maturityDate)?.maturityDate;
    if (!maturity) continue;

    const ownerId = first.portfolio.userId;
    const isRd = first.assetClass === 'RECURRING_DEPOSIT';
    const name = first.assetName?.trim();
    const label = name ? `${name} ${isRd ? 'RD' : 'FD'}` : isRd ? 'Recurring deposit' : 'Fixed deposit';
    const openIso = isoDay(first.tradeDate);
    const maturityIso = isoDay(maturity);
    const toMaturity = daysBetween(today, maturityIso);

    if ((DEPOSIT_MATURITY_THRESHOLDS as readonly number[]).includes(toMaturity)) {
      const principal = isRd
        ? null
        : group.reduce((sum, t) => sum.plus(t.netAmount.toString()), new Decimal(0));
      created += await createOnce(ownerId, 'FD_MATURITY', `deposit_maturity:${depositKey}:${maturityIso}:${toMaturity}d`, {
        title: `${label} matures in ${days(toMaturity)}`,
        description: principal
          ? `₹${inr(principal)} deposit matures on ${maturityIso}`
          : `Matures on ${maturityIso}`,
        metadata: { depositKey, maturityDate: maturityIso, daysLeft: toMaturity },
      });
    }

    if (!isRd || toMaturity < 0) continue;
    const tenure = monthsBetween(openIso, maturityIso);
    const paid = group.length;
    if (paid >= tenure) continue;

    // Installment k (from 0) falls due k months after the first one.
    const dueIso = addMonths(openIso, paid);
    const toDue = daysBetween(today, dueIso);
    const overdue = toDue < 0;
    if (!overdue && !(RD_INSTALLMENT_THRESHOLDS as readonly number[]).includes(toDue)) continue;

    const amount = inr(first.price.toString());
    created += await createOnce(
      ownerId,
      'CUSTOM',
      `rd_installment:${depositKey}:${dueIso}:${overdue ? 'overdue' : `${toDue}d`}`,
      {
        title: overdue
          ? `${label} installment overdue by ${days(-toDue)}`
          : toDue === 0
            ? `${label} installment due today`
            : `${label} installment due in ${days(toDue)}`,
        description: `Installment of ₹${amount} ${overdue ? 'was due' : 'due'} on ${dueIso}`,
        metadata: { depositKey, dueDate: dueIso, daysLeft: toDue, isOverdue: overdue },
      },
    );
  }
  return created;
}
