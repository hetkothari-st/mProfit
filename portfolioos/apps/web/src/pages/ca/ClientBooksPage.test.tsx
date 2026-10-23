// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientBooksPage } from './ClientBooksPage';

/**
 * Deleting from a client's books is a change to someone else's ledger. It
 * used to fire on a single click; it now asks first, as the client's own
 * Accounting page does.
 */

const api = vi.hoisted(() => ({
  listClients: vi.fn(),
  accountsFlat: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock('@/api/ca.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/ca.api')>()),
  caApi: {
    listClients: api.listClients,
    accountsFlat: api.accountsFlat,
    deleteAccount: api.deleteAccount,
  },
  caReceiptsApi: {},
}));

const CLIENT = {
  id: 'cl1',
  name: 'Their CA',
  displayName: 'Mahesh Iyer',
  displayEmail: null,
  initiatedBy: 'CLIENT',
  email: null,
  pan: null,
  phone: null,
  category: null,
  userId: 'u1',
  kind: 'INVITED',
  status: 'ACTIVE',
  invitedEmail: null,
  inviteExpiresAt: null,
  acceptedAt: '2026-10-01T00:00:00.000Z',
  revokedAt: null,
  consentBasis: null,
  consentNote: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  canEditBooks: true,
  canEditTransactions: false,
  canEditImports: false,
  canEditFmv: false,
  accessUntil: null,
  scopeAllPortfolios: true,
  scopeAllCategories: true,
  scopeAllAssetClasses: true,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/ca/clients/cl1']}>
        <Routes>
          <Route path="/ca/clients/:clientId" element={<ClientBooksPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.listClients.mockResolvedValue([CLIENT]);
  api.accountsFlat.mockResolvedValue([{ id: 'a1', code: '1001', name: 'Cash', type: 'ASSET' }]);
  api.deleteAccount.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('deleting from a client book', () => {
  it('does nothing when the confirmation is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Cash' }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Cash' }));

    await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith('cl1', 'a1'));
  });
});
