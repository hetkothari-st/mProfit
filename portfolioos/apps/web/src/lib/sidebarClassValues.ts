import { Decimal } from 'decimal.js';
import type { AssetSectionPref } from '@everypaisa/shared';
import type { NetWorthResponse } from '@/api/dashboard.api';

/**
 * How much each sidebar asset class is worth, so the sidebar can list the
 * biggest first.
 *
 * Every figure is the amount a user would read on that class's page: current
 * value for assets, balance for bank accounts, amount owed for loans and
 * cards, cover for insurance. Liabilities count by size, not sign — a large
 * home loan belongs near the top of the list, not the bottom.
 */

/** Holdings asset class → sidebar section. Mirrors the dashboard's mapping. */
export function sidebarKeyForAssetClass(cls: string): string {
  switch (cls) {
    case 'EQUITY':
      return '/stocks';
    case 'FUTURES':
    case 'OPTIONS':
      return '/fo';
    case 'MUTUAL_FUND':
    case 'ETF':
      return '/mutual-funds';
    case 'BOND':
    case 'GOVT_BOND':
    case 'CORPORATE_BOND':
      return '/bonds';
    case 'FIXED_DEPOSIT':
    case 'RECURRING_DEPOSIT':
      return '/fds';
    case 'GOLD_BOND':
    case 'GOLD_ETF':
    case 'PHYSICAL_GOLD':
    case 'PHYSICAL_SILVER':
      return '/gold';
    case 'CRYPTOCURRENCY':
      return '/crypto';
    case 'FOREIGN_EQUITY':
    case 'FOREX_PAIR':
      return '/forex';
    case 'PPF':
    case 'EPF':
      return '/provident-fund';
    case 'NPS':
      return '/nps';
    case 'NSC':
    case 'KVP':
    case 'SCSS':
    case 'SSY':
    case 'POST_OFFICE_MIS':
    case 'POST_OFFICE_RD':
    case 'POST_OFFICE_TD':
    case 'POST_OFFICE_SAVINGS':
      return '/post-office';
    case 'REAL_ESTATE':
      return '/real-estate';
    case 'ULIP':
    case 'INSURANCE':
      return '/insurance';
    default:
      return '/others';
  }
}

export interface SidebarValueSources {
  netWorth?: NetWorthResponse;
  bankBalances?: Array<string | null | undefined>;
  ownedRealEstateValue?: string;
}

function dec(v: string | null | undefined): Decimal {
  if (!v) return new Decimal(0);
  try {
    return new Decimal(v);
  } catch {
    return new Decimal(0);
  }
}

export function computeSidebarValues(src: SidebarValueSources): Map<string, Decimal> {
  const values = new Map<string, Decimal>();
  const add = (key: string, amount: Decimal) =>
    values.set(key, (values.get(key) ?? new Decimal(0)).plus(amount.abs()));

  for (const slice of src.netWorth?.allocationBreakdown ?? []) {
    const key =
      slice.category === 'VEHICLE'
        ? '/vehicles'
        : slice.category === 'REAL_ESTATE'
          ? '/rental'
          : sidebarKeyForAssetClass(slice.key);
    add(key, dec(slice.value));
  }
  if (src.netWorth) {
    add('/loans', dec(src.netWorth.liabilities.totalOutstanding));
    add('/credit-cards', dec(src.netWorth.liabilities.totalCreditCardOutstanding));
    add('/insurance', dec(src.netWorth.insurance.totalSumAssured));
  }
  for (const balance of src.bankBalances ?? []) add('/bank-accounts', dec(balance));
  add('/real-estate', dec(src.ownedRealEstateValue));
  return values;
}

/**
 * Largest value first. Classes with nothing in them keep their saved relative
 * order below every class that has a value. Ties also fall back to saved order.
 */
export function sortSectionsByValue<T extends Pick<AssetSectionPref, 'key' | 'order'>>(
  sections: T[],
  values: Map<string, Decimal>,
): T[] {
  const valueOf = (key: string) => values.get(key) ?? new Decimal(0);
  return [...sections].sort((a, b) => {
    const diff = valueOf(b.key).comparedTo(valueOf(a.key));
    return diff !== 0 ? diff : a.order - b.order;
  });
}
