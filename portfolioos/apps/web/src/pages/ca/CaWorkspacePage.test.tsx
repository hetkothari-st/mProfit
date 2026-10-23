// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CaWorkspacePage } from './CaWorkspacePage';

// A professional without the advisor plan is shown the way to it. That link
// used to point at /settings/billing, a route that does not exist.
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => ({ allowed: false }) }));
vi.mock('@/api/ca.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/ca.api')>()),
  caApi: { listClients: vi.fn().mockResolvedValue([]) },
}));

afterEach(() => cleanup());

describe('CaWorkspacePage without the advisor plan', () => {
  it('links "Invite your own clients" to the pricing page', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <CaWorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const link = await screen.findByRole('link', { name: /invite your own clients/i });
    expect(link.getAttribute('href')).toBe('/pricing');
  });
});
