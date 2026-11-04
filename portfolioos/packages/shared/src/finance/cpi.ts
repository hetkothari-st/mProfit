/**
 * Consumer Price Index reference data for the Personal Inflation feature.
 *
 * Source: MoSPI eSankhyiki API (api.mospi.gov.in), verified live 2026-11-03.
 *
 *  - Current series, base year 2024 (`/api/cpi/getCPIData`): COICOP 2018
 *    divisions, January 2026 onward. Division codes and state codes below are
 *    exactly the ones that endpoint returns / accepts.
 *  - Previous series, base year 2012 (`/api/cpi/getCPIIndex`): Jan 2011 to
 *    Dec 2025, its own group/subgroup taxonomy and its own state numbering.
 *    Used only to supply year-on-year history for the long-run rate, mapped
 *    onto the new divisions via `LEGACY_SUBGROUPS_BY_DIVISION`.
 */

export const CPI_SECTORS = ['RURAL', 'URBAN', 'COMBINED'] as const;
export type CpiSector = (typeof CPI_SECTORS)[number];

export const CPI_SECTOR_LABELS: Record<CpiSector, string> = {
  RURAL: 'Rural',
  URBAN: 'Urban',
  COMBINED: 'Combined',
};

/** '00' is the headline index ("CPI (General)"); the API itself sends no code for it. */
export const CPI_GENERAL_DIVISION = '00';

export interface CpiDivision {
  code: string;
  /** MoSPI's own division name. */
  label: string;
  /** Shorter label for tables and pickers. */
  shortLabel: string;
}

/**
 * The thirteen division-level rows the base-2024 series publishes. There is
 * no '12' — COICOP 2018's "Insurance and financial services" is not priced in
 * India's CPI, and the API skips straight from 11 to 13.
 */
export const CPI_DIVISIONS: readonly CpiDivision[] = [
  { code: '00', label: 'CPI (General)', shortLabel: 'Overall' },
  { code: '01', label: 'Food and beverages', shortLabel: 'Food & beverages' },
  { code: '02', label: 'Paan, tobacco and intoxicants', shortLabel: 'Paan & tobacco' },
  { code: '03', label: 'Clothing and footwear', shortLabel: 'Clothing & footwear' },
  { code: '04', label: 'Housing, water, electricity, gas and other fuels', shortLabel: 'Housing & utilities' },
  { code: '05', label: 'Furnishings, household equipment and routine household maintenance', shortLabel: 'Household goods & help' },
  { code: '06', label: 'Health', shortLabel: 'Health' },
  { code: '07', label: 'Transport', shortLabel: 'Transport & fuel' },
  { code: '08', label: 'Information and communication', shortLabel: 'Phone & internet' },
  { code: '09', label: 'Recreation, sport and culture', shortLabel: 'Recreation' },
  { code: '10', label: 'Education services', shortLabel: 'Education' },
  { code: '11', label: 'Restaurants and accommodation services', shortLabel: 'Eating out & stays' },
  { code: '13', label: 'Personal care, social protection and miscellaneous goods and services', shortLabel: 'Personal care, jewellery & misc.' },
];

/** Divisions a basket item may be filed under (everything except the headline). */
export const CPI_ITEM_DIVISIONS: readonly CpiDivision[] = CPI_DIVISIONS.filter(
  (d) => d.code !== CPI_GENERAL_DIVISION,
);

const DIVISION_CODES = new Set(CPI_DIVISIONS.map((d) => d.code));

export function isCpiDivisionCode(code: string): boolean {
  return DIVISION_CODES.has(code);
}

export function cpiDivisionLabel(code: string): string {
  return CPI_DIVISIONS.find((d) => d.code === code)?.shortLabel ?? code;
}

export interface CpiState {
  /** Base-2024 `state_code`. 1 = All India. */
  code: number;
  name: string;
  /**
   * Base-2012 `state_code` for the same territory, or null where the old
   * series has none (Ladakh was carved out of J&K after 2012's design).
   * The old series numbers states differently (99 = All India).
   */
  legacyCode: number | null;
}

export const CPI_ALL_INDIA_STATE_CODE = 1;

/**
 * Codes probed against both endpoints on 2026-11-03. The merged UT
 * "Dadra and Nagar Haveli and Daman and Diu" maps to the old series' Dadra &
 * Nagar Haveli (26); the old series also has Daman & Diu (25) separately.
 */
export const CPI_STATES: readonly CpiState[] = [
  { code: 1, name: 'All India', legacyCode: 99 },
  { code: 2, name: 'Andaman and Nicobar Islands', legacyCode: 35 },
  { code: 3, name: 'Andhra Pradesh', legacyCode: 28 },
  { code: 4, name: 'Arunachal Pradesh', legacyCode: 12 },
  { code: 5, name: 'Assam', legacyCode: 18 },
  { code: 6, name: 'Bihar', legacyCode: 10 },
  { code: 7, name: 'Chandigarh', legacyCode: 4 },
  { code: 8, name: 'Chhattisgarh', legacyCode: 22 },
  { code: 9, name: 'Goa', legacyCode: 30 },
  { code: 10, name: 'Gujarat', legacyCode: 24 },
  { code: 11, name: 'Haryana', legacyCode: 6 },
  { code: 12, name: 'Himachal Pradesh', legacyCode: 2 },
  { code: 13, name: 'Jammu and Kashmir', legacyCode: 1 },
  { code: 14, name: 'Jharkhand', legacyCode: 20 },
  { code: 15, name: 'Karnataka', legacyCode: 29 },
  { code: 16, name: 'Kerala', legacyCode: 32 },
  { code: 17, name: 'Ladakh', legacyCode: null },
  { code: 18, name: 'Lakshadweep', legacyCode: 31 },
  { code: 19, name: 'Madhya Pradesh', legacyCode: 23 },
  { code: 20, name: 'Maharashtra', legacyCode: 27 },
  { code: 21, name: 'Manipur', legacyCode: 14 },
  { code: 22, name: 'Meghalaya', legacyCode: 17 },
  { code: 23, name: 'Mizoram', legacyCode: 15 },
  { code: 24, name: 'Nagaland', legacyCode: 13 },
  { code: 25, name: 'Delhi', legacyCode: 7 },
  { code: 26, name: 'Odisha', legacyCode: 21 },
  { code: 27, name: 'Puducherry', legacyCode: 34 },
  { code: 28, name: 'Punjab', legacyCode: 3 },
  { code: 29, name: 'Rajasthan', legacyCode: 8 },
  { code: 30, name: 'Sikkim', legacyCode: 11 },
  { code: 31, name: 'Tamil Nadu', legacyCode: 33 },
  { code: 32, name: 'Telangana', legacyCode: 36 },
  { code: 33, name: 'Dadra and Nagar Haveli and Daman and Diu', legacyCode: 26 },
  { code: 34, name: 'Tripura', legacyCode: 16 },
  { code: 35, name: 'Uttar Pradesh', legacyCode: 9 },
  { code: 36, name: 'Uttarakhand', legacyCode: 5 },
  { code: 37, name: 'West Bengal', legacyCode: 19 },
];

export function cpiStateName(code: number): string {
  return CPI_STATES.find((s) => s.code === code)?.name ?? `State ${code}`;
}

export function isCpiStateCode(code: number): boolean {
  return CPI_STATES.some((s) => s.code === code);
}

/**
 * Old-series subgroups standing in for each new division, for YoY history
 * before 2026. Approximate by nature — the two series classify differently:
 *  - '04' averages the old Housing and Fuel & Light (whichever are published;
 *    rural Housing is never published in the old series).
 *  - '07' and '08' both read the old combined "Transport and Communication".
 *  - '11' reads "Prepared Meals, Snacks, Sweets etc.", the closest old line.
 */
export const LEGACY_SUBGROUPS_BY_DIVISION: Readonly<Record<string, readonly string[]>> = {
  '00': ['General-Overall'],
  '01': ['Food and Beverages-Overall'],
  '02': ['Pan, Tobacco and Intoxicants-Overall'],
  '03': ['Clothing and Footwear-Overall'],
  '04': ['Housing-Overall', 'Fuel and Light-Overall'],
  '05': ['Household Goods and Services'],
  '06': ['Health'],
  '07': ['Transport and Communication'],
  '08': ['Transport and Communication'],
  '09': ['Recreation and Amusement'],
  '10': ['Education'],
  '11': ['Prepared Meals, Snacks, Sweets etc.'],
  '13': ['Personal Care and Effects'],
};

/** Years of same-month YoY readings compounded into the long-run rate. */
export const CPI_LONG_RUN_YEARS = 5;

/**
 * CPI division whose rate fits a goal category, or null when the personal
 * basket rate (then headline CPI) is the better guess. Shared by the goal
 * impact card and the Goal dialog hint so both suggest the same rate.
 */
export function goalRateDivision(category: string): string | null {
  if (category === 'CHILD_EDUCATION') return '10';
  if (category === 'VEHICLE_PURCHASE') return '07';
  return null;
}

/** One-tap starting points for the "add expense" picker; the user fills the amount. */
export const COMMON_EXPENSE_PRESETS: readonly {
  name: string;
  divisionCode: string;
  frequency: 'MONTHLY' | 'YEARLY';
  /** Paid every month whatever the income: Safe-to-Invest subtracts it. */
  isFixed?: boolean;
}[] = [
  { name: 'Rent', divisionCode: '04', frequency: 'MONTHLY', isFixed: true },
  { name: 'Groceries', divisionCode: '01', frequency: 'MONTHLY' },
  { name: 'School fees', divisionCode: '10', frequency: 'YEARLY', isFixed: true },
  { name: 'Healthcare & medicines', divisionCode: '06', frequency: 'MONTHLY' },
  { name: 'Electricity & gas', divisionCode: '04', frequency: 'MONTHLY' },
  { name: 'Fuel & commute', divisionCode: '07', frequency: 'MONTHLY' },
  { name: 'Phone & internet', divisionCode: '08', frequency: 'MONTHLY' },
  { name: 'Domestic help', divisionCode: '05', frequency: 'MONTHLY' },
  { name: 'Eating out', divisionCode: '11', frequency: 'MONTHLY' },
  { name: 'Clothing', divisionCode: '03', frequency: 'YEARLY' },
  { name: 'Holidays & leisure', divisionCode: '09', frequency: 'YEARLY' },
  { name: 'Personal care', divisionCode: '13', frequency: 'MONTHLY' },
];
