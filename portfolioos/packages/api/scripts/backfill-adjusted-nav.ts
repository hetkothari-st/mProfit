/**
 * One-shot (re-runnable) backfill for `MFNav.adjustedNav` / `isQuarantined` —
 * implementation plan Task 1.4, `01-DATA-FOUNDATION.md §2, §6`.
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/backfill-adjusted-nav.ts
 *
 * Options (env):
 *   BACKFILL_FUND_BATCH   funds per job invocation (default 200)
 *   BACKFILL_OPS_USER_ID  who owns the IngestionFailure/Alert rows written
 *   BACKFILL_DRY_RUN=1    report the current column coverage and exit
 *
 * The work itself is `runMfNavAdjustment` — the same code path the nightly job
 * uses, so the backfill cannot drift from the job. This script only batches the
 * fund list so no single invocation exceeds the 5-minute budget, and prints a
 * summary.
 *
 * Re-runnable by construction: every write is a value-diff, and a DLQ row is
 * written only on the clean -> quarantined transition. A second run over
 * unchanged data writes nothing.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import {
  runMfNavAdjustment,
  type MfNavAdjustmentResult,
} from '../src/jobs/mfNavAdjustmentJob.js';

const BATCH = Number.parseInt(process.env.BACKFILL_FUND_BATCH ?? '200', 10);

function pct(part: number, whole: number): string {
  if (whole === 0) return '0.00%';
  return `${new Decimal(part).div(new Decimal(whole)).times(100).toFixed(2)}%`;
}

async function coverage(): Promise<{ total: number; adjusted: number; quarantined: number }> {
  return runAsSystem(async () => {
    const total = await prisma.mFNav.count();
    const adjusted = await prisma.mFNav.count({ where: { adjustedNav: { not: null } } });
    const quarantined = await prisma.mFNav.count({ where: { isQuarantined: true } });
    return { total, adjusted, quarantined };
  });
}

async function main(): Promise<void> {
  const before = await coverage();
  console.log(
    `[pre]   MFNav rows=${before.total}  adjustedNav set=${before.adjusted} (${pct(before.adjusted, before.total)})  quarantined=${before.quarantined} (${pct(before.quarantined, before.total)})`,
  );

  if (process.env.BACKFILL_DRY_RUN === '1') {
    console.log('[dry-run] BACKFILL_DRY_RUN=1 — no writes performed.');
    return;
  }

  const funds = await runAsSystem(() =>
    prisma.mutualFundMaster.findMany({ select: { id: true }, orderBy: { schemeCode: 'asc' } }),
  );
  console.log(`[plan]  ${funds.length} funds in ${Math.ceil(funds.length / BATCH)} batches of ${BATCH}`);

  const totals: MfNavAdjustmentResult = {
    fundsSeen: 0,
    fundsSkippedUnknownOption: 0,
    rowsSeen: 0,
    rowsQuarantined: 0,
    rowsNewlyQuarantined: 0,
    rowsAdjusted: 0,
    rowsLeftNull: 0,
    rowsWritten: 0,
    fundsSkippedMissingSibling: 0,
    basisCounts: {},
    dlqRowsWritten: 0,
    alertRaised: false,
    truncated: false,
    ms: 0,
  };

  const t0 = Date.now();
  for (let i = 0; i < funds.length; i += BATCH) {
    const batch = funds.slice(i, i + BATCH).map((f) => f.id);
    const r = await runMfNavAdjustment({
      fundIds: batch,
      opsUserId: process.env.BACKFILL_OPS_USER_ID,
      // Each batch gets the full budget; batching is what keeps a single
      // invocation short, so a truncation here means the batch size is too big.
      maxRunMs: 5 * 60 * 1000,
    });
    totals.fundsSeen += r.fundsSeen;
    totals.fundsSkippedUnknownOption += r.fundsSkippedUnknownOption;
    totals.rowsSeen += r.rowsSeen;
    totals.rowsQuarantined += r.rowsQuarantined;
    totals.rowsNewlyQuarantined += r.rowsNewlyQuarantined;
    totals.rowsAdjusted += r.rowsAdjusted;
    totals.rowsLeftNull += r.rowsLeftNull;
    totals.rowsWritten += r.rowsWritten;
    totals.fundsSkippedMissingSibling += r.fundsSkippedMissingSibling;
    totals.dlqRowsWritten += r.dlqRowsWritten;
    totals.alertRaised = totals.alertRaised || r.alertRaised;
    totals.truncated = totals.truncated || r.truncated;
    for (const [k, v] of Object.entries(r.basisCounts)) {
      totals.basisCounts[k] = (totals.basisCounts[k] ?? 0) + v;
    }
    console.log(
      `[batch] ${Math.floor(i / BATCH) + 1}/${Math.ceil(funds.length / BATCH)}  funds=${r.fundsSeen}  rows=${r.rowsSeen}  written=${r.rowsWritten}  quarantined=${r.rowsQuarantined}${r.truncated ? '  TRUNCATED (lower BACKFILL_FUND_BATCH)' : ''}`,
    );
  }
  totals.ms = Date.now() - t0;

  const after = await coverage();

  console.log('');
  console.log('==================== backfill summary ====================');
  console.log(`  funds seen                    ${totals.fundsSeen}`);
  console.log(`  funds skipped (option type)   ${totals.fundsSkippedUnknownOption}`);
  console.log(`  funds skipped (no sibling)    ${totals.fundsSkippedMissingSibling}`);
  console.log(`  NAV rows seen                 ${totals.rowsSeen}`);
  console.log(
    `  NAV rows adjusted             ${totals.rowsAdjusted} (${pct(totals.rowsAdjusted, totals.rowsSeen)})`,
  );
  console.log(`  NAV rows left null            ${totals.rowsLeftNull}`);
  console.log(
    `  NAV rows quarantined          ${totals.rowsQuarantined} (${pct(totals.rowsQuarantined, totals.rowsSeen)})`,
  );
  console.log(`  …newly quarantined this run   ${totals.rowsNewlyQuarantined}`);
  console.log(`  NAV rows written              ${totals.rowsWritten}`);
  console.log(`  IngestionFailure rows written ${totals.dlqRowsWritten}`);
  console.log(`  basis breakdown               ${JSON.stringify(totals.basisCounts)}`);
  console.log(`  >2% quarantine alert raised   ${totals.alertRaised}`);
  console.log(`  elapsed                       ${(totals.ms / 1000).toFixed(1)}s`);
  console.log('----------------------------------------------------------');
  console.log(
    `  coverage  adjustedNav ${before.adjusted} -> ${after.adjusted} of ${after.total} (${pct(after.adjusted, after.total)})`,
  );
  console.log(
    `  coverage  quarantined ${before.quarantined} -> ${after.quarantined} of ${after.total} (${pct(after.quarantined, after.total)})`,
  );
  console.log('==========================================================');

  if (totals.basisCounts.GROWTH_SIBLING_DERIVED) {
    console.log('');
    console.log(
      `⚠ ${totals.basisCounts.GROWTH_SIBLING_DERIVED} funds used GROWTH_SIBLING_DERIVED — the adjustedNav for those is an\n` +
        '  approximation inferred from the growth sibling, not a real distribution record.\n' +
        '  See the header of src/priceFeeds/adjustedNav.ts before quoting those returns.',
    );
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
