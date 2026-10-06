import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request, Response } from 'express';
import * as reports from '../../src/controllers/reports.controller.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import { fakeRequest, fakeResponse } from '../helpers/fakeResponse.js';
import { seedReportData, type SeededReports } from '../helpers/seedReportData.js';

/**
 * Every report, actually run.
 *
 * The unit tests check what each report computes; this checks that it runs at
 * all, in every format the UI offers, against a user who holds something in
 * each stream. The bug this exists to catch is the one reading code found late
 * — an Excel sheet name taken from a report title containing "/", which made
 * most xlsx downloads fail with a 500 while every unit test stayed green.
 *
 * A report is "fine" here when the handler resolves, sets a content type, and
 * writes a non-trivial body. It says nothing about the numbers.
 */

type Handler = (req: Request, res: Response) => Promise<void>;

interface RouteCase {
  /** The route as the UI calls it, for the failure message. */
  path: string;
  handler: Handler;
  query?: Record<string, string>;
  /** Formats to drive it in. JSON-only endpoints list just 'json'. */
  formats?: Array<'json' | 'pdf' | 'xlsx'>;
}

const FY = '2024-25';
const DOWNLOAD_FORMATS: Array<'pdf' | 'xlsx'> = ['pdf', 'xlsx'];

/** The /download catalog: same shape, all driven in PDF and Excel. */
const DOWNLOADS: Array<[string, Handler, Record<string, string>?]> = [
  ['grandfathering', reports.downloadGrandfathering],
  ['demat-holdings', reports.downloadDematHoldings],
  ['m2m', reports.downloadM2M],
  ['trial-balance', reports.downloadTrialBalance],
  ['account-ledger', reports.downloadAccountLedger],
  ['profit-loss', reports.downloadProfitLoss, { from: '2024-04-01', to: '2025-03-31' }],
  ['balance-sheet', reports.downloadBalanceSheet],
  ['schedule-112a', reports.downloadSchedule112A, { fy: FY }],
  ['mf-capital-gain', reports.downloadMFCapitalGain, { fy: FY }],
  ['daily-transactions', reports.downloadDailyTransactions, { from: '2024-04-01', to: '2025-03-31' }],
  ['short-long-spec', reports.downloadShortLongSpec, { fy: FY }],
  ['income-report', reports.downloadIncomeReport, { fy: FY }],
  ['holdings-summary', reports.downloadHoldingsSummary],
  ['performance', reports.downloadPerformance],
  ['tax-summary', reports.downloadTaxSummary, { fy: FY }],
  ['cash-flow', reports.downloadCashFlow, { from: '2024-04-01', to: '2025-03-31' }],
  ['combined-realised-unrealised', reports.downloadCombinedRealisedUnrealised],
  ['family-wise-holdings', reports.downloadFamilyWiseHoldings],
  ['scriptwise-qtywise', reports.downloadScriptwiseQtywise, { from: '2024-04-01', to: '2025-03-31' }],
  ['contract-note-charges', reports.downloadContractNoteCharges],
  ['mf-m2m', reports.downloadMfM2M],
  ['financial-ledger', reports.downloadFinancialLedger, { from: '2024-04-01', to: '2025-03-31' }],
  ['closing-balance', reports.downloadClosingBalance],
  ['top-holdings', reports.downloadTopHoldings],
  ['sector-allocation', reports.downloadSectorAllocation],
  ['contract-notes-summary', reports.downloadContractNotesSummary],
  ['brokerwise-capital-gain', reports.downloadBrokerwiseCapitalGain, { fy: FY }],
  ['tax-pnl', reports.downloadTaxPnL, { fy: FY }],
  ['stt-10db', reports.downloadStt10Db, { fy: FY }],
  ['capital-gains-fifo', reports.downloadCapitalGainsFifo, { fy: FY }],
  ['advance-tax-summary', reports.downloadAdvanceTaxSummary, { fy: FY }],
  ['opening-stock', reports.downloadOpeningStock],
  ['holding-period-return', reports.downloadHoldingPeriodReturn],
  ['script-ledger', reports.downloadScriptLedger],
  ['chart-of-accounts', reports.downloadChartOfAccounts],
  ['fund-flow', reports.downloadFundFlow, { from: '2024-04-01', to: '2025-03-31' }],
  ['broker-bill-register-fmwise', reports.downloadBrokerBillRegister],
  ['portfolio-snapshot', reports.downloadPortfolioSnapshot],
  ['day-book', reports.downloadDayBook, { date: '2025-01-15' }],
  ['dividend-report', reports.downloadDividendReport, { fy: FY }],
  ['bank-reconciliation', reports.downloadBankReconciliation],
];

function routes(seed: SeededReports): RouteCase[] {
  const all = { portfolioId: 'all' };
  return [
    // JSON endpoints behind the Reports page tabs.
    { path: '/summary', handler: reports.getSummary, query: { portfolioId: seed.portfolioId }, formats: ['json'] },
    { path: '/intraday', handler: reports.getIntraday, query: { ...all, fy: FY }, formats: ['json'] },
    { path: '/stcg', handler: reports.getStcg, query: { ...all, fy: FY }, formats: ['json'] },
    { path: '/ltcg', handler: reports.getLtcg, query: { ...all, fy: FY }, formats: ['json'] },
    { path: '/schedule-112a', handler: reports.get112A, query: { ...all, fy: FY }, formats: ['json'] },
    { path: '/income', handler: reports.getIncome, query: { ...all, fy: FY }, formats: ['json'] },
    { path: '/unrealised', handler: reports.getUnrealised, query: all, formats: ['json'] },
    { path: '/xirr', handler: reports.getXirr, query: all, formats: ['json'] },
    { path: '/xirr/user', handler: reports.getUserXirr, formats: ['json'] },
    { path: '/historical-valuation', handler: reports.getHistoricalValuation, query: { portfolioId: seed.portfolioId }, formats: ['json'] },
    { path: '/grandfathering', handler: reports.getGrandfatheringReport, formats: ['json'] },
    { path: '/demat-holdings', handler: reports.getDematHoldingReport, formats: ['json'] },
    { path: '/m2m', handler: reports.getM2MReport, formats: ['json'] },
    // Exports and statements.
    { path: '/holdings-export', handler: reports.getHoldingsExport, query: { portfolioIds: 'all' } },
    { path: '/dashboard-export', handler: reports.getDashboardExport, query: { portfolioId: 'all' } },
    { path: '/section-export?section=loans', handler: reports.getSectionExport, query: { section: 'loans' } },
    { path: '/section-export?section=rental', handler: reports.getSectionExport, query: { section: 'rental' } },
    { path: '/section-export?section=insurance', handler: reports.getSectionExport, query: { section: 'insurance' } },
    { path: '/section-export?section=real-estate', handler: reports.getSectionExport, query: { section: 'real-estate' } },
    { path: '/statement/holdings', handler: reports.getStatementHoldings },
    { path: '/statement/capital-gains', handler: reports.getStatementCapitalGains, query: { fy: FY, kind: 'all' } },
    { path: '/statement/income', handler: reports.getStatementIncome, query: { fy: FY } },
    { path: '/statement/ledger', handler: reports.getStatementLedger, query: { from: '2024-04-01', to: '2025-03-31' } },
    { path: '/statement/provident-fund', handler: reports.downloadProvidentFund, query: { from: '2024-04-01', to: '2025-03-31' } },
    ...DOWNLOADS.map(([name, handler, query]) => ({ path: `/download/${name}`, handler, query })),
  ];
}

const CONTENT_TYPE: Record<string, RegExp> = {
  json: /json/,
  pdf: /pdf/,
  xlsx: /spreadsheet/,
};

describe('every report runs', () => {
  let seed: SeededReports;

  beforeAll(async () => {
    seed = await seedReportData();
  }, 120_000);

  afterAll(async () => {
    await seed.cleanup();
  });

  it('drives every report route in every format it offers', async () => {
    const failures: string[] = [];
    const thin: string[] = [];

    for (const route of routes(seed)) {
      for (const format of route.formats ?? DOWNLOAD_FORMATS) {
        const captured = fakeResponse();
        const req = fakeRequest(seed.userId, { ...(route.query ?? {}), format });
        try {
          await runAsUser(seed.userId, () => route.handler(req, captured.res));
          await captured.finished;
        } catch (err) {
          failures.push(`${route.path} [${format}] threw: ${(err as Error).message}`);
          continue;
        }
        const body = captured.body();
        const contentType = captured.headers['content-type'] ?? '';
        if (format !== 'json' && !CONTENT_TYPE[format]!.test(contentType)) {
          failures.push(`${route.path} [${format}] content-type was "${contentType}"`);
        }
        // A PDF page or a workbook is kilobytes; anything tiny means the
        // handler bailed without writing the report.
        const floor = format === 'json' ? 20 : 900;
        if (body.length < floor) thin.push(`${route.path} [${format}] wrote ${body.length} bytes`);
        if (format === 'json') {
          const json = captured.json() as { success?: boolean } | undefined;
          if (!json?.success) failures.push(`${route.path} [json] did not return success`);
        }
      }
    }

    expect({ failures, thin }).toEqual({ failures: [], thin: [] });
  }, 600_000);

  it('bundles a whole financial year as a zip', async () => {
    const captured = fakeResponse();
    await runAsUser(seed.userId, () =>
      reports.downloadFyBundle(fakeRequest(seed.userId, { fy: FY }), captured.res),
    );
    await captured.finished;
    const zip = captured.body();
    expect(captured.headers['content-type']).toBe('application/zip');
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(Number(captured.headers['x-bundle-failed'])).toBe(0);
    expect(Number(captured.headers['x-bundle-included'])).toBeGreaterThan(3);
  }, 300_000);
});
