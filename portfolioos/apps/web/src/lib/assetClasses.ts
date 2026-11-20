/**
 * Full AssetClass enum list — authoritative mirror of the Prisma
 * `AssetClass` enum in `packages/api/prisma/schema.prisma`. Kept
 * inline here (not imported from @prisma/client) because that package
 * is API-only and the web app can't depend on it.
 *
 * Keep in sync with the enum. `check-asset-class-sync` script (future)
 * could diff this against the schema at CI-time. Missing entries here
 * would silently make some asset classes un-toggleable in the family
 * permissions UI, so err on the side of over-inclusion.
 */
export const ALL_ASSET_CLASSES = [
  'EQUITY',
  'FUTURES',
  'OPTIONS',
  'MUTUAL_FUND',
  'ETF',
  'BOND',
  'GOVT_BOND',
  'CORPORATE_BOND',
  'FIXED_DEPOSIT',
  'RECURRING_DEPOSIT',
  'NPS',
  'PPF',
  'EPF',
  'PMS',
  'AIF',
  'REIT',
  'INVIT',
  'GOLD_BOND',
  'GOLD_ETF',
  'PHYSICAL_GOLD',
  'PHYSICAL_SILVER',
  'ULIP',
  'INSURANCE',
  'REAL_ESTATE',
  'PRIVATE_EQUITY',
  'CRYPTOCURRENCY',
  'ART_COLLECTIBLES',
  'CASH',
  'OTHER',
  'NSC',
  'KVP',
  'SCSS',
  'SSY',
  'POST_OFFICE_MIS',
  'POST_OFFICE_RD',
  'POST_OFFICE_TD',
  'POST_OFFICE_SAVINGS',
  'FOREIGN_EQUITY',
  'FOREX_PAIR',
] as const;

export type AssetClassToken = (typeof ALL_ASSET_CLASSES)[number];

/** Display labels for asset classes, mirrors dashboard.service ASSET_CLASS_LABELS. */
export const ASSET_CLASS_LABEL: Record<AssetClassToken, string> = {
  EQUITY: 'Equity',
  FUTURES: 'Futures',
  OPTIONS: 'Options',
  MUTUAL_FUND: 'Mutual Fund',
  ETF: 'ETF',
  BOND: 'Bond',
  GOVT_BOND: 'Govt Bond',
  CORPORATE_BOND: 'Corp Bond',
  FIXED_DEPOSIT: 'Fixed Deposit',
  RECURRING_DEPOSIT: 'Recurring Deposit',
  NPS: 'NPS',
  PPF: 'PPF',
  EPF: 'EPF',
  PMS: 'PMS',
  AIF: 'AIF',
  REIT: 'REIT',
  INVIT: 'InvIT',
  GOLD_BOND: 'Gold Bond',
  GOLD_ETF: 'Gold ETF',
  PHYSICAL_GOLD: 'Physical Gold',
  PHYSICAL_SILVER: 'Physical Silver',
  ULIP: 'ULIP',
  INSURANCE: 'Insurance',
  REAL_ESTATE: 'Real Estate',
  PRIVATE_EQUITY: 'Private Equity',
  CRYPTOCURRENCY: 'Cryptocurrency',
  ART_COLLECTIBLES: 'Art & Collectibles',
  CASH: 'Cash',
  OTHER: 'Other',
  NSC: 'NSC',
  KVP: 'KVP',
  SCSS: 'SCSS',
  SSY: 'SSY',
  POST_OFFICE_MIS: 'PO MIS',
  POST_OFFICE_RD: 'PO RD',
  POST_OFFICE_TD: 'PO TD',
  POST_OFFICE_SAVINGS: 'PO Savings',
  FOREIGN_EQUITY: 'Foreign Equity',
  FOREX_PAIR: 'FX Pair',
};

export const NON_AC_CATEGORY_LABEL: Record<string, string> = {
  VEHICLE: 'Vehicles',
  RENTAL: 'Rental property',
  INSURANCE: 'Insurance policies',
  LOAN: 'Loans',
  CREDIT_CARD: 'Credit cards',
  BANK_ACCOUNT: 'Bank accounts',
  OWNED_PROPERTY: 'Owned properties',
  GOAL: 'Goals',
};
