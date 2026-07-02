import type { IncomeType } from '@/api/income.api';

export const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  SALARY: 'Salary',
  BUSINESS: 'Business',
  TRADING: 'Trading',
  FREELANCE: 'Freelance',
  RENTAL: 'Rental',
  INTEREST_DIVIDEND: 'Interest / Dividend',
  CAPITAL_GAINS: 'Capital Gains',
  OTHER: 'Other',
};

/** The "source" field means something different per type — label it accordingly. */
export const INCOME_TYPE_SOURCE_LABEL: Record<IncomeType, string> = {
  SALARY: 'Employer',
  BUSINESS: 'Business name',
  TRADING: 'Broker / platform',
  FREELANCE: 'Client / platform',
  RENTAL: 'Property',
  INTEREST_DIVIDEND: 'Bank / fund',
  CAPITAL_GAINS: 'Asset / broker',
  OTHER: 'Source',
};

export const INCOME_TYPE_SOURCE_PLACEHOLDER: Record<IncomeType, string> = {
  SALARY: 'e.g. Acme Corp',
  BUSINESS: 'e.g. Sharma Traders',
  TRADING: 'e.g. Zerodha F&O',
  FREELANCE: 'e.g. Upwork, direct clients',
  RENTAL: 'e.g. Andheri East flat',
  INTEREST_DIVIDEND: 'e.g. HDFC FD interest',
  CAPITAL_GAINS: 'e.g. Equity MF redemptions',
  OTHER: 'e.g. Pension, royalties',
};
