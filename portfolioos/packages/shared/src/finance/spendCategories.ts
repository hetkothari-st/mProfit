/**
 * Spending categories for the Personal Inflation basket (product spec §5).
 *
 * Basket categories count towards the personal inflation rate, each at its
 * CPI division's rate. Excluded categories are real money movements that are
 * not consumption (transfers, investing, EMIs, tax...) and never count.
 */

export const BASKET_CATEGORIES = [
  'groceries',
  'dining_out',
  'rent',
  'utilities',
  'fuel_transport',
  'phone_internet',
  'education',
  'healthcare',
  'clothing',
  'household',
  'personal_care',
  'lifestyle',
  'domestic_help',
  'other_consumption',
] as const;

export const EXCLUDED_CATEGORIES = [
  'self_transfer',
  'investment',
  'loan_emi',
  'credit_card_bill',
  'tax',
  'insurance_premium_life',
  'refund',
  'cash_withdrawal',
  'income',
] as const;

export type BasketCategory = (typeof BASKET_CATEGORIES)[number];
export type ExcludedCategory = (typeof EXCLUDED_CATEGORIES)[number];
export type SpendCategory = BasketCategory | ExcludedCategory | 'uncategorised';

export const SPEND_CATEGORIES: readonly SpendCategory[] = [...BASKET_CATEGORIES, ...EXCLUDED_CATEGORIES, 'uncategorised'];

export function isSpendCategory(v: string): v is SpendCategory {
  return (SPEND_CATEGORIES as readonly string[]).includes(v);
}

export function isBasketCategory(v: string): v is BasketCategory {
  return (BASKET_CATEGORIES as readonly string[]).includes(v);
}

/** Where each category came from: the user's own tag always wins. */
export type SpendCategorySource = 'user' | 'rule' | 'dictionary' | 'model' | 'none';

export const SPEND_CATEGORY_LABELS: Record<SpendCategory, string> = {
  groceries: 'Groceries',
  dining_out: 'Eating out',
  rent: 'Rent',
  utilities: 'Electricity, gas & water',
  fuel_transport: 'Fuel & travel',
  phone_internet: 'Phone & internet',
  education: 'Education',
  healthcare: 'Healthcare',
  clothing: 'Clothing & footwear',
  household: 'Household goods',
  personal_care: 'Personal care',
  lifestyle: 'Entertainment & leisure',
  domestic_help: 'Domestic help',
  other_consumption: 'Other spending',
  self_transfer: 'Transfer to your own account',
  investment: 'Investment',
  loan_emi: 'Loan EMI',
  credit_card_bill: 'Credit card bill',
  tax: 'Tax',
  insurance_premium_life: 'Life insurance premium',
  refund: 'Refund',
  cash_withdrawal: 'Cash withdrawal',
  income: 'Income',
  uncategorised: 'Not sorted yet',
};

/**
 * Default CPI division (MoSPI 2024 series) for each basket category. The
 * engine reads this through an AppSetting override when one is set, so the
 * mapping can change without a release (spec §4 `category_cpi_map`).
 */
export const DEFAULT_CATEGORY_CPI_DIVISION: Record<BasketCategory, string> = {
  groceries: '01',
  dining_out: '11',
  rent: '04',
  utilities: '04',
  fuel_transport: '07',
  phone_internet: '08',
  education: '10',
  healthcare: '06',
  clothing: '03',
  household: '05',
  personal_care: '13',
  lifestyle: '09',
  domestic_help: '05',
  other_consumption: '00',
};
