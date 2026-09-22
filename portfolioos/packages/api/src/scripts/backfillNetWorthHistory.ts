/**
 * One-off backfill: seeds a NetWorthSnapshot for TODAY ONLY, for every
 * existing active user. There is no reliable source for real historical
 * net worth (no daily historical valuations for FDs/real estate/vehicles),
 * so this only gives the trend chart a day-1 starting point instead of an
 * empty state right after deploy — the nightly cron (netWorthSnapshotJob)
 * takes over from here.
 *
 * Follows the direct-DB-connection pattern from prisma/seed.ts and
 * src/scripts/seedFmv.ts: a second PrismaClient pointed at DIRECT_URL
 * (connects as the `postgres` superuser role, which is exempt from RLS
 * regardless of session context — see
 * prisma/migrations/20260421150000_phase_4_5_rls_app_role/migration.sql).
 * That client is used ONLY for the NetWorthSnapshot write; getDashboardNetWorth
 * still reads through the shared RLS-wrapped client via runAsUser so its
 * internal HoldingProjection/Vehicle/RentalProperty/etc. queries stay
 * correctly scoped to each user.
 */
import 'dotenv/config';
import { opsPrisma } from '../lib/opsDatabase.js';
import { runAsUser } from '../lib/requestContext.js';
import { getDashboardNetWorth } from '../services/dashboard.service.js';

const { prisma: directPrisma, disconnect } = opsPrisma();

function todayAsOf(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function backfill() {
  const asOf = todayAsOf();
  const users = await directPrisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  console.log(`Backfilling day-1 net worth snapshot for ${users.length} users (asOf=${asOf.toISOString().slice(0, 10)})...`);

  let done = 0;
  let failed = 0;
  for (const u of users) {
    try {
      const nw = await runAsUser(u.id, () => getDashboardNetWorth(u.id));
      await directPrisma.netWorthSnapshot.upsert({
        where: { userId_asOf: { userId: u.id, asOf } },
        create: {
          userId: u.id,
          asOf,
          totalNetWorth: nw.totalNetWorth,
          totalLiabilities: nw.totalLiabilities,
          netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
          breakdownJson: nw.allocationBreakdown,
        },
        update: {
          totalNetWorth: nw.totalNetWorth,
          totalLiabilities: nw.totalLiabilities,
          netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
          breakdownJson: nw.allocationBreakdown,
        },
      });
      done++;
    } catch (err) {
      failed++;
      console.error(`Failed for user ${u.id}:`, err);
    }
  }
  console.log(`Done. ${done} succeeded, ${failed} failed.`);
}

backfill()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect();
  });
