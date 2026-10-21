import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Decimal } from 'decimal.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: a depository statement's "holdings as on" table never counts
 * shares twice. Each holding adds only the units the user's transactions
 * don't already account for on the statement date — whether those came from
 * earlier trades, this statement's own trades, or last month's statement —
 * and afterwards the app agrees with the statement.
 *
 * The runner is stubbed with what the NSDL/CDSL adapter emits: trades, then
 * one OPENING_BALANCE row per holding, plus the statement snapshot.
 */
const ISIN_A = 'INE000A01011';
const ISIN_B = 'INE000B01012';

let next: { trades: Array<[string, string, 'BUY' | 'SELL', string]>; holdings: Array<[string, string]>; asOf: string };

vi.mock('../../src/ingestion/fileImport/runner.js', () => ({
  runFileImportAdapter: vi.fn(async () => {
    const event = (isin: string, date: string, type: string, qty: string, narration?: string) => ({
      sourceAdapter: 'cas.depository.nsdl_cdsl',
      sourceAdapterVer: '2',
      sourceRef: 'test',
      ...(narration ? { sourceHash: `opening:${isin}:${date}:${qty}` } : {}),
      eventType: type === 'SELL' ? 'SELL' : 'BUY',
      eventDate: date,
      quantity: qty,
      price: '0',
      counterparty: 'NSDL CAS',
      instrumentIsin: isin,
      instrumentName: `Stock ${isin.slice(6, 7)}`,
      currency: 'INR',
      confidence: 1,
      metadata: { assetClass: 'EQUITY', transactionType: type, broker: 'NSDL CAS', ...(narration ? { narration } : {}) },
    });
    return {
      adapter: { id: 'cas.depository.nsdl_cdsl', version: '2' },
      result: {
        ok: true,
        events: [
          ...next.trades.map(([isin, date, type, qty]) => event(isin, date, type, qty)),
          ...next.holdings.map(([isin, qty]) =>
            event(isin, next.asOf, 'OPENING_BALANCE', qty, 'Opening holding from NSDL statement (cost basis unknown)'),
          ),
        ],
        warnings: [],
        metadata: {
          statement: {
            asOf: next.asOf,
            holdings: next.holdings.map(([isin, units]) => ({ isin, folio: null, schemeName: null, units })),
          },
        },
      },
    };
  }),
}));

const { createImportJob, processImportJob } = await import('../../src/services/imports/import.service.js');
const { findStatementMismatches } = await import('../../src/services/integrity/statementReconciliation.service.js');

describe('invariant: depository statement holdings are never counted twice', () => {
  let scope: TestScope;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depository-'));
  let n = 0;

  beforeAll(async () => {
    scope = await createTestScope('depository');
    // Bought before the statement period, entered by hand.
    await scope.runAs(() =>
      prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'BUY',
          assetName: 'Stock A',
          isin: ISIN_A,
          assetKey: `isin:${ISIN_A}`,
          tradeDate: new Date('2024-05-10'),
          quantity: '100',
          price: '10',
          grossAmount: '1000',
          netAmount: '1000',
        },
      }),
    );
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.ingestionFailure.deleteMany({ where: { userId: scope.userId } });
      await prisma.importJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.documentBlob.deleteMany({ where: { userId: scope.userId } });
      await prisma.userDataKey.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const importStatement = async () => {
    const file = path.join(dir, `statement-${++n}.pdf`);
    fs.writeFileSync(file, `%PDF-1.4 stub ${n}`);
    const job = await createImportJob({
      userId: scope.userId,
      portfolioId: scope.portfolioId,
      type: 'MF_CAS_PDF',
      fileName: `statement-${n}.pdf`,
      filePath: file,
    });
    return scope.runAs(() => processImportJob(job.id));
  };
  const units = async (isin: string) => {
    const txs = await scope.runAs(() => prisma.transaction.findMany({ where: { portfolioId: scope.portfolioId, isin } }));
    return txs.reduce(
      (s, t) => (t.transactionType === 'SELL' ? s.minus(t.quantity.toString()) : s.plus(t.quantity.toString())),
      new Decimal(0),
    );
  };

  it('adds only the shortfall: earlier trades and the statement’s own trades already count', async () => {
    // June statement: bought 10 more A in June; holds 110 A and 50 B (B never entered).
    next = { asOf: '2024-06-30', trades: [[ISIN_A, '2024-06-12', 'BUY', '10']], holdings: [[ISIN_A, '110'], [ISIN_B, '50']] };
    await importStatement();

    expect((await units(ISIN_A)).toString()).toBe('110');
    expect((await units(ISIN_B)).toString()).toBe('50');
    expect(await scope.runAs(() => findStatementMismatches(scope.userId))).toEqual([]);
  });

  it('a second month’s statement adds nothing that is already held', async () => {
    // July: sold 20 A; holds 90 A and 50 B.
    next = { asOf: '2024-07-31', trades: [[ISIN_A, '2024-07-15', 'SELL', '20']], holdings: [[ISIN_A, '90'], [ISIN_B, '50']] };
    await importStatement();

    expect((await units(ISIN_A)).toString()).toBe('90');
    expect((await units(ISIN_B)).toString()).toBe('50');
    expect(await scope.runAs(() => findStatementMismatches(scope.userId))).toEqual([]);
  });

  it('re-importing the same statement changes nothing', async () => {
    await importStatement();
    expect((await units(ISIN_A)).toString()).toBe('90');
    expect((await units(ISIN_B)).toString()).toBe('50');
  });
});
