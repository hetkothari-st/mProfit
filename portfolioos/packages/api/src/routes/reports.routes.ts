import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getSummary,
  getIntraday,
  getStcg,
  getLtcg,
  get112A,
  getIncome,
  getUnrealised,
  getXirr,
  getUserXirr,
  getHistoricalValuation,
  rebuildCapitalGains,
  getHoldingsExport,
  getDashboardExport,
  getSectionExport,
  getStatementHoldings,
  getStatementCapitalGains,
  getStatementIncome,
  getStatementLedger,
  getGrandfatheringReport,
  getDematHoldingReport,
  getM2MReport,
  downloadGrandfathering,
  downloadDematHoldings,
  downloadM2M,
  downloadTrialBalance,
  downloadAccountLedger,
  downloadProfitLoss,
  downloadBalanceSheet,
  downloadSchedule112A,
  downloadMFCapitalGain,
  downloadDailyTransactions,
  downloadShortLongSpec,
  downloadIncomeReport,
  downloadHoldingsSummary,
  downloadPerformance,
  downloadTaxSummary,
  downloadCashFlow,
  downloadCombinedRealisedUnrealised,
  downloadFamilyWiseHoldings,
  downloadScriptwiseQtywise,
  downloadContractNoteCharges,
  downloadMfM2M,
  downloadFinancialLedger,
  downloadClosingBalance,
  downloadTopHoldings,
  downloadSectorAllocation,
  downloadContractNotesSummary,
  downloadBrokerwiseCapitalGain,
  downloadTaxPnL,
  downloadStt10Db,
  downloadCapitalGainsFifo,
  downloadAdvanceTaxSummary,
  downloadOpeningStock,
  downloadHoldingPeriodReturn,
  downloadScriptLedger,
  downloadChartOfAccounts,
  downloadFundFlow,
  downloadBrokerBillRegister,
  downloadPortfolioSnapshot,
  downloadDayBook,
  downloadDividendReport,
  downloadBankReconciliation,
  downloadTallyMasters,
  downloadTallyVouchers,
} from '../controllers/reports.controller.js';

export const reportsRouter = Router();

reportsRouter.use(authenticate);

// Free tier gets basic reports only (holdings summary, XIRR, cash flow —
// see PLAN_LIMITS / FEATURE_MIN_TIER in @portfolioos/shared). Everything
// else in this file's /download catalog requires TAX_REPORT_CATALOG
// (Plus) or ACCOUNTING_MODULE (Pro/Advisor) for the accounting-specific
// exports. The non-download endpoints above (/summary, /xirr, /statement/*,
// etc.) power the core dashboard and stay ungated for every tier.
const gateTax = requireFeature('TAX_REPORT_CATALOG');
const gateAccounting = requireFeature('ACCOUNTING_MODULE');
reportsRouter.get('/summary', asyncHandler(getSummary));
reportsRouter.get('/intraday', asyncHandler(getIntraday));
reportsRouter.get('/stcg', asyncHandler(getStcg));
reportsRouter.get('/ltcg', asyncHandler(getLtcg));
reportsRouter.get('/schedule-112a', asyncHandler(get112A));
reportsRouter.get('/income', asyncHandler(getIncome));
reportsRouter.get('/unrealised', asyncHandler(getUnrealised));
reportsRouter.get('/xirr', asyncHandler(getXirr));
reportsRouter.get('/xirr/user', asyncHandler(getUserXirr));
reportsRouter.get('/historical-valuation', asyncHandler(getHistoricalValuation));
reportsRouter.post('/rebuild-capital-gains', asyncHandler(rebuildCapitalGains));
reportsRouter.get('/holdings-export', asyncHandler(getHoldingsExport));
reportsRouter.get('/dashboard-export', asyncHandler(getDashboardExport));
reportsRouter.get('/section-export', asyncHandler(getSectionExport));

// Statement-style reports (sectioned, FY-grouped, industry-standard layouts).
reportsRouter.get('/statement/holdings', asyncHandler(getStatementHoldings));
reportsRouter.get('/statement/capital-gains', asyncHandler(getStatementCapitalGains));
reportsRouter.get('/statement/income', asyncHandler(getStatementIncome));
reportsRouter.get('/statement/ledger', asyncHandler(getStatementLedger));

// Specialised reports — Indian-broker layouts (grandfathering / demat / M2M).
reportsRouter.get('/grandfathering', asyncHandler(getGrandfatheringReport));
reportsRouter.get('/demat-holdings', asyncHandler(getDematHoldingReport));
reportsRouter.get('/m2m', asyncHandler(getM2MReport));

// Tax / MIS downloads — PDF + Excel only, no inline UI.
// Free tier: holdings-summary + cash-flow only (the "basic reports" carve-
// out). Accounting-specific exports need PRO_ADVISOR; the rest of the
// catalog needs PLUS.
reportsRouter.get('/download/grandfathering', gateTax, asyncHandler(downloadGrandfathering));
reportsRouter.get('/download/demat-holdings', gateTax, asyncHandler(downloadDematHoldings));
reportsRouter.get('/download/m2m', gateTax, asyncHandler(downloadM2M));
reportsRouter.get('/download/trial-balance', gateAccounting, asyncHandler(downloadTrialBalance));
reportsRouter.get('/download/account-ledger', gateAccounting, asyncHandler(downloadAccountLedger));
reportsRouter.get('/download/profit-loss', gateAccounting, asyncHandler(downloadProfitLoss));
reportsRouter.get('/download/balance-sheet', gateAccounting, asyncHandler(downloadBalanceSheet));
reportsRouter.get('/download/schedule-112a', gateTax, asyncHandler(downloadSchedule112A));
reportsRouter.get('/download/mf-capital-gain', gateTax, asyncHandler(downloadMFCapitalGain));
reportsRouter.get('/download/daily-transactions', gateTax, asyncHandler(downloadDailyTransactions));
reportsRouter.get('/download/short-long-spec', gateTax, asyncHandler(downloadShortLongSpec));
reportsRouter.get('/download/income-report', gateTax, asyncHandler(downloadIncomeReport));
reportsRouter.get('/download/holdings-summary', asyncHandler(downloadHoldingsSummary));
reportsRouter.get('/download/performance', gateTax, asyncHandler(downloadPerformance));
reportsRouter.get('/download/tax-summary', gateTax, asyncHandler(downloadTaxSummary));
reportsRouter.get('/download/cash-flow', asyncHandler(downloadCashFlow));
reportsRouter.get(
  '/download/combined-realised-unrealised',
  gateTax,
  asyncHandler(downloadCombinedRealisedUnrealised),
);
reportsRouter.get('/download/family-wise-holdings', gateTax, asyncHandler(downloadFamilyWiseHoldings));
reportsRouter.get('/download/scriptwise-qtywise', gateTax, asyncHandler(downloadScriptwiseQtywise));
reportsRouter.get('/download/contract-note-charges', gateTax, asyncHandler(downloadContractNoteCharges));
reportsRouter.get('/download/mf-m2m', gateTax, asyncHandler(downloadMfM2M));
reportsRouter.get('/download/financial-ledger', gateTax, asyncHandler(downloadFinancialLedger));
reportsRouter.get('/download/closing-balance', gateTax, asyncHandler(downloadClosingBalance));
reportsRouter.get('/download/top-holdings', gateTax, asyncHandler(downloadTopHoldings));
reportsRouter.get('/download/sector-allocation', gateTax, asyncHandler(downloadSectorAllocation));
reportsRouter.get('/download/contract-notes-summary', gateTax, asyncHandler(downloadContractNotesSummary));
reportsRouter.get('/download/brokerwise-capital-gain', gateTax, asyncHandler(downloadBrokerwiseCapitalGain));
reportsRouter.get('/download/tax-pnl', gateTax, asyncHandler(downloadTaxPnL));
reportsRouter.get('/download/stt-10db', gateTax, asyncHandler(downloadStt10Db));
reportsRouter.get('/download/capital-gains-fifo', gateTax, asyncHandler(downloadCapitalGainsFifo));
reportsRouter.get('/download/advance-tax-summary', gateTax, asyncHandler(downloadAdvanceTaxSummary));
reportsRouter.get('/download/opening-stock', gateTax, asyncHandler(downloadOpeningStock));
reportsRouter.get('/download/holding-period-return', gateTax, asyncHandler(downloadHoldingPeriodReturn));
reportsRouter.get('/download/script-ledger', gateTax, asyncHandler(downloadScriptLedger));
reportsRouter.get('/download/chart-of-accounts', gateAccounting, asyncHandler(downloadChartOfAccounts));
reportsRouter.get('/download/fund-flow', gateTax, asyncHandler(downloadFundFlow));
reportsRouter.get(
  '/download/broker-bill-register-fmwise',
  gateTax,
  asyncHandler(downloadBrokerBillRegister),
);
reportsRouter.get('/download/portfolio-snapshot', gateTax, asyncHandler(downloadPortfolioSnapshot));
reportsRouter.get('/download/day-book', gateTax, asyncHandler(downloadDayBook));
reportsRouter.get('/download/dividend-report', gateTax, asyncHandler(downloadDividendReport));
reportsRouter.get('/download/bank-reconciliation', gateTax, asyncHandler(downloadBankReconciliation));
reportsRouter.get('/download/tally-masters', gateAccounting, asyncHandler(downloadTallyMasters));
reportsRouter.get('/download/tally-vouchers', gateAccounting, asyncHandler(downloadTallyVouchers));
