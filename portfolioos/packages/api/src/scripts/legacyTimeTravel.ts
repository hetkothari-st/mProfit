// Usage: tsx src/scripts/legacyTimeTravel.ts <ownerEmail> <YYYY-MM-DD>
// Runs the daily Legacy Transfer tick as if today were <date>, so QA can walk
// a plan through warnings → grace → release without waiting weeks.
// Dev/QA only: refuses to run in production or against a non-local database.
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { runLegacyTick } from '../services/legacy/runner.service.js';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('legacyTimeTravel refuses to run in production');
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('legacyTimeTravel only runs against a local database');
  }
  const [email, day] = process.argv.slice(2);
  if (!email || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) throw new Error('usage: legacyTimeTravel <ownerEmail> <YYYY-MM-DD>');
  const now = new Date(`${day}T04:30:00Z`); // 10:00 IST, when the real cron runs
  const out = await runLegacyTick(now);
  const plan = await runAsSystem(() => prisma.legacyPlan.findFirst({ where: { user: { email } } }));
  console.log(JSON.stringify({ now, out, status: plan?.status ?? null, cycle: plan?.cycle ?? null }, null, 2));
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
