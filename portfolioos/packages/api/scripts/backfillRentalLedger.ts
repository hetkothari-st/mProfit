/**
 * One-time backfill: turn legacy RentReceipt payment state into
 * RentLedgerEntry rows, then recompute every tenancy and assert nothing
 * that should be preserved moved.
 *
 * `runAsSystem` lives in `../src/lib/requestContext.js`, not
 * `../src/lib/prisma.js` — confirmed against `test/helpers/db.ts`, whose
 * header comment says setup/cleanup run under `runAsSystem` and which
 * imports it from `requestContext.js`. `prisma.ts` only re-exports `prisma`
 * and `runInTransaction`.
 *
 * IDEMPOTENCY, PRECISELY: each generated entry carries a deterministic
 * `sourceHash` prefixed with `backfill:payment:`/`backfill:deposit:`
 * (CLAUDE.md §3.3), so re-running THIS SCRIPT inserts nothing new. That is
 * not the same as "safe to run after go-live": once the app's normal write
 * paths are live, a receipt's `receivedAmount` may reflect a genuine
 * `RentLedgerEntry` created through the real payment flow rather than this
 * script. Before creating a synthetic payment, the payment loop therefore
 * also checks for any existing non-backfill `PAYMENT` entry already pinned
 * to that tenancy+month (identified by a `sourceHash` that is null or does
 * not carry the backfill prefix) and skips the receipt if one exists — so a
 * post-cutover re-run does not double-count a receipt that has since been
 * paid for real.
 *
 * `receivedOn` IS PRESERVED, NOT REDEFINED: the ledger projects
 * `RentReceipt.receivedOn` from the entryDate of the FIRST credit allocated
 * to a receipt (`allocateCredits`'s `firstCreditDate`), which is the
 * column's pre-ledger meaning — "the date money first arrived for this
 * month". This script dates each synthetic PAYMENT at the receipt's own
 * `receivedOn`, so a legacy receipt — RECEIVED or PARTIAL alike — keeps the
 * date it already had. It moves only when the money itself moves (e.g. a
 * receipt whose stale legacy `receivedAmount` is discarded), and then it
 * moves alongside a `drift` row. This matters concretely: the dashboard's
 * YTD rental income and `propertyPnL` both filter
 * `status IN ('RECEIVED','PARTIAL') AND receivedOn >= <date>`, so clearing
 * `receivedOn` on PARTIAL rows would erase partly-paid months from both.
 *
 * SEMANTIC CHANGES, STILL REPORTED: `cashFlowId` and
 * `autoMatchedFromEventId` stop being receipt-owned facts — the ledger
 * derives them from whichever entry contributed first, so they can move or
 * clear when FIFO spillover changes that. A silent column change in a
 * one-way migration is exactly what this script must not hide, so
 * `report.drift` stays money-only (`status` + `receivedAmount`) and every
 * other observable change — including any `receivedOn` movement — is listed
 * in `report.semanticChanges`, visible without being mistaken for a
 * regression.
 *
 * NO ROLLBACK ON DRIFT: each tenancy's recompute commits in its own
 * transaction (`runInTransaction` per tenancy, not one transaction for the
 * whole sweep — holding locks across every tenancy is the pattern this
 * project's guidelines forbid). By the time `report.drift` is computed, any
 * drifted writes are already live; a non-empty `drift` array or non-zero
 * exit code is a post-hoc signal, not a rollback. Take a database snapshot
 * before running this against real data.
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
  /** Money-only: a receipt's `status` or `receivedAmount` moved. Must stay empty. */
  drift: Array<{ receiptId: string; before: string; after: string }>;
  /**
   * Non-money columns that moved because the ledger now derives them from
   * entries rather than storing them on the receipt (see header). Chiefly
   * `cashFlowId` / `autoMatchedFromEventId`; `receivedOn` is preserved by
   * the backfill and appears here only when it genuinely shifted. Not a
   * failure signal — a record for review.
   */
  semanticChanges: Array<{ receiptId: string; field: string; before: string | null; after: string | null }>;
}

const BACKFILL_PAYMENT_PREFIX = 'backfill:payment:';
const BACKFILL_DEPOSIT_PREFIX = 'backfill:deposit:';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const backfillPaymentHash = (receiptId: string) =>
  `${BACKFILL_PAYMENT_PREFIX}${hash(`rentledger:backfill:payment:${receiptId}`)}`;
const backfillDepositHash = (tenancyId: string) =>
  `${BACKFILL_DEPOSIT_PREFIX}${hash(`rentledger:backfill:deposit:${tenancyId}`)}`;

export async function backfillRentalLedger(
  opts: { dryRun?: boolean } = {},
): Promise<BackfillReport> {
  return runAsSystem(async () => {
    const report: BackfillReport = {
      paymentsCreated: 0,
      depositsCreated: 0,
      tenanciesRecomputed: 0,
      drift: [],
      semanticChanges: [],
    };

    const receipts = await prisma.rentReceipt.findMany({
      where: { receivedAmount: { not: null } },
    });
    const tenancies = await prisma.tenancy.findMany();

    // Snapshot the pre-backfill projection so the post-recompute pass can
    // compare — every observable field the recompute might touch, not just
    // the money-only pair used for `drift`.
    const before = new Map(
      (await prisma.rentReceipt.findMany()).map((r) => [
        r.id,
        {
          status: r.status,
          receivedAmount: r.receivedAmount?.toString() ?? null,
          receivedOn: r.receivedOn?.toISOString() ?? null,
          cashFlowId: r.cashFlowId,
          autoMatchedFromEventId: r.autoMatchedFromEventId,
        },
      ]),
    );

    for (const r of receipts) {
      // A live (non-backfill) PAYMENT already pinned to this tenancy+month
      // means the receipt's current receivedAmount came from the real
      // post-cutover payment flow, not stale legacy state. Don't create a
      // second, synthetic payment for it — that would double-count in
      // allocateCredits on the very next recompute.
      const liveEntry = await prisma.rentLedgerEntry.findFirst({
        where: {
          tenancyId: r.tenancyId,
          entryType: 'PAYMENT',
          forMonth: r.forMonth,
          OR: [
            { sourceHash: null },
            { NOT: { sourceHash: { startsWith: BACKFILL_PAYMENT_PREFIX } } },
          ],
        },
      });
      if (liveEntry) continue;

      const sourceHash = backfillPaymentHash(r.id);
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
      const sourceHash = backfillDepositHash(t.id);
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
      const prior = before.get(r.id);
      if (prior === undefined) continue;

      const afterMoney = `${r.status}|${r.receivedAmount?.toString() ?? ''}`;
      const priorMoney = `${prior.status}|${prior.receivedAmount ?? ''}`;
      if (priorMoney !== afterMoney) {
        report.drift.push({ receiptId: r.id, before: priorMoney, after: afterMoney });
      }

      const afterReceivedOn = r.receivedOn?.toISOString() ?? null;
      if (prior.receivedOn !== afterReceivedOn) {
        report.semanticChanges.push({
          receiptId: r.id, field: 'receivedOn', before: prior.receivedOn, after: afterReceivedOn,
        });
      }
      if (prior.cashFlowId !== r.cashFlowId) {
        report.semanticChanges.push({
          receiptId: r.id, field: 'cashFlowId', before: prior.cashFlowId, after: r.cashFlowId,
        });
      }
      if (prior.autoMatchedFromEventId !== r.autoMatchedFromEventId) {
        report.semanticChanges.push({
          receiptId: r.id,
          field: 'autoMatchedFromEventId',
          before: prior.autoMatchedFromEventId,
          after: r.autoMatchedFromEventId,
        });
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
