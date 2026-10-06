/**
 * Single source of truth for the eight India Post schemes.
 *
 * Extracted from PostOfficeFormDialog so the landing page, detail page, and
 * form dialog share the same labels, rates, ordering, and — new here — a
 * behaviour `family` that drives the detail-page layout.
 */
import type { AssetClass } from '@everypaisa/shared';

export type SchemeType =
  | 'NSC' | 'KVP' | 'SCSS' | 'SSY'
  | 'POST_OFFICE_MIS' | 'POST_OFFICE_RD' | 'POST_OFFICE_TD' | 'POST_OFFICE_SAVINGS';

/**
 * Behaviour family — controls which detail-page layout/graphs a scheme uses.
 * - LUMPSUM:   single deposit compounds to maturity (NSC, KVP, TD)
 * - RECURRING: periodic installments, corpus grows (RD, SSY)
 * - PAYOUT:    principal stays flat, interest paid out periodically (MIS, SCSS)
 * - SAVINGS:   running balance, no maturity (PO Savings)
 */
export type PoFamily = 'LUMPSUM' | 'RECURRING' | 'PAYOUT' | 'SAVINGS';

export interface SchemeConfig {
  label: string;
  fullName: string;
  assetClass: AssetClass;
  defaultRate: string;
  rateHint: string;
  txnTypes: readonly string[];
  txnLabels: Record<string, string>;
  amountLabels: Record<string, string>;
  accountLabel: string;
  accountIdLabel: string;
  accountIdPlaceholder: string;
  showMaturityDate: boolean;
  defaultMaturityYears: number | null;
  /** Detail-page behaviour family. */
  family: PoFamily;
  /** Compounding (or payout) periods per year, used by accrual math. */
  periodsPerYear: number;
  /** True when interest is paid out periodically rather than compounded. */
  payout: boolean;
}

export const SCHEMES: Record<SchemeType, SchemeConfig> = {
  NSC: {
    label: 'NSC',
    fullName: 'National Savings Certificate',
    assetClass: 'NSC' as AssetClass,
    defaultRate: '7.7',
    rateHint: 'Current rate: 7.7% p.a. (Q1 FY 2024-25), compounded annually',
    txnTypes: ['BUY', 'MATURITY'],
    txnLabels: { BUY: 'Purchase certificate', MATURITY: 'Maturity / redemption' },
    amountLabels: { BUY: 'Certificate amount (₹)', MATURITY: 'Maturity proceeds (₹)' },
    accountLabel: 'Post Office branch',
    accountIdLabel: 'Certificate number',
    accountIdPlaceholder: 'e.g. IN-MH-12345678',
    showMaturityDate: true,
    defaultMaturityYears: 5,
    family: 'LUMPSUM',
    periodsPerYear: 1,
    payout: false,
  },
  KVP: {
    label: 'KVP',
    fullName: 'Kisan Vikas Patra',
    assetClass: 'KVP' as AssetClass,
    defaultRate: '7.5',
    rateHint: 'Current rate: 7.5% p.a. (doubles in ~115 months)',
    txnTypes: ['BUY', 'MATURITY'],
    txnLabels: { BUY: 'Purchase certificate', MATURITY: 'Maturity / redemption' },
    amountLabels: { BUY: 'Face value (₹)', MATURITY: 'Maturity proceeds (₹)' },
    accountLabel: 'Post Office branch',
    accountIdLabel: 'Certificate number',
    accountIdPlaceholder: 'e.g. KVP-MH-12345678',
    showMaturityDate: true,
    defaultMaturityYears: null,
    family: 'LUMPSUM',
    periodsPerYear: 1,
    payout: false,
  },
  SCSS: {
    label: 'SCSS',
    fullName: 'Senior Citizen Savings Scheme',
    assetClass: 'SCSS' as AssetClass,
    defaultRate: '8.2',
    rateHint: 'Current rate: 8.2% p.a. (quarterly payout), 5-year term',
    txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'MATURITY', 'OPENING_BALANCE'],
    txnLabels: {
      DEPOSIT: 'Deposit / top-up',
      INTEREST_RECEIVED: 'Quarterly interest received',
      WITHDRAWAL: 'Premature withdrawal',
      MATURITY: 'Maturity proceeds',
      OPENING_BALANCE: 'Opening balance',
    },
    amountLabels: {
      DEPOSIT: 'Deposit amount (₹)',
      INTEREST_RECEIVED: 'Interest received (₹)',
      WITHDRAWAL: 'Amount withdrawn (₹)',
      MATURITY: 'Maturity proceeds (₹)',
      OPENING_BALANCE: 'Current balance (₹)',
    },
    accountLabel: 'Post Office / bank branch',
    accountIdLabel: 'Account number',
    accountIdPlaceholder: 'SCSS account number',
    showMaturityDate: true,
    defaultMaturityYears: 5,
    family: 'PAYOUT',
    periodsPerYear: 4,
    payout: true,
  },
  SSY: {
    label: 'SSY',
    fullName: 'Sukanya Samriddhi Yojana',
    assetClass: 'SSY' as AssetClass,
    defaultRate: '8.2',
    rateHint: 'Current rate: 8.2% p.a. (annual compounding), matures when girl turns 21 — enter her 21st birthday as maturity date',
    txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'MATURITY', 'OPENING_BALANCE'],
    txnLabels: {
      DEPOSIT: 'Annual deposit',
      INTEREST_RECEIVED: 'Interest credited (31 Mar)',
      WITHDRAWAL: 'Partial withdrawal (18+)',
      MATURITY: 'Maturity at age 21',
      OPENING_BALANCE: 'Opening balance',
    },
    amountLabels: {
      DEPOSIT: 'Deposit amount (₹)',
      INTEREST_RECEIVED: 'Interest credited (₹)',
      WITHDRAWAL: 'Amount withdrawn (₹)',
      MATURITY: 'Maturity proceeds (₹)',
      OPENING_BALANCE: 'Current balance (₹)',
    },
    accountLabel: 'Post Office branch',
    accountIdLabel: 'Account number',
    accountIdPlaceholder: 'SSY account number',
    showMaturityDate: true,
    defaultMaturityYears: null,
    family: 'RECURRING',
    periodsPerYear: 1,
    payout: false,
  },
  POST_OFFICE_MIS: {
    label: 'MIS',
    fullName: 'Post Office Monthly Income Scheme',
    assetClass: 'POST_OFFICE_MIS' as AssetClass,
    defaultRate: '7.4',
    rateHint: 'Current rate: 7.4% p.a. (monthly payout), 5-year term',
    txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'MATURITY', 'OPENING_BALANCE'],
    txnLabels: {
      DEPOSIT: 'Deposit',
      INTEREST_RECEIVED: 'Monthly interest received',
      WITHDRAWAL: 'Premature withdrawal',
      MATURITY: 'Maturity proceeds',
      OPENING_BALANCE: 'Opening balance',
    },
    amountLabels: {
      DEPOSIT: 'Deposit amount (₹)',
      INTEREST_RECEIVED: 'Interest received (₹)',
      WITHDRAWAL: 'Amount withdrawn (₹)',
      MATURITY: 'Maturity proceeds (₹)',
      OPENING_BALANCE: 'Current balance (₹)',
    },
    accountLabel: 'Post Office branch',
    accountIdLabel: 'Account number',
    accountIdPlaceholder: 'MIS account number',
    showMaturityDate: true,
    defaultMaturityYears: 5,
    family: 'PAYOUT',
    periodsPerYear: 12,
    payout: true,
  },
  POST_OFFICE_RD: {
    label: 'RD',
    fullName: 'Post Office Recurring Deposit',
    assetClass: 'POST_OFFICE_RD' as AssetClass,
    defaultRate: '6.7',
    rateHint: 'Current rate: 6.7% p.a. (quarterly compounding), 5-year maturity',
    txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'MATURITY', 'OPENING_BALANCE'],
    txnLabels: {
      DEPOSIT: 'Monthly installment',
      INTEREST_RECEIVED: 'Interest credited',
      MATURITY: 'Maturity proceeds',
      OPENING_BALANCE: 'Opening balance',
    },
    amountLabels: {
      DEPOSIT: 'Monthly installment (₹)',
      INTEREST_RECEIVED: 'Interest credited (₹)',
      MATURITY: 'Maturity proceeds (₹)',
      OPENING_BALANCE: 'Current balance (₹)',
    },
    accountLabel: 'Post Office branch',
    accountIdLabel: 'Account number',
    accountIdPlaceholder: 'RD account number',
    showMaturityDate: true,
    defaultMaturityYears: 5,
    family: 'RECURRING',
    periodsPerYear: 4,
    payout: false,
  },
  POST_OFFICE_TD: {
    label: 'Time Deposit',
    fullName: 'Post Office Time Deposit',
    assetClass: 'POST_OFFICE_TD' as AssetClass,
    defaultRate: '7.5',
    rateHint: 'Rates: 1yr 6.9% | 2yr 7.0% | 3yr 7.1% | 5yr 7.5% (quarterly compounding)',
    txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'MATURITY', 'OPENING_BALANCE'],
    txnLabels: {
      DEPOSIT: 'Deposit',
      INTEREST_RECEIVED: 'Interest credited',
      MATURITY: 'Maturity proceeds',
      OPENING_BALANCE: 'Opening balance',
    },
    amountLabels: {
      DEPOSIT: 'Deposit amount (₹)',
      INTEREST_RECEIVED: 'Interest credited (₹)',
      MATURITY: 'Maturity proceeds (₹)',
      OPENING_BALANCE: 'Current balance (₹)',
    },
    accountLabel: 'Post Office branch',
    accountIdLabel: 'Account number',
    accountIdPlaceholder: 'TD account number',
    showMaturityDate: true,
    defaultMaturityYears: null,
    family: 'LUMPSUM',
    periodsPerYear: 4,
    payout: false,
  },
  POST_OFFICE_SAVINGS: {
    label: 'Savings',
    fullName: 'Post Office Savings Account',
    assetClass: 'POST_OFFICE_SAVINGS' as AssetClass,
    defaultRate: '4.0',
    rateHint: 'Current rate: 4.0% p.a. (simple interest)',
    txnTypes: ['DEPOSIT', 'WITHDRAWAL', 'INTEREST_RECEIVED', 'OPENING_BALANCE'],
    txnLabels: {
      DEPOSIT: 'Deposit',
      WITHDRAWAL: 'Withdrawal',
      INTEREST_RECEIVED: 'Interest credited',
      OPENING_BALANCE: 'Opening balance',
    },
    amountLabels: {
      DEPOSIT: 'Amount deposited (₹)',
      WITHDRAWAL: 'Amount withdrawn (₹)',
      INTEREST_RECEIVED: 'Interest credited (₹)',
      OPENING_BALANCE: 'Current balance (₹)',
    },
    accountLabel: 'Post Office branch',
    accountIdLabel: 'Account number',
    accountIdPlaceholder: 'Savings account number',
    showMaturityDate: false,
    defaultMaturityYears: null,
    family: 'SAVINGS',
    periodsPerYear: 4,
    payout: false,
  },
};

export const SCHEME_ORDER: SchemeType[] = [
  'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS',
];

const PO_ASSET_CLASS_TO_SCHEME: Partial<Record<string, SchemeType>> = {
  NSC: 'NSC', KVP: 'KVP', SCSS: 'SCSS', SSY: 'SSY',
  POST_OFFICE_MIS: 'POST_OFFICE_MIS', POST_OFFICE_RD: 'POST_OFFICE_RD',
  POST_OFFICE_TD: 'POST_OFFICE_TD', POST_OFFICE_SAVINGS: 'POST_OFFICE_SAVINGS',
};

/** All PO asset classes, in display order. */
export const PO_ASSET_CLASSES: AssetClass[] = SCHEME_ORDER.map((s) => SCHEMES[s].assetClass);

export function assetClassToScheme(ac: AssetClass): SchemeType {
  const scheme = PO_ASSET_CLASS_TO_SCHEME[ac as string];
  if (!scheme) throw new Error(`Non-PO asset class: ${ac}`);
  return scheme;
}

/** Nullable lookup — returns undefined for non-PO asset classes instead of throwing. */
export function schemeForAssetClass(ac: AssetClass): SchemeType | undefined {
  return PO_ASSET_CLASS_TO_SCHEME[ac as string];
}
