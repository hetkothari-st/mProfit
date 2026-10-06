import { prisma } from '../lib/prisma.js';
import { runAsUser } from '../lib/requestContext.js';
import { listGrandfatheringRows } from '../services/fmvOverride.service.js';

/**
 * Diagnostic: reports, per user (and in aggregate), what share of
 * grandfathering-eligible LTCG rows have a resolved 31-Jan-2018 FMV vs. still
 * need manual user input. Guards against the seed silently losing coverage
 * again as new listings/transactions show up. Not wired into any cron —
 * run on demand: `pnpm --filter @everypaisa/api run fmv:coverage [userId]`.
 */
async function main() {
  const onlyUserId = process.argv[2];

  const users = onlyUserId
    ? await prisma.user.findMany({ where: { id: onlyUserId }, select: { id: true, email: true } })
    : await prisma.user.findMany({ select: { id: true, email: true } });

  if (users.length === 0) {
    console.log(onlyUserId ? `No user found with id ${onlyUserId}` : 'No users found.');
    return;
  }

  let totalRows = 0;
  let totalResolved = 0;

  for (const user of users) {
    const rows = await runAsUser(user.id, () => listGrandfatheringRows(user.id));
    if (rows.length === 0) continue;

    const resolved = rows.filter((r) => !r.needsUserInput).length;
    totalRows += rows.length;
    totalResolved += resolved;

    const pct = ((resolved / rows.length) * 100).toFixed(1);
    console.log(`${user.email}: ${resolved}/${rows.length} rows have FMV (${pct}%)`);
  }

  if (totalRows === 0) {
    console.log('No grandfathering-eligible LTCG rows found for any user.');
    return;
  }

  const overallPct = ((totalResolved / totalRows) * 100).toFixed(1);
  console.log(`\nAggregate: ${totalResolved}/${totalRows} rows have FMV (${overallPct}%)`);
  console.log(`${totalRows - totalResolved} rows still need manual FMV entry.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
