/**
 * One-time backfill: turn legacy RentReceipt payment state into
 * RentLedgerEntry rows, then recompute every tenancy and assert nothing
 * moved.
 *
 * Idempotent — each generated entry carries a deterministic `sourceHash`
 * (CLAUDE.md §3.3), so a second run inserts nothing.
 *
 * `runAsSystem` lives in `../src/lib/requestContext.js`, not
 * `../src/lib/prisma.js` — confirmed against `test/helpers/db.ts`, whose
 * header comment says setup/cleanup run under `runAsSystem` and which
 * imports it from `requestContext.js`. `prisma.ts` only re-exports `prisma`
 * and `runInTransaction`.
 *
 * Run: pnpm --filter @portfolioos/api exec tsx scripts/backfillRentalLedger.ts
 */

import { createHash } from 'node:crypto';
import { prisma, runInTransaction } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import { recomputeTenancyLedger } from '../src/services/rentalLedger.service.js';

export interface BackfillReport {
  paymentsCreated: number;
  depositsCreated: number;
  tenanciesRecomputed: number;
  drift: Array<{ receiptId: string; before: string; after: string }>;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export async function backfillRentalLedger(
  opts: { dryRun?: boolean } = {},
): Promise<BackfillReport> {
  return runAsSystem(async () => {
    const report: BackfillReport = {
      paymentsCreated: 0,
      depositsCreated: 0,
      tenanciesRecomputed: 0,
      drift: [],
    };

    const receipts = await prisma.rentReceipt.findMany({
      where: { receivedAmount: { not: null } },
    });
    const tenancies = await prisma.tenancy.findMany();

    // Snapshot the pre-backfill projection so step 5 can compare.
    const before = new Map(
      (await prisma.rentReceipt.findMany()).map((r) => [
        r.id,
        `${r.status}|${r.receivedAmount?.toString() ?? ''}`,
      ]),
    );

    for (const r of receipts) {
      const sourceHash = hash(`rentledger:backfill:payment:${r.id}`);
      const exists = await prisma.rentLedgerEntry.findUnique({ where: { sourceHash } });
      if (exists) continue;
      if (opts.dryRun) { report.paymentsCreated += 1; continue; }
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: r.tenancyId,
          entryType: 'PAYMENT',
          amount: r.receivedAmount!,
          entryDate: r.receivedOn ?? r.dueDate,
          forMonth: r.forMonth,
          note: 'Backfilled from receipt',
          cashFlowId: r.cashFlowId,
          canonicalEventId: r.autoMatchedFromEventId,
          sourceHash,
        },
      });
      report.paymentsCreated += 1;
    }

    for (const t of tenancies) {
      if (!t.securityDeposit || t.securityDeposit.lte(0)) continue;
      const sourceHash = hash(`rentledger:backfill:deposit:${t.id}`);
      const exists = await prisma.rentLedgerEntry.findUnique({ where: { sourceHash } });
      if (exists) continue;
      if (opts.dryRun) { report.depositsCreated += 1; continue; }
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: t.id,
          entryType: 'DEPOSIT',
          amount: t.securityDeposit,
          entryDate: t.startDate,
          note: 'Security deposit (backfilled from tenancy)',
          sourceHash,
        },
      });
      report.depositsCreated += 1;
    }

    if (opts.dryRun) return report;

    for (const t of tenancies) {
      await runInTransaction((tx) => recomputeTenancyLedger(tx, t.id));
      report.tenanciesRecomputed += 1;
    }

    for (const r of await prisma.rentReceipt.findMany()) {
      const after = `${r.status}|${r.receivedAmount?.toString() ?? ''}`;
      const prior = before.get(r.id);
      if (prior !== undefined && prior !== after) {
        report.drift.push({ receiptId: r.id, before: prior, after });
      }
    }

    return report;
  });
}

// Direct execution: print the report and exit non-zero on drift.
if (process.argv[1]?.endsWith('backfillRentalLedger.ts')) {
  const dryRun = process.argv.includes('--dry-run');
  backfillRentalLedger({ dryRun })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.drift.length === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
