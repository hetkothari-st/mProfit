/**
 * Live loan rates (EMI calculator plan 2, spec s5): the vocabulary and wire shapes shared by the API and the
 * web page. Rates are decimal strings ("8.50") on the wire, never numbers.
 */

export const RATE_LOAN_TYPES = ['HOME', 'CAR', 'TWO_WHEELER', 'PERSONAL', 'EDUCATION', 'GOLD', 'LAP', 'LAS', 'BUSINESS'] as const;
export type RateLoanType = (typeof RATE_LOAN_TYPES)[number];

export const RATE_LOAN_TYPE_LABELS: Record<RateLoanType, string> = {
  HOME: 'Home',
  CAR: 'Car',
  TWO_WHEELER: 'Two-wheeler',
  PERSONAL: 'Personal',
  EDUCATION: 'Education',
  GOLD: 'Gold',
  LAP: 'Loan against property',
  LAS: 'Loan against securities',
  BUSINESS: 'Business',
};

export const RATE_BASES = ['REPO_LINKED', 'MCLR', 'FIXED', 'OTHER'] as const;
export type RateBasis = (typeof RATE_BASES)[number];

export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  REPO_LINKED: 'Repo-linked',
  MCLR: 'MCLR',
  FIXED: 'Fixed',
  OTHER: 'Other',
};

export const MCLR_TENORS = ['ON', '1M', '3M', '6M', '1Y'] as const;
export type MclrTenor = (typeof MCLR_TENORS)[number];

export const MCLR_TENOR_LABELS: Record<MclrTenor, string> = {
  ON: 'Overnight',
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  '1Y': '1 year',
};

export type RateOrigin = 'AUTO' | 'MANUAL';
export type RateStatus = 'ACTIVE' | 'SUSPECT' | 'REJECTED' | 'SUPERSEDED';
export type RateSourceMode = 'AUTO' | 'MANUAL';

export function isRateLoanType(value: unknown): value is RateLoanType {
  return typeof value === 'string' && (RATE_LOAN_TYPES as readonly string[]).includes(value);
}

/** One lender's effective rate for one loan type (GET /api/loan-rates). */
export interface LoanRateRowWire {
  sourceId: string;
  lender: string;
  loanType: RateLoanType;
  basis: RateBasis;
  minRatePct: string;
  maxRatePct: string | null;
  /** 'YYYY-MM-DD' as stated on the lender page, when it states one. */
  effectiveDate: string | null;
  /** ISO instant: last successful read (AUTO) or when the admin entered it (MANUAL). */
  asOf: string;
  stale: boolean;
  sourceUrl: string;
  origin: RateOrigin;
}

export interface RepoRateWire {
  ratePct: string;
  effectiveDate: string;
  /** Null until a second, different repo rate has been recorded. deltaPct is signed: "-0.25" is a cut. */
  lastChange: { deltaPct: string; date: string } | null;
}

export interface LoanRatesWire {
  loanType: RateLoanType;
  rows: LoanRateRowWire[];
  repo: RepoRateWire | null;
}

export interface LoanRateReadingWire {
  id: string;
  sourceId: string;
  basis: RateBasis;
  tenor: MclrTenor | null;
  minRatePct: string;
  maxRatePct: string | null;
  effectiveDate: string | null;
  fetchedAt: string;
  origin: RateOrigin;
  status: RateStatus;
  note: string | null;
  sourceAdapter: string | null;
  sourceAdapterVer: string | null;
}

/** One (source, tenor) as the admin sees it. Products have a single key with tenor null. */
export interface AdminRateKeyWire {
  tenor: MclrTenor | null;
  effective: LoanRateReadingWire | null;
  latestAuto: LoanRateReadingWire | null;
  manual: LoanRateReadingWire | null;
  /** A MANUAL override is active and the latest AUTO reading says something else. */
  differs: boolean;
}

export interface AdminLoanRateSourceWire {
  id: string;
  lender: string;
  /** A RateLoanType, or 'MCLR' / 'REPO'. */
  loanType: string;
  url: string;
  mode: RateSourceMode;
  adapter: string | null;
  adapterVer: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  stale: boolean;
  keys: AdminRateKeyWire[];
  suspects: LoanRateReadingWire[];
}

export interface ManualRateInputWire {
  basis: RateBasis;
  tenor?: MclrTenor | null;
  minRatePct: string;
  maxRatePct?: string | null;
  effectiveDate?: string | null;
  note: string;
}
