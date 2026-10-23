import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portfoliosApi } from '@/api/portfolios.api';
import { useAuthStore } from '@/stores/auth.store';
import { useActingAsStore } from '@/stores/actingAs.store';
import { reportablePortfolios } from '@/lib/reportDownloads';

/**
 * The portfolio list for a Reports / Analytics / report-download picker:
 * only the books those endpoints will actually serve (see
 * `reportablePortfolios`). Shares the `['portfolios']` cache with the rest of
 * the app, so it costs no extra request.
 */
export function useReportablePortfolios() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  // While managing a family profile the API runs as that profile.
  const actingId = useActingAsStore((s) => s.profile?.id ?? null);
  const query = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
    staleTime: 60_000,
  });
  const data = useMemo(
    () => (query.data ? reportablePortfolios(query.data, actingId ?? userId) : undefined),
    [query.data, actingId, userId],
  );
  return { data, isLoading: query.isLoading };
}
