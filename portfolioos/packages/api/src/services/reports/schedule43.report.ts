import { Decimal } from 'decimal.js';
import { computeUserFoPnl, computePortfolioFoPnl } from '../foPnl.service.js';

/**
 * Schedule 43 / ITR-3 Schedule BP — F&O business income report.
 *
 * Income Tax Act §43(5):
 *   - F&O futures + options on indexes/stocks are NON-SPECULATIVE business
 *     income (no FIFO, net P&L per asset).
 *   - Tax audit (§44AB): turnover > ₹10Cr (₹3Cr if 95%+ digital).
 *
 * Report fields per FY:
 *   gross profit, gross loss, net P&L, turnover (ICAI 2022 method),
 *   trade count, audit-applicable flag.
 */
export interface Schedule43Report {
  financialYear: string;
  scope: { userId: string; portfolioId?: string };
  nonSpeculative: {
    grossProfit: string;
    grossLoss: string;
    netPnl: string;
    turnover: string;
    tradeCount: number;
  };
  taxAuditApplicable: boolean;
  taxAuditNote: string;
  perInstrumentRows: Array<{
    underlying: string;
    instrumentType: string;
    strikePrice: string | null;
    expiryDate: string;
    side: string;
    realizedPnl: string;
    turnover: string;
    closedTradeCount: number;
  }>;
}

export async function buildSchedule43Report(
  userId: string,
  fy: string,
  portfolioId?: string,
): Promise<Schedule43Report> {
  const r = portfolioId
    ? await computePortfolioFoPnl(portfolioId)
    : await computeUserFoPnl(userId);

  const fyRows = r.rows.filter((row) => row.financialYear === fy);
  const grossProfit = fyRows.reduce(
    (acc, row) => acc.plus(new Decimal(row.totalGrossProfit)),
    new Decimal(0),
  );
  const grossLoss = fyRows.reduce(
    (acc, row) => acc.plus(new Decimal(row.totalGrossLoss)),
    new Decimal(0),
  );
  const netPnl = grossProfit.minus(grossLoss);
  const turnover = fyRows.reduce(
    (acc, row) => acc.plus(new Decimal(row.turnover)),
    new Decimal(0),
  );
  const tradeCount = fyRows.reduce((acc, row) => acc + row.closedTradeCount, 0);

  // §44AB tax audit: turnover > ₹10Cr (₹1Cr default; ₹10Cr if 95%+ digital
  // — F&O is always digital, so the ₹10Cr cap applies). We surface the flag
  // and let the user confirm 95% digital threshold.
  const taxAuditApplicable = turnover.greaterThan(new Decimal('100000000')); // 10 Cr
  const taxAuditNote = taxAuditApplicable
    ? 'Turnover exceeds ₹10 Cr — §44AB tax audit applicable. Consult a CA.'
    : 'Turnover within §44AB threshold (₹10 Cr for ≥95% digital transactions).';

  return {
    financialYear: fy,
    scope: { userId, portfolioId },
    nonSpeculative: {
      grossProfit: grossProfit.toString(),
      grossLoss: grossLoss.toString(),
      netPnl: netPnl.toString(),
      turnover: turnover.toString(),
      tradeCount,
    },
    taxAuditApplicable,
    taxAuditNote,
    perInstrumentRows: fyRows.map((row) => ({
      underlying: row.underlying,
      instrumentType: row.instrumentType,
      strikePrice: row.strikePrice,
      expiryDate: row.expiryDate,
      side: row.side,
      realizedPnl: row.realizedPnl,
      turnover: row.turnover,
      closedTradeCount: row.closedTradeCount,
    })),
  };
}
