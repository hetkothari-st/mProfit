/**
 * Find (and, with --remove, delete) duplicate money rows for one user, from the
 * command line. Same engine as the "Find duplicates" button; this exists so the
 * books can be cleaned in one pass with a written record of what went.
 *
 *   pnpm --filter @everypaisa/api exec tsx scripts/duplicateCleanup.ts --email you@example.com
 *   … --email you@example.com --remove --out backup.json
 *
 * Without --remove it writes nothing. With --remove it deletes only the rows
 * the scan pre-ticks (its 'high' confidence groups — never the ones that look
 * like separate fills or two lines of one file), after writing every row it is
 * about to delete to the backup file.
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../src/lib/requestContext.js';
import { scanDuplicates, removeDuplicates } from '../src/services/duplicates.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email');
  const doRemove = process.argv.includes('--remove');
  const outPath = arg('out') ?? 'duplicate-backup.json';

  if (!email) {
    // Whose books? Print the candidates rather than guessing.
    const users = await runAsSystem(() =>
      prisma.user.findMany({
        where: { NOT: { email: { endsWith: '@test.local' } } },
        select: { email: true, name: true, _count: { select: { portfolios: true } } },
        orderBy: { portfolios: { _count: 'desc' } },
        take: 20,
      }),
    );
    for (const u of users) console.log(`${u.email}\t${u.name ?? ''}\t${u._count.portfolios} portfolio(s)`);
    console.log('\nRe-run with --email <one of the above>.');
    return;
  }

  const user = await runAsSystem(() =>
    prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }),
  );
  if (!user) throw new Error(`No user with email ${email}`);

  const { groups, scanned } = await runAsUser(user.id, () => scanDuplicates(user.id));
  console.log(
    `${user.email}: scanned ${scanned.transactions} transactions, ${scanned.rentEntries} rent entries`,
  );

  const high = groups.filter((g) => g.confidence === 'high');
  const low = groups.filter((g) => g.confidence === 'low');

  for (const g of groups) {
    console.log(`\n[${g.confidence}] ${g.label}`);
    console.log(`  ${g.reason}`);
    for (const row of g.rows) {
      const mark = row.id === g.keepId ? 'keep  ' : g.suggestedRemovalIds.includes(row.id) ? 'REMOVE' : 'leave ';
      const detail =
        row.kind === 'RENT_ENTRY'
          ? `${row.entryType} ${row.amount} on ${row.entryDate} (${row.forMonth ?? 'unpinned'})`
          : `${row.transactionType} ${row.quantity} @ ${row.price} on ${row.tradeDate}, net ${row.netAmount}, ${row.importFileName ?? row.sourceAdapter ?? 'manual'}`;
      console.log(`  ${mark} ${row.id}  ${detail}  added ${row.createdAt.slice(0, 10)}`);
    }
  }

  const removals = {
    transactionIds: high.flatMap((g) => g.rows.filter((r) => r.kind === 'TRANSACTION' && g.suggestedRemovalIds.includes(r.id)).map((r) => r.id)),
    rentEntryIds: high.flatMap((g) => g.rows.filter((r) => r.kind === 'RENT_ENTRY' && g.suggestedRemovalIds.includes(r.id)).map((r) => r.id)),
  };

  console.log(
    `\n${high.length} certain group(s), ${low.length} left alone. Would remove ${removals.transactionIds.length} transaction(s) and ${removals.rentEntryIds.length} rent entr(y/ies).`,
  );

  if (!doRemove) {
    console.log('Dry run — pass --remove to delete the rows marked REMOVE.');
    return;
  }

  // Everything about to go, written down first, so any of it can be re-entered.
  const doomed = groups.flatMap((g) =>
    g.rows.filter((r) => removals.transactionIds.includes(r.id) || removals.rentEntryIds.includes(r.id)),
  );
  writeFileSync(outPath, JSON.stringify({ user: user.email, removedAt: new Date().toISOString(), rows: doomed }, null, 2));
  console.log(`Backup of ${doomed.length} row(s) written to ${outPath}`);

  const res = await runAsUser(user.id, () => removeDuplicates(user.id, removals));
  console.log(`Removed ${res.removedTransactions} transaction(s), ${res.removedRentEntries} rent entr(y/ies).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
