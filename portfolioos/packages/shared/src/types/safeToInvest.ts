/**
 * API shapes for /api/safe-to-invest. Money is a 4 dp string (serializeMoney);
 * shares and scores are plain numbers or fraction strings as noted.
 */

/** Where the lean-month income came from. */
export type SafeToInvestBasis = 'BANK' | 'DECLARED' | 'NONE';

export interface SafeToInvestMonthView {
  /** 'YYYY-MM' (IST calendar month). */
  month: string;
  /** Income counted for the month, or null when there is no data (a gap, never ₹0). */
  inflow: string | null;
  /** BANK = from bank alerts, OVERRIDE = typed by the user, GAP = no data. */
  source: 'BANK' | 'OVERRIDE' | 'GAP';
  /** True when this month is below the lean-month line. */
  lean: boolean;
  /** Credits seen in the month and how many were counted as income. */
  creditCount: number;
  includedCount: number;
}

export interface SafeToInvestFixedItem {
  label: string;
  /** Where it came from: 'loan' | 'insurance' | 'property' | 'expense'. */
  kind: 'loan' | 'insurance' | 'property' | 'expense';
  monthly: string;
}

export interface SafeToInvestSummary {
  /** The SIP the user can sustain every month, rounded down to ₹500. Null without income data. */
  safeAmount: string | null;
  basis: SafeToInvestBasis;
  /** Months of bank income used (gaps excluded). */
  monthsUsed: number;
  /** Twelve complete months, oldest first. */
  months: SafeToInvestMonthView[];
  /** 20th-percentile month (or the trimmed declared income). */
  leanInflow: string | null;
  /** Median month, for the stability score's denominator. */
  typicalInflow: string | null;
  /** 0–100: lean month as a share of a typical month. Null below 6 months of data. */
  stabilityScore: number | null;
  stabilityLabel: 'STABLE' | 'SOMEWHAT_VARIABLE' | 'VARIABLE' | null;
  fixed: { total: string; items: SafeToInvestFixedItem[] };
  buffer: {
    monthly: string;
    /** DEBITS = worked out from card/UPI/NEFT spend; OVERRIDE = typed; ESTIMATE = a share of income. */
    source: 'DEBITS' | 'OVERRIDE' | 'ESTIMATE';
  };
  /** What the user invests in SIPs today, monthly. */
  currentSip: { monthly: string | null; source: 'PLANS' | 'TRANSACTIONS' | 'NONE'; missedMonths: number };
  /** The month in progress: income so far and the suggested top-up. */
  thisMonth: { month: string; inflowSoFar: string; surplus: string; topUp: string };
  /**
   * Why bank data may be missing, so the page can say what to do next:
   * connect Gmail, add bank senders, approve waiting alerts.
   */
  /**
   * SPENDING: income and spending come from the categorised spending store
   * (the user agreed to the spending notice), the same data Personal
   * Inflation uses. ALERTS: worked out from bank alerts directly.
   */
  dataSource: 'SPENDING' | 'ALERTS';
  dataStatus: {
    gmailConnected: boolean;
    monitoredSenders: number;
    /** Bank credits/debits from the window still waiting for the user's approval. */
    awaitingReview: number;
    /** Bank alerts set aside unread because the monthly AI budget ran out. */
    overBudget: number;
  };
  plan: {
    /** Fraction string, e.g. '0.5000'. */
    topUpShare: string;
    bufferOverride: string | null;
    savedAmount: string | null;
    savedAt: string | null;
  };
}

export interface SafeToInvestCreditView {
  id: string;
  date: string;
  amount: string;
  counterparty: string | null;
  /** What the classifier decided before any user override. */
  autoInclude: boolean;
  /** Why it was left out automatically, or null when counted. */
  autoReason: string | null;
  /** The user's override, or null when they have not touched it. */
  decision: boolean | null;
  included: boolean;
}
