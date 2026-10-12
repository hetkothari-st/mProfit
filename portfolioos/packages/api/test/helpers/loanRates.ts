import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * The loan-rate tables are global, so per-user cleanup cannot reach them. Suites that write rates own these
 * tables in the isolated local test DB and reset them before and after.
 */
export async function clearLoanRateTables(): Promise<void> {
  await runAsSystem(async () => {
    await prisma.loanRate.deleteMany({});
    await prisma.benchmarkRate.deleteMany({});
    await prisma.loanRateSource.updateMany({ data: { lastSuccessAt: null, lastErrorAt: null, lastError: null } });
  });
}
