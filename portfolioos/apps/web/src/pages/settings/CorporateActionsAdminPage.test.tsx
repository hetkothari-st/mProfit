// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CorporateActionsAdminPage } from './CorporateActionsAdminPage';

const api = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn() }));
vi.mock('@/api/corporateActionsAdmin.api', () => ({ corporateActionsAdminApi: api }));
const role = vi.hoisted(() => ({ value: 'ADMIN' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: { user: { role: string } }) => unknown) => sel({ user: { role: role.value } }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CorporateActionsAdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  role.value = 'ADMIN';
  api.list.mockResolvedValue([]);
  api.add.mockResolvedValue({ corporateActionId: 'c1', symbol: 'TESTX', type: 'SPLIT', exDate: '2025-06-16', ratio: '2', created: true, portfoliosApplied: 1, transactionsBooked: 1 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Corporate actions admin page', () => {
  it('sends a split as old and new face value', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('NSE symbol or ISIN'), { target: { value: 'TESTX' } });
    fireEvent.change(screen.getByLabelText('Ex-date'), { target: { value: '2025-06-16' } });
    fireEvent.change(screen.getByLabelText('Old face value (₹)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('New face value (₹)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save corporate action' }));
    await waitFor(() =>
      expect(api.add).toHaveBeenCalledWith({ type: 'SPLIT', stock: 'TESTX', exDate: '2025-06-16', fromFaceValue: '2', toFaceValue: '1', applyNow: true }),
    );
  });

  it('sends a bonus as bonus shares per shares held', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'BONUS' } });
    fireEvent.change(screen.getByLabelText('NSE symbol or ISIN'), { target: { value: 'TESTX' } });
    fireEvent.change(screen.getByLabelText('Ex-date'), { target: { value: '2025-06-16' } });
    fireEvent.change(screen.getByLabelText('Bonus shares'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('For every … shares held'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save corporate action' }));
    await waitFor(() =>
      expect(api.add).toHaveBeenCalledWith({ type: 'BONUS', stock: 'TESTX', exDate: '2025-06-16', bonusShares: '4', heldShares: '1', applyNow: true }),
    );
  });

  it('is not shown to non-admins', () => {
    role.value = 'INVESTOR';
    renderPage();
    expect(screen.getByText('This page is for the EveryPaisa team.')).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
  });
});
