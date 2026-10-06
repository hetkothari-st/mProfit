// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BankAccountDTO } from '@/api/bankAccounts.api';
import { BankAccountDetailPage } from './BankAccountDetailPage';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  cashFlows: vi.fn(),
  revealAccountNumber: vi.fn(),
  addSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/api/bankAccounts.api', () => ({ bankAccountsApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const account: BankAccountDTO = {
  id: 'ba1',
  userId: 'u1',
  portfolioId: null,
  bankName: 'HDFC Bank',
  accountType: 'SAVINGS',
  accountHolder: 'TEST USER',
  last4: '6789',
  hasAccountNumber: true,
  customerId: 'CIF1',
  ifsc: 'HDFC0001234',
  branch: 'Andheri East',
  branchAddress: null,
  nickname: null,
  jointHolders: [],
  nomineeName: null,
  nomineeRelation: null,
  debitCardLast4: null,
  debitCardExpiry: null,
  currentBalance: '1000',
  balanceAsOf: null,
  balanceSource: null,
  status: 'ACTIVE',
  openedOn: null,
  closedOn: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  snapshots: [],
};

function renderPage() {
  api.get.mockResolvedValue(account);
  api.cashFlows.mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/bank-accounts/ba1']}>
        <Routes>
          <Route path="/bank-accounts/:id" element={<BankAccountDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The "Account number" DetailRow in the Bank details card. */
async function accountNumberRow() {
  const label = await screen.findByText('Account number');
  return label.parentElement!;
}

describe('BankAccountDetailPage account number', () => {
  it('lists a masked account number in Bank details', async () => {
    renderPage();
    const row = await accountNumberRow();
    expect(within(row).getByText('6789')).toBeTruthy();
    expect(within(row).queryByText(/5010/)).toBeNull();
    expect(api.revealAccountNumber).not.toHaveBeenCalled();
  });

  it('reveals the full number from the row eye button', async () => {
    api.revealAccountNumber.mockResolvedValue({ accountNumber: '50100123456789' });
    renderPage();
    const row = await accountNumberRow();

    fireEvent.click(within(row).getByRole('button', { name: /show account number/i }));

    expect(await within(row).findByText('5010 0123 4567 89')).toBeTruthy();
    expect(api.revealAccountNumber).toHaveBeenCalledWith('ba1');
  });
});
