import type { MclrTenor, RateBasis, RateLoanType } from '@everypaisa/shared';

export type { MclrTenor, RateBasis, RateLoanType };

/** What a LoanRateSource carries: a loan product, or a benchmark series. */
export type SourceLoanType = RateLoanType | 'MCLR' | 'REPO';

/** One rate read off one page for one source. Rates are decimal strings ("8.50"), never numbers. */
export interface RateReading {
  sourceId: string;
  basis: RateBasis;
  /** MCLR tenor for MCLR sources; null for products and the repo rate. */
  tenor: MclrTenor | null;
  minRatePct: string;
  maxRatePct: string | null;
  /** 'YYYY-MM-DD' when the page states an as-of / w.e.f. date for this figure. */
  effectiveDate: string | null;
  note?: string;
}

/**
 * Reads one fixed page (spec s5.2). `read` is pure: no I/O, no clock, never executes page scripts. A page can
 * feed several sources (SBI's MCLR page also carries the headline widget; Kotak's loans table has six
 * products), so readings name their sourceId.
 */
export interface PageReader {
  id: string;
  version: string;
  url: string;
  read(html: string): RateReading[];
}
