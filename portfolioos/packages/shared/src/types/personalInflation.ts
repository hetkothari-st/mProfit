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
  /** Set when the item was added from the user's own data, e.g. 'loan:<id>'. */
  sourceRef: string | null;
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
  /** Priced spend by category; fixed payments are left out (see fixedPayments). Shares are of all spend. */
  byDivision: { divisionCode: string; annualAmount: string; share: string; rate: string | null }[];
  /** Payments pinned at 0% (EMIs, level life premiums), or null when there are none. */
  fixedPayments: { annualAmount: string; share: string } | null;
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

/** Something the user already tracks elsewhere in the app that could join the basket. */
export interface InflationSourceCandidate {
  /** 'loan:<id>' | 'insurance:<id>' | 'property:<id>' — stable, so re-imports are skipped. */
  sourceRef: string;
  kind: 'LOAN' | 'INSURANCE' | 'PROPERTY';
  name: string;
  /** Short context line, e.g. "HDFC Bank · home loan". */
  detail: string;
  divisionCode: string;
  amount: string;
  frequency: InflationAmountFrequency;
  rateMode: InflationRateMode;
  customRate: string | null;
  /** Why the rate is what it is (e.g. EMIs are fixed), or null. */
  note: string | null;
  alreadyAdded: boolean;
}

export interface InflationGoalImpact {
  goalId: string;
  name: string;
  category: string;
  targetDate: string;
  yearsRemaining: number;
  /** The goal's target in today's rupees. */
  targetToday: string;
  /** Rate the goal uses now (fraction, 4 dp), or null when none is set. */
  currentRate: string | null;
  /** Rate this page suggests (fraction, 4 dp), or null without CPI data. */
  suggestedRate: string | null;
  suggestedLabel: string | null;
  officialRate: string | null;
  neededAtSuggested: string | null;
  neededAtOfficial: string | null;
  /** neededAtSuggested − neededAtOfficial; negative when the user's rate is lower. */
  gap: string | null;
  /** Extra monthly SIP to cover a positive gap at the goal's expected return. */
  extraMonthlySip: string | null;
  rateInUse: boolean;
}

export interface InflationGoalsView {
  /** False when the user's plan does not include goals. */
  available: boolean;
  goals: InflationGoalImpact[];
}
