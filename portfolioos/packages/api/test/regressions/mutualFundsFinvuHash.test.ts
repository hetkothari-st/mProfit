/**
 * Mutual-funds defect 5: the Finvu `sourceHash` was `sha256("finvu:" + txnId)`
 * while `Transaction.sourceHash` is globally unique. Two accounts importing
 * the same folio (a couple sharing a joint folio, a family member) got the
 * same txnId, so the second import collided with — or was silently "deduped"
 * against — a row it cannot even see under RLS.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { createHash } from 'node:crypto';

const TXN_ID = `FINVU-TEST-${Date.now()}`;
const ISIN = `INF${Date.now().toString().slice(-9)}`;

vi.mock('../../src/ingestion/finfactor/mf.service.js', () => ({
  fetchMfInsights: async () => ({ holdings: [] }),
  fetchMfStatement: async () => [
    {
      txnId: TXN_ID,
      isin: ISIN,
      amfiCode: `AMFI-${ISIN}`,
      isinDescription: 'Finvu Hash Test Fund',
      amc: 'Test AMC',
      type: 'BUY',
      subType: '',
      transactionDateTime: '2025-02-03T00:00:00Z',
      units: '10',
      nav: '25.5',
      amount: '255',
      folioNo: '12345',
    },
  ],
}));

import { syncFinvuMutualFunds } from '../../src/ingestion/finfactor/sync.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const scopes: TestScope[] = [];

afterAll(async () => {
  for (const s of scopes) {
    await runAsSystem(() => prisma.holdingProjection.deleteMany({ where: { portfolio: { userId: s.userId } } }));
    await s.cleanup();
  }
  await runAsSystem(() => prisma.mutualFundMaster.deleteMany({ where: { isin: ISIN } }));
});

async function txCount(s: TestScope): Promise<number> {
  return runAsSystem(() =>
    prisma.transaction.count({ where: { portfolio: { userId: s.userId }, isin: ISIN } }),
  );
}

describe('Finvu sourceHash is scoped to the importing user', () => {
  it('lets two users import the same folio transaction, each once', async () => {
    const a = await createTestScope('finvu-a');
    const b = await createTestScope('finvu-b');
    scopes.push(a, b);

    const ra = await a.runAs(() =>
      syncFinvuMutualFunds(a.userId, { uniqueIdentifier: 'x', portfolioId: a.portfolioId }),
    );
    expect(ra.transactionsCreated).toBe(1);

    const rb = await b.runAs(() =>
      syncFinvuMutualFunds(b.userId, { uniqueIdentifier: 'x', portfolioId: b.portfolioId }),
    );
    expect(rb.transactionsCreated).toBe(1);
    expect(await txCount(a)).toBe(1);
    expect(await txCount(b)).toBe(1);

    // Still idempotent per user.
    const again = await b.runAs(() =>
      syncFinvuMutualFunds(b.userId, { uniqueIdentifier: 'x', portfolioId: b.portfolioId }),
    );
    expect(again.transactionsCreated).toBe(0);
    expect(await txCount(b)).toBe(1);
  });

  it('recognises a row written with the pre-scoping key, so a re-sync does not duplicate it', async () => {
    const c = await createTestScope('finvu-legacy');
    scopes.push(c);
    const legacyHash = createHash('sha256').update(`finvu:${TXN_ID}`).digest('hex');
    await runAsSystem(() =>
      prisma.transaction.create({
        data: {
          portfolioId: c.portfolioId,
          assetClass: 'MUTUAL_FUND',
          transactionType: 'BUY',
          assetName: 'Finvu Hash Test Fund',
          isin: ISIN,
          assetKey: `isin:${ISIN}`,
          tradeDate: new Date('2025-02-03T00:00:00Z'),
          quantity: '10',
          price: '25.5',
          grossAmount: '255',
          netAmount: '255',
          sourceAdapter: 'finvu.aa.v1',
          sourceAdapterVer: '1.0.0',
          sourceHash: legacyHash,
        },
      }),
    );
    const r = await c.runAs(() =>
      syncFinvuMutualFunds(c.userId, { uniqueIdentifier: 'x', portfolioId: c.portfolioId }),
    );
    expect(r.transactionsCreated).toBe(0);
    expect(await txCount(c)).toBe(1);
  });
});
