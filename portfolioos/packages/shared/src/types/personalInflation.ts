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
  /** Counted as a fixed monthly cost by Safe-to-Invest (rent, school fees). */
  isFixed: boolean;
  /** False for loan EMIs and life-cover premiums: listed, but left out of the rate and totals. */
  inBasket: boolean;
  /**
   * A recurring bank payment already covers this item ("already in your bank
   * data"), so it is left out of the rate while the bank picture is in use.
   * The item itself is never changed; countAnyway brings it back.
   */
  coveredByBank: boolean;
  countAnyway: boolean;
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
  /** Spend-weighted rate across the basket (fraction), or null if empty/unrated. Basket = items with inBasket. */
  personalRate: string | null;
  horizons: number[];
  totals: { annualAmount: string; projections: string[] };
  /** Basket spend by category; shares are of basket spend. */
  byDivision: { divisionCode: string; annualAmount: string; share: string; rate: string | null }[];
  /** EMIs and life-cover premiums left out of the basket, or null when there are none. */
  fixedPayments: { annualAmount: string; count: number } | null;
  /** Where personalRate comes from: the user's own entries, or bank spending plus entries the bank does not show. */
  rateBasis: 'manual' | 'bank';
  /** The bank-spending picture, or null without consent or without bank spending in the last 12 months. */
  bank: PirBankView | null;
  spendingConsent: SpendingConsentView;
}

/** Bump when the consent notice's wording changes: everyone is asked again. */
export const SPENDING_CONSENT_VERSION = '2026-11-06';

export interface SpendingConsentView {
  given: boolean;
  /** When the user agreed (ISO), or null. */
  givenAt: string | null;
  /** True when bank alerts exist that this page could use, and the user has not agreed yet. */
  askNow: boolean;
  version: string;
  /** "Name, email" of the grievance officer, or null until it is set (AppSetting privacy.grievance_contact). */
  grievanceContact: string | null;
  /** The AI provider's zero data retention is confirmed for this deployment. */
  aiZeroRetention: boolean;
}

/**
 * ready: confidence reached the bar; the rate uses bank spending.
 * low_confidence: not yet, so the rate stays on the user's own entries.
 * building: not yet, and there are no entries to fall back on.
 */
export type PirBankState = 'ready' | 'low_confidence' | 'building';

export interface PirBankCategoryView {
  /** Spend category, e.g. 'rent' (SPEND_CATEGORY_LABELS). */
  category: string;
  divisionCode: string;
  /** Spend over the months seen, scaled to a year. */
  annualAmount: string;
  /** Share of bank basket spend. */
  share: string;
  cpiRate: string | null;
  /** The user's own price change from fixed payments seen in both years. */
  ownRate: string | null;
  /** Share of the category's spend those fixed payments cover (0–1). */
  alpha: string;
  rate: string | null;
  method: 'cpi' | 'own_price' | 'blend';
  /** Projected annual cost at each of `horizons`, or null when unrated. */
  projections: (string | null)[];
}

export interface PirBankView {
  state: PirBankState;
  /** 0–1, at 4 dp. */
  confidence: string;
  minConfidence: string;
  monthsOfHistory: number;
  windowMonths: number;
  categorisedShare: string;
  /** 1 when a salary account is visible, else lower. */
  accountCoverage: string;
  /** Card bills counted as other spending because no card purchases were seen. */
  cardBillsCounted: boolean;
  /** Cash withdrawals are over 15% of debits: the rate may miss cash spending. */
  cashHeavy: boolean;
  categories: PirBankCategoryView[];
  /** Fixed payments that jumped (> +25% or < −10%): CPI is used until the user confirms it was a real rise. */
  stepChanges: { seriesId: string; payeeKey: string; category: string; rate: string }[];
  /** Rate from bank spending alone (fraction), or null when nothing is rated. */
  bankRate: string | null;
}

export interface InflationItemInput {
  name: string;
  divisionCode: string;
  amount: string;
  frequency?: InflationAmountFrequency;
  rateMode?: InflationRateMode;
  customRate?: string | null;
  notes?: string | null;
  isFixed?: boolean;
  /** Count the item even though a recurring bank payment matches it. */
  countAnyway?: boolean;
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
  /** Extra monthly SIP (paid at the start of each month) to cover a positive gap at assumedReturn. */
  extraMonthlySip: string | null;
  /** Yearly return the SIP assumes (fraction): the goal's own, else 12%. */
  assumedReturn: string;
  /** True when assumedReturn is the 12% default because the goal has none. */
  returnIsDefault: boolean;
  rateInUse: boolean;
}

export interface InflationGoalsView {
  /** False when the user's plan does not include goals. */
  available: boolean;
  goals: InflationGoalImpact[];
}
