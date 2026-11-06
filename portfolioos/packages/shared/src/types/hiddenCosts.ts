/**
 * Hidden Cost X-ray: every rupee lost in a year to fees, commissions and
 * charges deducted without a bill, by source, and what it compounds to.
 * Money is a 2-decimal string.
 */

export type HiddenCostKey =
  | 'REGULAR_COMMISSION'
  | 'FUND_RUNNING_COST'
  | 'TRADING_CHARGES'
  | 'TRADE_TAXES'
  | 'BANK_CARD_CHARGES'
  | 'ULIP_CHARGES'
  | 'PMS_FEES'
  | 'EXIT_LOADS';

export interface HiddenCostSource {
  key: HiddenCostKey;
  label: string;
  /** The yearly amount. */
  amountInr: string;
  /** One short line: what is behind the figure ("6 funds · switchable to Direct"). */
  detail: string;
  /** DATA: from the user's own records. ESTIMATE: from a stated typical rate. */
  basis: 'DATA' | 'ESTIMATE';
  /** The rate or rule an estimate uses, shown beside it. Null for DATA. */
  estimateNote: string | null;
  /** Part of what the user can stop paying (counts in the "cut" amount). */
  cuttable: boolean;
  /** A tax or levy that cannot be avoided; shown, never in the "cut" amount. */
  unavoidable: boolean;
}

export interface HiddenCostsView {
  asOf: string;
  /** Sum of every source. */
  totalInr: string;
  /** The part of the total that is estimated. */
  estimatedInr: string;
  /** What the user can stop paying: regular-plan commissions, bank and card charges. */
  cuttableInr: string;
  compound: { years: number; ratePct: number; valueInr: string };
  /** Largest first; sources with nothing found are left out. */
  sources: HiddenCostSource[];
  /** Funds held whose expense ratio is not published, so their cost is not counted. */
  fundsWithoutTer: number;
  /** Sections that could not be read this time (the rest is still shown). */
  unavailable: string[];
}
