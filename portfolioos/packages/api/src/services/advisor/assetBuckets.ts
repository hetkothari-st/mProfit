/**
 * Maps the 39-value AssetClass enum onto the 7 advisor buckets that target
 * allocations are expressed in. Pure lookup, no DB.
 *
 * Deliberately coarse. A LARGE/MID/SMALL_CAP split would be the textbook
 * taxonomy, but StockMaster has no market-cap field, so every direct equity
 * holding would land in whichever cap bucket we guessed. An honest coarse
 * bucket beats a precise-looking wrong one when the output is advice.
 */

import type { AdvisorAssetBucketValue } from './types.js';

const BUCKET_BY_ASSET_CLASS: Record<string, AdvisorAssetBucketValue> = {
  // Domestic equity and equity-like. MUTUAL_FUND is the messy one: the enum
  // does not say whether a fund is equity or debt, so it is bucketed as equity
  // here and refined by the facts builder when MutualFundMaster.category is
  // known. See bucketForHolding.
  EQUITY: 'EQUITY_DOMESTIC',
  MUTUAL_FUND: 'EQUITY_DOMESTIC',
  ETF: 'EQUITY_DOMESTIC',
  PMS: 'EQUITY_DOMESTIC',
  AIF: 'EQUITY_DOMESTIC',

  FOREIGN_EQUITY: 'EQUITY_INTERNATIONAL',

  // Debt. Retirement vehicles (NPS/PPF/EPF) sit here because their role in an
  // allocation is the debt-like ballast they provide, whatever their internal
  // equity sleeve.
  BOND: 'DEBT',
  GOVT_BOND: 'DEBT',
  CORPORATE_BOND: 'DEBT',
  NPS: 'DEBT',
  PPF: 'DEBT',
  EPF: 'DEBT',
  NSC: 'DEBT',
  KVP: 'DEBT',
  SCSS: 'DEBT',
  SSY: 'DEBT',

  GOLD_BOND: 'GOLD',
  GOLD_ETF: 'GOLD',
  PHYSICAL_GOLD: 'GOLD',

  REAL_ESTATE: 'REAL_ASSETS',
  REIT: 'REAL_ASSETS',
  INVIT: 'REAL_ASSETS',
  PHYSICAL_SILVER: 'REAL_ASSETS',

  // Cash and near-cash: anything redeemable at short notice at ~par.
  CASH: 'CASH_EQUIVALENT',
  FIXED_DEPOSIT: 'CASH_EQUIVALENT',
  RECURRING_DEPOSIT: 'CASH_EQUIVALENT',
  POST_OFFICE_SAVINGS: 'CASH_EQUIVALENT',
  POST_OFFICE_RD: 'CASH_EQUIVALENT',
  POST_OFFICE_TD: 'CASH_EQUIVALENT',
  POST_OFFICE_MIS: 'CASH_EQUIVALENT',

  // Everything whose risk does not belong in a mainstream target weight.
  // Derivatives, crypto, collectibles and insurance-linked products are held
  // for reasons a target allocation does not model, so they are reported
  // rather than rebalanced toward.
  FUTURES: 'OTHER_ALT',
  OPTIONS: 'OTHER_ALT',
  CRYPTOCURRENCY: 'OTHER_ALT',
  PRIVATE_EQUITY: 'OTHER_ALT',
  ART_COLLECTIBLES: 'OTHER_ALT',
  ULIP: 'OTHER_ALT',
  INSURANCE: 'OTHER_ALT',
  FOREX_PAIR: 'OTHER_ALT',
  OTHER: 'OTHER_ALT',
};

/** Unknown asset classes fall to OTHER_ALT rather than throwing: a new enum
 *  value added elsewhere in the app must never break advice generation. */
export function bucketForAssetClass(assetClass: string): AdvisorAssetBucketValue {
  return BUCKET_BY_ASSET_CLASS[assetClass] ?? 'OTHER_ALT';
}

/** MFCategory values that mean "this fund is debt, not equity". */
const DEBT_MF_CATEGORIES = new Set(['DEBT', 'LIQUID', 'GILT', 'MONEY_MARKET', 'OVERNIGHT']);
const GOLD_MF_CATEGORIES = new Set(['GOLD']);

/**
 * Bucket a holding, refining MUTUAL_FUND by the scheme's own category when the
 * master row is available. Without this a liquid fund would be counted as
 * equity, which inverts the drift on any portfolio holding one.
 */
export function bucketForHolding(input: {
  assetClass: string;
  mfCategory?: string | null;
}): AdvisorAssetBucketValue {
  if (input.assetClass === 'MUTUAL_FUND' && input.mfCategory) {
    if (DEBT_MF_CATEGORIES.has(input.mfCategory)) return 'DEBT';
    if (GOLD_MF_CATEGORIES.has(input.mfCategory)) return 'GOLD';
  }
  return bucketForAssetClass(input.assetClass);
}

/** Buckets an advisor will actively recommend buying into. OTHER_ALT and
 *  REAL_ASSETS are excluded: neither is sensibly funded by a market order. */
export const INVESTABLE_BUCKETS: AdvisorAssetBucketValue[] = [
  'EQUITY_DOMESTIC',
  'EQUITY_INTERNATIONAL',
  'DEBT',
  'GOLD',
  'CASH_EQUIVALENT',
];
