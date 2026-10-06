/**
 * Capital-gains tax rules as data. Every rate, exemption, holding period and
 * cut-off date used by the capital-gains engine and the tax reports lives here,
 * so a Finance Act change is an edit to this table (a new rule set with its
 * effective date), not a hunt through calculation code.
 *
 * Sources: Income-tax Act 1961 — sec 2(42A) (holding periods), 48 (indexation),
 * 50AA (specified mutual funds), 55(2)(ac) (grandfathering), 111A, 112, 112A,
 * 115BBH (virtual digital assets); Finance (No. 2) Act 2024 for transfers on or
 * after 23-Jul-2024.
 */

export interface CapitalGainsRuleSet {
  /** First transfer date (inclusive, YYYY-MM-DD) this rule set applies to. */
  effectiveFrom: string;
  /** Tax rates in percent. */
  ratesPct: {
    /** Sec 111A: STCG on listed equity, equity-oriented fund and business-trust units. */
    stcgListedEquity: number;
    /** Sec 112A: LTCG on the same assets, above the annual exemption. */
    ltcgListedEquity: number;
    /** Sec 112 with indexation. */
    ltcgIndexed: number;
    /** Sec 112 without indexation (other assets). */
    ltcgWithoutIndexation: number;
    /** Sec 112 proviso: listed securities (e.g. bonds) without indexation. */
    ltcgListedWithoutIndexation: number;
    /** Sec 115BBH: virtual digital assets. */
    virtualDigitalAsset: number;
  };
  /** An asset is long-term when held for MORE than this many months. */
  longTermAfterMonths: {
    listedEquity: number; // listed shares, equity-oriented fund units, ETFs
    businessTrustUnits: number; // listed REIT / InvIT units
    listedSecurities: number; // listed bonds, debentures, SGBs
    unlistedShares: number; // unlisted and foreign shares, private equity
    immovableProperty: number;
    nonEquityFundUnits: number; // debt / gold fund units that are not "specified"
    other: number; // physical gold, art, other capital assets
  };
  /** Whether indexation (sec 48) is available for eligible assets. */
  indexationAvailable: boolean;
}

export const CAPITAL_GAINS_RULE_SETS: readonly CapitalGainsRuleSet[] = [
  {
    effectiveFrom: '2018-04-01',
    ratesPct: {
      stcgListedEquity: 15,
      ltcgListedEquity: 10,
      ltcgIndexed: 20,
      ltcgWithoutIndexation: 20,
      ltcgListedWithoutIndexation: 10,
      virtualDigitalAsset: 30,
    },
    longTermAfterMonths: {
      listedEquity: 12,
      businessTrustUnits: 36,
      listedSecurities: 12,
      unlistedShares: 24,
      immovableProperty: 24,
      nonEquityFundUnits: 36,
      other: 36,
    },
    indexationAvailable: true,
  },
  {
    effectiveFrom: '2024-07-23',
    ratesPct: {
      stcgListedEquity: 20,
      ltcgListedEquity: 12.5,
      ltcgIndexed: 20, // resident individuals/HUFs, land or building acquired before 23-Jul-2024
      ltcgWithoutIndexation: 12.5,
      ltcgListedWithoutIndexation: 12.5,
      virtualDigitalAsset: 30,
    },
    longTermAfterMonths: {
      listedEquity: 12,
      businessTrustUnits: 12,
      listedSecurities: 12,
      unlistedShares: 24,
      immovableProperty: 24,
      nonEquityFundUnits: 24,
      other: 24,
    },
    indexationAvailable: false,
  },
];

/** Sec 112A annual exemption, by the first FY it applies to. */
export const LTCG_LISTED_EQUITY_EXEMPTION: ReadonlyArray<{ fromFy: string; amount: number }> = [
  { fromFy: '2018-19', amount: 100000 },
  { fromFy: '2024-25', amount: 125000 },
];

/** Dates the rules hinge on, beyond a rule set's effective date. */
export const CAPITAL_GAINS_KEY_DATES = {
  /** Sec 55(2)(ac): equity acquired on or before this date is grandfathered at its FMV on this date. */
  grandfatheringFmvDate: '2018-01-31',
  /** Sec 112A applies to transfers from this date; before it, 10(38) exempted listed-equity LTCG. */
  listedEquityLtcgTaxableFrom: '2018-04-01',
  /** Sec 50AA: non-equity fund units acquired from this date are always short-term. */
  specifiedMutualFundFrom: '2023-04-01',
  /** From this transfer date sec 50AA covers only funds with more than 65% in debt (gold funds drop out). */
  specifiedMutualFundNarrowedFrom: '2025-04-01',
  /** Sec 50AA: unlisted bonds and debentures transferred from this date are always short-term. */
  unlistedBondsShortTermFrom: '2024-07-23',
  /** Land or building acquired before this date keeps the with-indexation option. */
  propertyIndexationChoiceAcquiredBefore: '2024-07-23',
} as const;

/**
 * Stand-in marginal rate for slab-taxed income (non-equity STCG, speculation,
 * F&O) when the user has not recorded their income-tax slab. Reports label
 * figures computed with it as estimates.
 */
export const SLAB_RATE_ESTIMATE_PCT = 30;

function isoDay(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/** The rule set in force for a transfer on `date`. */
export function capitalGainsRulesFor(date: Date | string): CapitalGainsRuleSet {
  const day = isoDay(date);
  let current = CAPITAL_GAINS_RULE_SETS[0]!;
  for (const set of CAPITAL_GAINS_RULE_SETS) {
    if (set.effectiveFrom <= day) current = set;
  }
  return current;
}

/** Sec 112A exemption for a financial year ("YYYY-YY"); 0 before it existed. */
export function listedEquityLtcgExemptionFor(financialYear: string): number {
  let amount = 0;
  for (const e of LTCG_LISTED_EQUITY_EXEMPTION) {
    if (e.fromFy <= financialYear) amount = e.amount;
  }
  return amount;
}

/** Whether `date` falls on or after a key date. */
export function isOnOrAfter(date: Date | string, keyDate: string): boolean {
  return isoDay(date) >= keyDate;
}

/**
 * Advance-tax instalments (sec 211): due date (MM-DD) and the cumulative share
 * of the year's tax payable by then.
 */
export const ADVANCE_TAX_INSTALMENTS: ReadonlyArray<{ dueMonthDay: string; cumulativePct: number }> = [
  { dueMonthDay: '06-15', cumulativePct: 15 },
  { dueMonthDay: '09-15', cumulativePct: 45 },
  { dueMonthDay: '12-15', cumulativePct: 75 },
  { dueMonthDay: '03-15', cumulativePct: 100 },
];
