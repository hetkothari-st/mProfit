import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { Transaction } from '@prisma/client';
import { expectedProjections, replayTransactions } from '../../src/services/holdings/holdingsProjection.js';
import { computeFIFOGains } from '../../src/services/tax/capitalGains.service.js';
import {
  compareGains,
  compareHoldings,
  type StoredGain,
} from '../../src/services/integrity/storedDataIntegrity.service.js';
import {
  parseStatementSnapshot,
  reconcileSnapshot,
} from '../../src/services/integrity/statementReconciliation.service.js';
import {
  dataQualityMetaLines,
  mergeDataQuality,
  type DataQualityReport,
} from '../../src/services/integrity/reportDataQuality.service.js';
import { parseMfCasText } from '../../src/ingestion/fileImport/parsers/mfCas.parser.js';

/**
 * The pure halves of the report data-integrity checks: what the stored rows
 * SHOULD be, how a disagreement is detected, and how a statement's closing
 * position is read and reconciled. No database.
 */

let seq = 0;
function tx(p: {
  type?: Transaction['transactionType'];
  date: string;
  qty: string;
  net: string;
  key?: string;
  isin?: string | null;
  portfolioId?: string;
  assetClass?: Transaction['assetClass'];
}): Transaction {
  const d = (v: string) => new Decimal(v) as unknown as Transaction['quantity'];
  return {
    id: `t${++seq}`,
    portfolioId: p.portfolioId ?? 'pf1',
    holdingId: null,
    assetClass: p.assetClass ?? 'EQUITY',
    transactionType: p.type ?? 'BUY',
    stockId: null,
    fundId: null,
    assetName: 'TEST',
    isin: p.isin === undefined ? 'INE000A00000' : p.isin,
    tradeDate: new Date(`${p.date}T00:00:00Z`),
    settlementDate: null,
    quantity: d(p.qty),
    price: d('0'),
    grossAmount: d(p.net),
    brokerage: d('0'),
    stt: d('0'),
    stampDuty: d('0'),
    exchangeCharges: d('0'),
    gst: d('0'),
    sebiCharges: d('0'),
    otherCharges: d('0'),
    netAmount: d(p.net),
    strikePrice: null,
    expiryDate: null,
    optionType: null,
    lotSize: null,
    maturityDate: null,
    interestRate: null,
    interestFrequency: null,
    broker: null,
    exchange: 'NSE',
    orderNo: null,
    tradeNo: null,
    narration: null,
    importJobId: null,
    assetKey: p.key ?? 'stock:a',
    sourceAdapter: null,
    sourceAdapterVer: null,
    sourceHash: null,
    canonicalEventId: null,
    equityTaxOverride: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Transaction;
}

describe('expectedProjections', () => {
  it('keeps held assets, drops sold-out ones and F&O, FIFO cost on what is left', () => {
    const txs = [
      tx({ date: '2024-01-01', qty: '10', net: '1000' }), // 10 @ 100
      tx({ date: '2024-02-01', qty: '10', net: '1100' }), // 10 @ 110
      tx({ type: 'SELL', date: '2024-03-01', qty: '15', net: '1800' }),
      tx({ key: 'stock:b', date: '2024-01-01', qty: '5', net: '500' }),
      tx({ key: 'stock:b', type: 'SELL', date: '2024-02-01', qty: '5', net: '600' }),
      tx({ key: 'fno:x', assetClass: 'FUTURES', date: '2024-01-01', qty: '50', net: '1000' }),
    ];
    const exp = expectedProjections(txs);
    expect([...exp.keys()]).toEqual(['stock:a']);
    // 5 units left from the second lot at 110.
    expect(exp.get('stock:a')!.quantity.toString()).toBe('5');
    expect(exp.get('stock:a')!.totalCost.toString()).toBe('550');
  });
});

describe('replay order', () => {
  it('same-day purchases replay in entry order, whatever order they are read in', () => {
    const early = { ...tx({ date: '2024-01-01', qty: '10', net: '1000' }), createdAt: new Date('2024-01-01T09:00:00Z') };
    const late = { ...tx({ date: '2024-01-01', qty: '10', net: '2000' }), createdAt: new Date('2024-01-01T10:00:00Z') };
    const sell = tx({ type: 'SELL', date: '2024-02-01', qty: '10', net: '1500' });
    const a = replayTransactions([early, late, sell]);
    const b = replayTransactions([late, early, sell]);
    // The ₹100 lot entered first is sold; the ₹200 lot is what is left.
    expect(a.totalCost.toString()).toBe('2000');
    expect(b.totalCost.toString()).toBe(a.totalCost.toString());
  });
});

describe('compareHoldings', () => {
  const exp = expectedProjections([
    tx({ date: '2024-01-01', qty: '10', net: '1000' }),
    tx({ key: 'stock:b', date: '2024-01-01', qty: '3', net: '99.99' }),
  ]);

  it('reports nothing when stored rows match, inside stored-precision rounding', () => {
    expect(
      compareHoldings(exp, [
        { assetKey: 'stock:a', quantity: '10.000000', totalCost: '1000.0000' },
        { assetKey: 'stock:b', quantity: '3', totalCost: '99.99' },
      ]),
    ).toEqual([]);
  });

  it('finds a missing row, an extra row, a wrong quantity and a wrong cost', () => {
    const kinds = (stored: Parameters<typeof compareHoldings>[1]) =>
      compareHoldings(exp, stored).map((d) => `${d.assetKey}:${d.kind}`).sort();
    expect(kinds([{ assetKey: 'stock:a', quantity: '10', totalCost: '1000' }])).toEqual(['stock:b:MISSING']);
    expect(
      kinds([
        { assetKey: 'stock:a', quantity: '10', totalCost: '1000' },
        { assetKey: 'stock:b', quantity: '3', totalCost: '99.99' },
        { assetKey: 'stock:ghost', quantity: '1', totalCost: '1' },
      ]),
    ).toEqual(['stock:ghost:UNEXPECTED']);
    expect(
      kinds([
        { assetKey: 'stock:a', quantity: '20', totalCost: '1000' },
        { assetKey: 'stock:b', quantity: '3', totalCost: '100.99' },
      ]),
    ).toEqual(['stock:a:QUANTITY', 'stock:b:COST']);
  });
});

describe('compareGains', () => {
  const rows = computeFIFOGains([
    tx({ date: '2023-01-01', qty: '10', net: '1000' }),
    tx({ type: 'SELL', date: '2024-06-01', qty: '4', net: '600' }),
  ]);
  const stored: StoredGain[] = rows.map((r) => ({
    sellTransactionId: r.sellTransactionId,
    buyTransactionId: r.buyTransactionId,
    quantity: r.quantity,
    gainLoss: r.gainLoss,
    capitalGainType: r.capitalGainType,
    financialYear: r.financialYear,
  }));

  it('matches identical rows', () => {
    expect(compareGains(rows, stored)).toEqual({ missing: 0, unexpected: 0 });
  });
  it('counts a missing row, a duplicated row and a stale amount', () => {
    expect(compareGains(rows, [])).toEqual({ missing: 1, unexpected: 0 });
    expect(compareGains(rows, [...stored, ...stored])).toEqual({ missing: 0, unexpected: 1 });
    expect(compareGains(rows, [{ ...stored[0]!, gainLoss: '1' }])).toEqual({ missing: 1, unexpected: 1 });
  });
});

describe('CAS closing positions', () => {
  it('reads "Closing Unit Balance" lines and the statement period end date', () => {
    const text = [
      'Consolidated Account Statement',
      '01-Apr-2023 To 31-Mar-2024',
      'Folio No: 111 / 22',
      'Axis Bluechip Fund - Direct Growth - ISIN: INF846K01DP8',
      '05-Apr-2023 Purchase 1,000.000 40.0000 40,000.00',
      'Closing Unit Balance: 1,000.000 NAV on 31-Mar-2024: INR 52.1000 Market Value on 31-Mar-2024: INR 52,100.00',
      'Folio No: 333',
      'Axis Bluechip Fund - Direct Growth - ISIN: INF846K01DP8',
      'Closing Unit Balance: 250.500 NAV on 31-Mar-2024: INR 52.1000',
    ].join('\n');
    const { statement, transactions } = parseMfCasText(text);
    expect(transactions).toHaveLength(1);
    expect(statement).toEqual({
      asOf: '2024-03-31',
      holdings: [
        { isin: 'INF846K01DP8', folio: '111', schemeName: 'Axis Bluechip Fund - Direct Growth -', units: '1000' },
        { isin: 'INF846K01DP8', folio: '333', schemeName: 'Axis Bluechip Fund - Direct Growth -', units: '250.5' },
      ],
    });
  });

  it('gives no statement when the closing date is unknown', () => {
    const text = ['Folio No: 1', 'X Fund ISIN: INF846K01DP8', 'Closing Units: 10.000'].join('\n');
    expect(parseMfCasText(text).statement).toBeUndefined();
  });

  it('rejects malformed stored snapshots', () => {
    expect(parseStatementSnapshot(null)).toBeNull();
    expect(parseStatementSnapshot({ asOf: '31-03-2024', holdings: [] })).toBeNull();
    expect(parseStatementSnapshot({ asOf: '2024-03-31', holdings: [{ isin: 'X', units: 'abc' }] })).toBeNull();
    expect(parseStatementSnapshot({ asOf: '2024-03-31', holdings: [{ isin: 'X', units: '1.5' }] })).toEqual({
      asOf: '2024-03-31',
      holdings: [{ isin: 'X', folio: null, schemeName: null, units: '1.5' }],
    });
  });
});

describe('reconcileSnapshot', () => {
  const ISIN = 'INF846K01DP8';
  const snapshot = { asOf: '2024-03-31', holdings: [{ isin: ISIN, folio: '1', schemeName: 'Axis', units: '1250.5' }] };
  const mf = (p: Parameters<typeof tx>[0]) => tx({ assetClass: 'MUTUAL_FUND', isin: ISIN, key: `isin:${ISIN}`, ...p });

  it('agrees when transactions up to the statement date add up, across portfolios', () => {
    const txs = [
      mf({ date: '2023-04-05', qty: '1000', net: '40000' }),
      mf({ date: '2024-03-31', qty: '250.5', net: '13000', portfolioId: 'pf2' }),
      // After the statement: not missing from it, just later.
      mf({ date: '2024-04-10', qty: '99', net: '5000' }),
    ];
    expect(reconcileSnapshot(snapshot, txs)).toEqual([]);
  });

  it('reports the gap when a purchase is missing', () => {
    const gaps = reconcileSnapshot(snapshot, [mf({ date: '2023-04-05', qty: '1000', net: '40000' })]);
    expect(gaps).toEqual([{ isin: ISIN, schemeName: 'Axis', statementUnits: '1250.5', appUnits: '1000' }]);
  });

  it('reports a scheme on the statement with no transactions at all', () => {
    expect(reconcileSnapshot(snapshot, [])[0]!.appUnits).toBe('0');
  });
});

describe('download stamp', () => {
  const base: DataQualityReport = {
    ok: true,
    checkedAt: '2026-10-19T00:00:00Z',
    dataAsOf: { lastTransactionDate: '2026-10-01', lastImportAt: null, oldestPriceDate: '2026-10-16', newestPriceDate: '2026-10-17' },
    errorCount: 0,
    warningCount: 0,
    issues: [],
  };

  it('says the data passed, and when it is from', () => {
    expect(dataQualityMetaLines(base)).toEqual([
      { label: 'Data as of', value: 'transactions to 2026-10-01, prices to 2026-10-17' },
      { label: 'Data checks', value: 'All checks passed' },
    ]);
  });

  it('a household is clean only if every member is', () => {
    const bad = { ...base, ok: false, errorCount: 1, dataAsOf: { ...base.dataAsOf, lastTransactionDate: '2026-10-05' } };
    const merged = mergeDataQuality([base, bad]);
    expect(merged.ok).toBe(false);
    expect(merged.dataAsOf.lastTransactionDate).toBe('2026-10-05');
    expect(dataQualityMetaLines(merged)[1]!.value).toBe('1 problem(s) affect these figures — see Reports page');
  });
});
