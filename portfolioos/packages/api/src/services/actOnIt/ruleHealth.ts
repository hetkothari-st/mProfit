import { Decimal } from 'decimal.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { missesPromise } from './measureMath.js';

/**
 * Self-policing (spec §6.4, replaces human review): each suggestion type's
 * measured results, across all users, are compared with what it promised.
 * A type whose last 10 acted-on results include 3 or more that delivered under
 * half the promised gain is paused: its open advice is withdrawn and the engine
 * stops running it. Unpausing is clearing pausedAt on its AdviceRuleHealth row.
 * Runs as system (reads across users).
 */

export const HEALTH_WINDOW = 10;
export const HEALTH_MAX_MISSES = 3;
export const PAUSED_NOTE = 'This kind of advice is paused: it missed its own estimates too often';

export async function updateRuleHealth(now: Date = new Date()): Promise<{ paused: string[] }> {
  const rules = await prisma.advisorRecommendation.findMany({
    where: { outcomeStatus: 'MEASURED', status: 'DONE', confirmedBy: 'DATA' },
    distinct: ['ruleId'],
    select: { ruleId: true },
  });
  const paused: string[] = [];
  for (const { ruleId } of rules) {
    const recent = await prisma.advisorRecommendation.findMany({
      where: { ruleId, outcomeStatus: 'MEASURED', status: 'DONE', confirmedBy: 'DATA' },
      orderBy: { measuredAt: 'desc' },
      take: HEALTH_WINDOW,
      select: { promise: true, outcomeInr: true },
    });
    const misses = recent.filter((r) => {
      const gain = (r.promise as { gainInr?: unknown } | null)?.gainInr;
      return missesPromise(typeof gain === 'string' ? new Decimal(gain) : null, new Decimal(r.outcomeInr?.toString() ?? '0'));
    }).length;
    const existing = await prisma.adviceRuleHealth.findUnique({ where: { ruleId } });
    const pause = misses >= HEALTH_MAX_MISSES && !existing?.pausedAt;
    await prisma.adviceRuleHealth.upsert({
      where: { ruleId },
      create: { ruleId, measured: recent.length, misses, ...(pause && { pausedAt: now, pauseReason: `${misses} of the last ${recent.length} results under half the promised gain` }) },
      update: { measured: recent.length, misses, ...(pause && { pausedAt: now, pauseReason: `${misses} of the last ${recent.length} results under half the promised gain` }) },
    });
    if (pause) {
      paused.push(ruleId);
      const res = await prisma.advisorRecommendation.updateMany({
        where: { ruleId, status: { in: ['OPEN', 'SNOOZED'] }, supersededById: null },
        data: { status: 'WITHDRAWN', statusNote: PAUSED_NOTE, statusChangedAt: now },
      });
      logger.warn({ ruleId, misses, withdrawn: res.count }, '[actOnIt] advice type paused');
    }
  }
  return { paused };
}

/** Rule ids currently paused (the engine skips them). */
export async function pausedRuleIds(): Promise<Set<string>> {
  const rows = await prisma.adviceRuleHealth.findMany({ where: { pausedAt: { not: null } }, select: { ruleId: true } });
  return new Set(rows.map((r) => r.ruleId));
}
