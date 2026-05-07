export const UserRole = {
  INVESTOR: 'INVESTOR',
  HNI: 'HNI',
  FAMILY_OFFICE: 'FAMILY_OFFICE',
  ADVISOR: 'ADVISOR',
  CA: 'CA',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const PlanTier = {
  FREE: 'FREE',
  LITE: 'LITE',
  PLUS: 'PLUS',
  HNI: 'HNI',
  FAMILY_OFFICE: 'FAMILY_OFFICE',
  ADVISOR: 'ADVISOR',
} as const;
export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

export const PortfolioType = {
  INVESTMENT: 'INVESTMENT',
  TRADING: 'TRADING',
  GOAL: 'GOAL',
  STRATEGY: 'STRATEGY',
} as const;
export type PortfolioType = (typeof PortfolioType)[keyof typeof PortfolioType];

export const Exchange = {
  BSE: 'BSE',
  NSE: 'NSE',
  MCX: 'MCX',
  NFO: 'NFO',
  BFO: 'BFO',
} as const;
export type Exchange = (typeof Exchange)[keyof typeof Exchange];

export const AssetClass = {
  EQUITY: 'EQUITY',
  FUTURES: 'FUTURES',
  OPTIONS: 'OPTIONS',
  MUTUAL_FUND: 'MUTUAL_FUND',
  ETF: 'ETF',
  BOND: 'BOND',
  GOVT_BOND: 'GOVT_BOND',
  CORPORATE_BOND: 'CORPORATE_BOND',
  FIXED_DEPOSIT: 'FIXED_DEPOSIT',
  RECURRING_DEPOSIT: 'RECURRING_DEPOSIT',
  NPS: 'NPS',
  PPF: 'PPF',
  EPF: 'EPF',
  PMS: 'PMS',
  AIF: 'AIF',
  REIT: 'REIT',
  INVIT: 'INVIT',
  GOLD_BOND: 'GOLD_BOND',
  GOLD_ETF: 'GOLD_ETF',
  PHYSICAL_GOLD: 'PHYSICAL_GOLD',
  PHYSICAL_SILVER: 'PHYSICAL_SILVER',
  ULIP: 'ULIP',
  INSURANCE: 'INSURANCE',
  REAL_ESTATE: 'REAL_ESTATE',
  PRIVATE_EQUITY: 'PRIVATE_EQUITY',
  CRYPTOCURRENCY: 'CRYPTOCURRENCY',
  ART_COLLECTIBLES: 'ART_COLLECTIBLES',
  CASH: 'CASH',
  OTHER: 'OTHER',
  NSC: 'NSC',
  KVP: 'KVP',
  SCSS: 'SCSS',
  SSY: 'SSY',
  POST_OFFICE_MIS: 'POST_OFFICE_MIS',
  POST_OFFICE_RD: 'POST_OFFICE_RD',
  POST_OFFICE_TD: 'POST_OFFICE_TD',
  POST_OFFICE_SAVINGS: 'POST_OFFICE_SAVINGS',
} as const;
export type AssetClass = (typeof AssetClass)[keyof typeof AssetClass];

export const TransactionType = {
  BUY: 'BUY',
  SELL: 'SELL',
  SWITCH_IN: 'SWITCH_IN',
  SWITCH_OUT: 'SWITCH_OUT',
  SIP: 'SIP',
  DIVIDEND_REINVEST: 'DIVIDEND_REINVEST',
  DIVIDEND_PAYOUT: 'DIVIDEND_PAYOUT',
  BONUS: 'BONUS',
  SPLIT: 'SPLIT',
  MERGER_IN: 'MERGER_IN',
  MERGER_OUT: 'MERGER_OUT',
  DEMERGER_IN: 'DEMERGER_IN',
  DEMERGER_OUT: 'DEMERGER_OUT',
  RIGHTS_ISSUE: 'RIGHTS_ISSUE',
  INTEREST_RECEIVED: 'INTEREST_RECEIVED',
  MATURITY: 'MATURITY',
  REDEMPTION: 'REDEMPTION',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  OPENING_BALANCE: 'OPENING_BALANCE',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const CapitalGainType = {
  INTRADAY: 'INTRADAY',
  SHORT_TERM: 'SHORT_TERM',
  LONG_TERM: 'LONG_TERM',
} as const;
export type CapitalGainType = (typeof CapitalGainType)[keyof typeof CapitalGainType];

export const ImportType = {
  CONTRACT_NOTE_PDF: 'CONTRACT_NOTE_PDF',
  CONTRACT_NOTE_EXCEL: 'CONTRACT_NOTE_EXCEL',
  CONTRACT_NOTE_HTML: 'CONTRACT_NOTE_HTML',
  MF_CAS_PDF: 'MF_CAS_PDF',
  MF_CAS_EXCEL: 'MF_CAS_EXCEL',
  BACK_OFFICE_CSV: 'BACK_OFFICE_CSV',
  BANK_STATEMENT_PDF: 'BANK_STATEMENT_PDF',
  BANK_STATEMENT_CSV: 'BANK_STATEMENT_CSV',
  NPS_STATEMENT: 'NPS_STATEMENT',
  GENERIC_CSV: 'GENERIC_CSV',
  GENERIC_EXCEL: 'GENERIC_EXCEL',
} as const;
export type ImportType = (typeof ImportType)[keyof typeof ImportType];

export const ImportStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_ERRORS: 'COMPLETED_WITH_ERRORS',
  FAILED: 'FAILED',
  NEEDS_PASSWORD: 'NEEDS_PASSWORD',
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const AlertType = {
  FD_MATURITY: 'FD_MATURITY',
  BOND_MATURITY: 'BOND_MATURITY',
  MF_LOCK_IN_EXPIRY: 'MF_LOCK_IN_EXPIRY',
  SIP_DUE: 'SIP_DUE',
  INSURANCE_PREMIUM: 'INSURANCE_PREMIUM',
  DIVIDEND_RECEIVED: 'DIVIDEND_RECEIVED',
  CORPORATE_ACTION: 'CORPORATE_ACTION',
  PRICE_TARGET: 'PRICE_TARGET',
  LOAN_EMI_DUE: 'LOAN_EMI_DUE',
  CREDIT_CARD_DUE: 'CREDIT_CARD_DUE',
  PROPERTY_TAX_DUE: 'PROPERTY_TAX_DUE',
  PROPERTY_POSSESSION_DUE: 'PROPERTY_POSSESSION_DUE',
  CUSTOM: 'CUSTOM',
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];
