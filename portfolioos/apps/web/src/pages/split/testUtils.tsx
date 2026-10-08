import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function renderWithProviders(ui: ReactElement, opts: { route?: string; path?: string } = {}): RenderResult {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[opts.route ?? '/']}>
        <Routes>
          <Route path={opts.path ?? '*'} element={ui} />
          <Route path="*" element={<div data-testid="navigated" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
