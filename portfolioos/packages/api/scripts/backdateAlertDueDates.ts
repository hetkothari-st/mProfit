/**
 * One-off: re-date open reminder alerts by the due date they already carry.
 *
 * Reminder alerts used to be dated the day the scan fired (`triggerDate =
 * now`), so the Alerts page counted "N days late" from the reminder, not from
 * the money (launch review B6). New alerts are dated by their due date; this
 * moves the existing open ones to theirs. A script, not a migration, so it
 * runs once when an operator chooses to — not on every deploy.
 *
 * Touches only active alerts whose `metadata.dueDate` is a YYYY-MM-DD date
 * different from their trigger date. Only `triggerDate` changes.
 *
 * Dry run (default — writes nothing, prints counts by alert type):
 *   pnpm --filter @everypaisa/api exec tsx scripts/backdateAlertDueDates.ts
 * Write:
 *   pnpm --filter @everypaisa/api exec tsx scripts/backdateAlertDueDates.ts --apply
 */

import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface BackdateReport {
  dryRun: boolean;
  /** Open alerts with a due date that differs from their trigger date. */
  candidates: number;
  /** Rows written (0 on a dry run). */
  updated: number;
  byType: Record<string, number>;
}

export async function backdateAlertDueDates(opts: { apply: boolean; userId?: string }): Promise<BackdateReport> {
  return runAsSystem(async () => {
    const open = await prisma.alert.findMany({
      where: { isActive: true, ...(opts.userId ? { userId: opts.userId } : {}) },
      select: { id: true, type: true, triggerDate: true, metadata: true },
    });
    const moves: Array<{ id: string; to: Date }> = [];
    const byType: Record<string, number> = {};
    for (const a of open) {
      const due = (a.metadata as { dueDate?: unknown } | null)?.dueDate;
      if (typeof due !== 'string' || !ISO_DAY.test(due)) continue;
      const to = new Date(`${due}T00:00:00Z`);
      if (!Number.isFinite(to.getTime()) || to.getTime() === a.triggerDate.getTime()) continue;
      moves.push({ id: a.id, to });
      byType[a.type] = (byType[a.type] ?? 0) + 1;
    }

    let updated = 0;
    if (opts.apply) {
      for (const m of moves) {
        await prisma.alert.update({ where: { id: m.id }, data: { triggerDate: m.to } });
        updated++;
      }
    }
    return { dryRun: !opts.apply, candidates: moves.length, updated, byType };
  });
}

if (process.argv[1]?.endsWith('backdateAlertDueDates.ts')) {
  const apply = process.argv.includes('--apply');
  backdateAlertDueDates({ apply })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      if (r.dryRun) console.log(`Dry run: ${r.candidates} alert(s) would be re-dated. Nothing was written. Re-run with --apply to write.`);
      else console.log(`Re-dated ${r.updated} alert(s).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
