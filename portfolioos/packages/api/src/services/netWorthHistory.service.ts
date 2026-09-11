import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { serializeMoney, toDecimal } from '@everypaisa/shared';

export type NetWorthHistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const PERIOD_DAYS: Record<Exclude<NetWorthHistoryPeriod, 'ALL'>, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

export interface NetWorthHistoryPoint {
  asOf: string;
  totalNetWorth: string;
  totalLiabilities: string;
  netWorthAfterLiabilities: string;
}

export interface NetWorthHistorySummary {
  changeAbsolute: string;
  changePct: number | null;
  periodLabel: NetWorthHistoryPeriod;
}

export interface NetWorthHistoryResult {
  points: NetWorthHistoryPoint[];
  summary: NetWorthHistorySummary;
}

export async function getNetWorthHistory(
  userId: string,
  period: NetWorthHistoryPeriod,
): Promise<NetWorthHistoryResult> {
  const where: Prisma.NetWorthSnapshotWhereInput = { userId };
  if (period !== 'ALL') {
    const days = PERIOD_DAYS[period];
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - days);
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    where.asOf = { gte: from };
  }

  const rows = await prisma.netWorthSnapshot.findMany({
    where,
    orderBy: { asOf: 'asc' },
    select: { asOf: true, totalNetWorth: true, totalLiabilities: true, netWorthAfterLiabilities: true },
  });

  const points: NetWorthHistoryPoint[] = rows.map((r) => ({
    asOf: r.asOf.toISOString().slice(0, 10),
    totalNetWorth: serializeMoney(r.totalNetWorth),
    totalLiabilities: serializeMoney(r.totalLiabilities),
    netWorthAfterLiabilities: serializeMoney(r.netWorthAfterLiabilities),
  }));

  let changeAbsolute = toDecimal(0);
  let changePct: number | null = null;
  if (rows.length >= 2) {
    const first = toDecimal(rows[0]!.netWorthAfterLiabilities);
    const last = toDecimal(rows[rows.length - 1]!.netWorthAfterLiabilities);
    changeAbsolute = last.minus(first);
    changePct = first.isZero() ? null : changeAbsolute.dividedBy(first.abs()).times(100).toNumber();
  }

  return {
    points,
    summary: {
      changeAbsolute: serializeMoney(changeAbsolute),
      changePct,
      periodLabel: period,
    },
  };
}
