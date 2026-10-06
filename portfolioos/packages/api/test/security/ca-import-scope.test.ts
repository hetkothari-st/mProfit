import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { processImportJob } from '../../src/services/imports/import.service.js';

// F6: a CA's upload is parsed under the CLIENT's identity, so a CA limited to
// mutual funds could import an equity contract note into the client's books.
// The grant's asset classes now travel with the job and bound what it writes.
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  return scope;
}

const CSV = [
  'Symbol,ISIN,Exchange,AssetClass,TransactionType,TradeDate,Quantity,Price,Brokerage,STT,Broker,OrderNo,TradeNo',
  'RELIANCE,INE002A01018,NSE,EQUITY,BUY,2024-01-15,10,2850.50,28.50,3.55,Zerodha,F6000001,F6T001',
  'Axis Bluechip Fund - Growth,INF846K01DP8,,MUTUAL_FUND,BUY,2024-01-05,41.123,48.7890,0,0,,F6000002,F6T002',
].join('\n');

async function jobFor(u: TestScope, allowed: string[] | null, csv = CSV) {
  const file = path.join(os.tmpdir(), `f6-${u.userId}-${Date.now()}.csv`);
  fs.writeFileSync(file, csv);
  cleanups.push(async () => fs.rmSync(file, { force: true }));
  return runAsSystem(() =>
    prisma.importJob.create({
      data: {
        userId: u.userId,
        portfolioId: u.portfolioId,
        type: 'GENERIC_CSV',
        fileName: 'f6.csv',
        filePath: file,
        status: 'PENDING',
        caAllowedAssetClasses: allowed ?? undefined,
      },
    }),
  );
}

async function classesWritten(u: TestScope) {
  const rows = await runAsUser(u.userId, () =>
    prisma.transaction.findMany({ where: { portfolioId: u.portfolioId }, select: { assetClass: true } }),
  );
  return rows.map((r) => r.assetClass).sort();
}

describe('an import uploaded by a class-limited CA', () => {
  it('writes only the asset classes the grant covers', async () => {
    const u = await person('f6-limited');
    const job = await jobFor(u, ['MUTUAL_FUND']);
    const result = await runAsUser(u.userId, () => processImportJob(job.id));
    expect(await classesWritten(u)).toEqual(['MUTUAL_FUND']);
    expect(result.errors.some((e) => /asset class/i.test(e.reason))).toBe(true);
  });

  // Mutual funds only: an equity row would reach out for a live price here.
  it('is unaffected when the uploader is not limited', async () => {
    const u = await person('f6-open');
    const lines = CSV.split('\n');
    const job = await jobFor(u, null, [lines[0], lines[2]].join('\n'));
    const result = await runAsUser(u.userId, () => processImportJob(job.id));
    expect(await classesWritten(u)).toEqual(['MUTUAL_FUND']);
    expect(result.errors.some((e) => /asset class/i.test(e.reason))).toBe(false);
  });
});
