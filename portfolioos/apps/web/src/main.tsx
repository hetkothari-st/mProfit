import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, hashKey } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { App } from './App';
import { useFamilyScopeStore } from './stores/familyScope.store';
import './styles/globals.css';

/**
 * The family scope is a real input to every request — `api/client.ts` attaches
 * it as `X-Viewing-As-Family`, and the server returns different rows for
 * different values. But it appears in almost none of the ~565 query keys in
 * this app, so two different scopes were colliding on one cache entry:
 * `['portfolios']` under the family view overwrote `['portfolios']` under the
 * personal one, and whichever loaded last was served to both.
 *
 * Remounting the page on switch (the previous workaround, in AppShell) does
 * not fix this. A remounted `useQuery` still finds a cache entry that is
 * fresh under `staleTime: 30_000` and serves it without refetching — so
 * switching scope inside that window showed the OTHER scope's data outright,
 * and outside it showed the other scope's data first while a background
 * refetch corrected it.
 *
 * Namespacing the cache key by scope fixes it for every query at once and
 * without touching any call site. Each scope gets its own entry, switching
 * back is an instant cache hit rather than a refetch, and stale cross-scope
 * reads become unrepresentable rather than merely unlikely.
 *
 * `invalidateQueries({ queryKey: ['portfolios'] })` still matches, because
 * filters match on the query key itself, which is left untouched — only the
 * cache's internal hash is namespaced.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      queryKeyHashFn: (queryKey) =>
        hashKey([
          useFamilyScopeStore.getState().viewingAsFamilyId ?? '__personal__',
          ...queryKey,
        ]),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontSize: '0.875rem' },
          success: { iconTheme: { primary: 'hsl(137 64% 37%)', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
