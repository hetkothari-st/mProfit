/**
 * Recompute every MF score at one `asOf`, replacing what is stored.
 *
 * `MfSchemeScore` is insert-only per `(schemeCode, asOf, methodologyVersion)`
 * and the job skips rows it finds, so a rerun after a scoring-logic change is a
 * no-op unless the old rows go first. This deletes exactly one `asOf` and then
 * runs the job over every universe.
 *
 * Peer ranks and metrics are untouched: they are the job's INPUT, they take
 * hours to rebuild, and a change to how a rating is gated does not change how a
 * fund was ranked.
 *
 * Dump the table before running this. There is no undo.
 */
import { runAsSystem } from '../lib/requestContext.js';
import { prisma } from '../lib/prisma.js';
import { listUniverses } from '../services/mfAnalytics/mfPeerRank.service.js';
import { runMfScoreForUniverses } from '../jobs/mfScoreJob.js';

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === undefined) throw new Error('usage: rescoreMfAtAsOf <YYYY-MM-DD>');
  const asOf = new Date(`${arg}T00:00:00.000Z`);
  if (Number.isNaN(asOf.getTime())) throw new Error(`not a date: ${arg}`);

  const before = await prisma.mfSchemeScore.groupBy({
    by: ['ratingStatus'],
    where: { asOf },
    _count: { _all: true },
  });
  console.log('before:', Object.fromEntries(before.map((r) => [r.ratingStatus, r._count._all])));

  const deleted = await prisma.mfSchemeScore.deleteMany({ where: { asOf } });
  console.log(`deleted ${deleted.count} rows at ${arg}`);

  const result = await runAsSystem(async () => {
    const refs = await listUniverses();
    console.log(`scoring ${refs.length} universes...`);
    return runMfScoreForUniverses(refs, asOf);
  });

  console.log('after:', result.ratingStatusCounts);
  console.log('result:', JSON.stringify(result));
  await prisma.$disconnect();
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
