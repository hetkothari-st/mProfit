// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HiddenCostsPage, HIDDEN_COSTS_SLOW_MS } from './HiddenCostsPage';

// Launch review B4: /hidden-costs showed only a spinner for 10+ seconds. Every
// state — slow, empty, failed — must say something.

const api = vi.hoisted(() => ({ view: vi.fn() }));
vi.mock('@/api/hiddenCosts.api', () => ({ HIDDEN_COSTS_KEY: ['hidden-costs'], hiddenCostsApi: api }));


function renderPage(props: { slowAfterMs?: number } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HiddenCostsPage {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const emptyView = {
  totalInr: '0.00',
  cuttableInr: '0.00',
  estimatedInr: '0.00',
  sources: [],
  compound: { valueInr: '0.00', years: 20, ratePct: 12 },
  unavailable: [],
};

beforeEach(() => {
  api.view.mockReset();
});
afterEach(() => cleanup());

describe('Hidden costs page states', () => {
  it('says it is still working when the answer is slow', async () => {
    api.view.mockImplementation(() => new Promise(() => {}));
    renderPage({ slowAfterMs: 50 });
    expect(screen.queryByText(/Still working out your costs/)).toBeNull();
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getByText(/Still working out your costs/)).toBeTruthy();
    expect(HIDDEN_COSTS_SLOW_MS).toBeGreaterThan(1000);
  });

  it('explains an empty result', async () => {
    api.view.mockResolvedValue(emptyView);
    renderPage();
    expect(await screen.findByText('No hidden costs found.')).toBeTruthy();
  });

  it('shows a message, not a spinner, when the request fails', async () => {
    api.view.mockImplementation(() => Promise.reject(new Error('timeout of 45000ms exceeded')));
    renderPage();
    expect(await screen.findByText(/timeout of 45000ms exceeded/)).toBeTruthy();
  });
});
