import { prisma } from '../lib/prisma.js';

/**
 * TASK-01 fix-mf-debt-equity-tax-classification — acceptance criterion:
 * "One-off report of category coverage across existing MutualFundMaster rows
 * is run and shared before this is merged, so any backfill need is known,
 * not discovered by a user."
 *
 * `MutualFundMaster.category` is NOT NULL, so every row technically "has" a
 * category — but two situations still need attention:
 *   1. `ensureMutualFundMaster` (masterData.service.ts) hard-codes
 *      `category: 'OTHER'` as a placeholder when a fund is created without a
 *      scheme-master match. That's indistinguishable at the DB level from an
 *      AMFI-sourced fund whose bucket header genuinely didn't match any
 *      known category — this report can't tell them apart, only surface the
 *      'OTHER' count as "needs a human look."
 *   2. MUTUAL_FUND transactions with no `fundId` at all can never resolve a
 *      category regardless of MutualFundMaster completeness — these always
 *      surface as `needsReview` on their CapitalGain rows.
 *
 * Not wired into any cron — run on demand:
 *   pnpm --filter @portfolioos/api run mf-category:coverage
 */
async function main() {
  const totalFunds = await prisma.mutualFundMaster.count();
  if (totalFunds === 0) {
    console.log('No MutualFundMaster rows found.');
  } else {
    const byCategory = await prisma.mutualFundMaster.groupBy({
      by: ['category'],
      _count: { _all: true },
      orderBy: { _count: { category: 'desc' } },
    });

    console.log(`MutualFundMaster: ${totalFunds} rows total\n`);
    console.log('By category:');
    for (const row of byCategory) {
      const pct = ((row._count._all / totalFunds) * 100).toFixed(1);
      console.log(`  ${row.category.padEnd(18)} ${String(row._count._all).padStart(6)}  (${pct}%)`);
    }

    const otherCount = byCategory.find((r) => r.category === 'OTHER')?._count._all ?? 0;
    if (otherCount > 0) {
      const pct = ((otherCount / totalFunds) * 100).toFixed(1);
      console.log(
        `\n${otherCount} fund(s) (${pct}%) are category 'OTHER' — this is either a genuine AMFI` +
          ` "other scheme" bucket or a placeholder created by ensureMutualFundMaster() without a` +
          ` scheme-master match. Worth a manual look before relying on their tax treatment.`,
      );
    }
  }

  // Transactions that can never resolve a category regardless of
  // MutualFundMaster completeness — no fundId at all.
  const [mfTxTotal, mfTxNoFundId] = await Promise.all([
    prisma.transaction.count({ where: { assetClass: 'MUTUAL_FUND' } }),
    prisma.transaction.count({ where: { assetClass: 'MUTUAL_FUND', fundId: null } }),
  ]);
  console.log(`\nMUTUAL_FUND transactions: ${mfTxTotal} total, ${mfTxNoFundId} with no fundId set.`);
  if (mfTxNoFundId > 0) {
    console.log(
      `${mfTxNoFundId} transaction(s) will always be flagged needsReview until they're linked to a` +
        ` MutualFundMaster row (re-import via CAS/contract-note parser, or manual edit).`,
    );
  }

  // Post-fix signal: once `persistCapitalGainsFor*` has re-run for affected
  // portfolios, this shows exactly how many CapitalGain rows are flagged.
  // Will read 0/0 before the FIFO recompute job has run for existing data —
  // that's expected, not a sign the fix is inert.
  const [cgTotal, cgNeedsReview] = await Promise.all([
    prisma.capitalGain.count(),
    prisma.capitalGain.count({ where: { needsReview: true } }),
  ]);
  console.log(`\nCapitalGain rows: ${cgTotal} total, ${cgNeedsReview} flagged needsReview.`);
  if (cgTotal > 0 && cgNeedsReview > 0) {
    const pct = ((cgNeedsReview / cgTotal) * 100).toFixed(1);
    console.log(`${pct}% of persisted capital-gain rows need manual category verification.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
