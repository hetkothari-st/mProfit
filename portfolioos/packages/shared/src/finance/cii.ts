/**
 * Cost Inflation Index (CII) — published by CBDT under section 48 of the
 * Income-tax Act for indexed cost of acquisition / improvement when computing
 * Long-Term Capital Gains. Base year 2001-02 = 100.
 *
 * Used for property LTCG (section 112) when the property was acquired
 * before 23-Jul-2024 and the taxpayer chooses the indexed @ 20% option.
 * After Finance Act 2024 (23-Jul-2024 onwards) indexation is removed for
 * property and a flat 12.5% rate applies — but the choice is preserved
 * for assets bought before that cutoff.
 *
 * Keep in sync with CBDT notifications. Source:
 *   https://incometaxindia.gov.in/Pages/utilities/cost-inflation-index.aspx
 */

export const CII_BY_FY: Record<string, number> = {
  '2001-02': 100,
  '2002-03': 105,
  '2003-04': 109,
  '2004-05': 113,
  '2005-06': 117,
  '2006-07': 122,
  '2007-08': 129,
  '2008-09': 137,
  '2009-10': 148,
  '2010-11': 167,
  '2011-12': 184,
  '2012-13': 200,
  '2013-14': 220,
  '2014-15': 240,
  '2015-16': 254,
  '2016-17': 264,
  '2017-18': 272,
  '2018-19': 280,
  '2019-20': 289,
  '2020-21': 301,
  '2021-22': 317,
  '2022-23': 331,
  '2023-24': 348,
  '2024-25': 363,
  '2025-26': 376, // estimate; update when CBDT publishes
};

/**
 * Convert any date (string or Date) into the Indian financial year string
 * `YYYY-YY` (April through March). E.g. 2024-04-15 → "2024-25".
 * 2024-03-15 → "2023-24".
 */
export function financialYearFromDate(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed
  const startYear = month >= 3 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
}

/**
 * Look up CII for a given date. Returns the index, or null when the date
 * predates the base year (no indexation possible).
 */
export function ciiForDate(input: string | Date): number | null {
  const fy = financialYearFromDate(input);
  return CII_BY_FY[fy] ?? null;
}

/**
 * Cutoff for Finance Act 2024 — property bought on/before this date may
 * choose between indexed @ 20% vs non-indexed @ 12.5%; later acquisitions
 * use only non-indexed @ 12.5%.
 */
export const PROPERTY_INDEXATION_CHOICE_CUTOFF = '2024-07-23';
