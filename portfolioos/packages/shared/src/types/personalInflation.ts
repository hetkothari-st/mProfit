import type { CpiSector } from '../finance/cpi.js';

/**
 * API shapes for /api/personal-inflation. Money and rates are strings:
 * money at 4 dp (serializeMoney), rates as fractions at 6 dp (0.150000 = 15%).
 */

export type InflationRateMode = 'OFFICIAL' | 'CUSTOM' | 'HISTORY';
export type InflationAmountFrequency = 'MONTHLY' | 'YEARLY';
export type InflationRateSource = 'OFFICIAL' | 'CUSTOM' | 'HISTORY';
/** Why an item's rate is not what its mode asked for. */
export type InflationRateNote = 'insufficient_history' | 'division_unavailable' | null;

export interface OfficialDivisionRate {
  divisionCode: string;
  /** Latest month's year-on-year change (fraction), or null if not published. */
  latestYoy: string | null;
  /** Annualised over `yearsUsed` same-month readings (fraction). */
  longRunRate: string | null;
  yearsUsed: number;
  /** ALL_INDIA when the chosen state lacked this division and All India stood in. */
  source: 'STATE' | 'ALL_INDIA';
}

export interface InflationPricePointView {
  asOf: string;
  amount: string;
}

export interface InflationItemView {
  id: string;
  name: string;
  divisionCode: string;
  amount: string;
  frequency: InflationAmountFrequency;
  annualAmount: string;
  rateMode: InflationRateMode;
  customRate: string | null;
  notes: string | null;
  pricePoints: InflationPricePointView[];
  resolvedRate: string | null;
  rateSource: InflationRateSource;
  rateNote: InflationRateNote;
  /** CAGR from price points when there is enough history, whatever the mode. */
  historyRate: string | null;
  historyYears: string | null;
  /** Projected annual cost at each of `horizons`, or null when unrated. */
  projections: (string | null)[];
}

export interface PersonalInflationSummary {
  profile: { stateCode: number; sector: CpiSector };
  /** Newest CPI month on file, 'YYYY-MM', or null before the first fetch. */
  asOf: string | null;
  official: OfficialDivisionRate[];
  items: InflationItemView[];
  /** Spend-weighted rate across the basket (fraction), or null if empty/unrated. */
  personalRate: string | null;
  horizons: number[];
  totals: { annualAmount: string; projections: string[] };
  byDivision: { divisionCode: string; annualAmount: string; share: string; rate: string | null }[];
}

export interface InflationItemInput {
  name: string;
  divisionCode: string;
  amount: string;
  frequency?: InflationAmountFrequency;
  rateMode?: InflationRateMode;
  customRate?: string | null;
  notes?: string | null;
  pricePoints?: InflationPricePointView[];
}
