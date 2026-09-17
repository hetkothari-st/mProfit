import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Decimal } from 'decimal.js';
import { dashboardApi } from '@/api/dashboard.api';
import { bankAccountsApi } from '@/api/bankAccounts.api';
import { realEstateApi } from '@/api/realEstate.api';
import { computeSidebarValues } from '@/lib/sidebarClassValues';

/**
 * Value per sidebar asset class, or null until the figures are in (so the
 * list doesn't reshuffle while loading).
 *
 * Uses the same query keys as the dashboard, bank accounts and real estate
 * pages, so it shares their cache and refreshes whenever they are invalidated.
 */
export function useSidebarClassValues(enabled: boolean): Map<string, Decimal> | null {
  const netWorth = useQuery({
    queryKey: ['dashboard', 'net-worth', 'ALL'],
    queryFn: () => dashboardApi.netWorth(undefined),
    enabled,
  });
  const bankAccounts = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.list(),
    enabled,
  });
  const realEstate = useQuery({
    queryKey: ['real-estate-summary'],
    queryFn: () => realEstateApi.getSummary(),
    enabled,
  });

  const settled = (q: { isSuccess: boolean; isError: boolean }) => q.isSuccess || q.isError;
  const ready = netWorth.isSuccess && settled(bankAccounts) && settled(realEstate);

  return useMemo(
    () =>
      ready
        ? computeSidebarValues({
            netWorth: netWorth.data,
            bankBalances: bankAccounts.data?.map((a) => a.currentBalance),
            ownedRealEstateValue: realEstate.data?.totalCurrentValue,
          })
        : null,
    [ready, netWorth.data, bankAccounts.data, realEstate.data],
  );
}

export type AssetSortMode = 'value' | 'manual';
const SORT_KEY = 'everypaisa.sidebar.assetSort';

function readSortMode(): AssetSortMode {
  try {
    return localStorage.getItem(SORT_KEY) === 'manual' ? 'manual' : 'value';
  } catch {
    return 'value';
  }
}

/** Sidebar asset-class order: by value (default) or the user's saved order. */
export function useAssetSortMode(): [AssetSortMode, (mode: AssetSortMode) => void] {
  const [mode, setMode] = useState<AssetSortMode>(readSortMode);
  const update = (next: AssetSortMode) => {
    setMode(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this page only.
      return;
    }
  };
  return [mode, update];
}
