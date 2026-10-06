// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthUser } from '@everypaisa/shared';
import type { BankAccountDTO } from '@/api/bankAccounts.api';
import { useAuthStore } from '@/stores/auth.store';
import { BankAccountDialog } from './BankAccountDialog';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  lookupIfsc: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/api/bankAccounts.api', () => ({ bankAccountsApi: api }));

const EXISTING: BankAccountDTO = {
  id: 'ba-old',
  userId: 'u1',
  portfolioId: null,
  bankName: 'HDFC Bank',
  accountType: 'SAVINGS',
  accountHolder: 'Het Kothari',
  last4: '1111',
  hasAccountNumber: false,
  customerId: 'CIF123',
  ifsc: 'HDFC0000240',
  branch: 'Worli',
  branchAddress: null,
  nickname: null,
  jointHolders: [],
  nomineeName: 'Asha Kothari',
  nomineeRelation: 'Mother',
  debitCardLast4: null,
  debitCardExpiry: null,
  currentBalance: null,
  balanceAsOf: null,
  balanceSource: null,
  status: 'ACTIVE',
  openedOn: null,
  closedOn: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  api.list.mockResolvedValue([EXISTING]);
  api.create.mockResolvedValue({ ...EXISTING, id: 'ba-new' });
  useAuthStore.setState({ user: { id: 'u1', name: 'Het Kothari' } as AuthUser });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderAddDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BankAccountDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
  // Suggestions come from the user's other accounts.
  await waitFor(() => expect(api.list).toHaveBeenCalled());
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('BankAccountDialog autofill', () => {
  it("pre-fills the account holder with the user's name", async () => {
    await renderAddDialog();
    expect(field('Account holder *').value).toBe('Het Kothari');
  });

  it('picking a bank pre-fills the IFSC prefix and a known customer ID', async () => {
    await renderAddDialog();
    fireEvent.change(field('Bank *'), { target: { value: 'hdfc' } });
    fireEvent.click(await screen.findByRole('option', { name: /HDFC Bank/ }));

    expect(field('Bank *').value).toBe('HDFC Bank');
    expect(field('IFSC').value).toBe('HDFC0');
    await waitFor(() => expect(field('Customer ID *').value).toBe('CIF123'));
  });

  it('typing an IFSC prefix names the bank without a network call', async () => {
    await renderAddDialog();
    fireEvent.change(field('IFSC'), { target: { value: 'icic' } });
    expect(field('IFSC').value).toBe('ICIC');
    expect(field('Bank *').value).toBe('ICICI Bank');
    expect(api.lookupIfsc).not.toHaveBeenCalled();
  });

  it('a complete IFSC fills bank, branch and address as soon as it is typed', async () => {
    api.lookupIfsc.mockResolvedValue({
      ifsc: 'HDFC0000240',
      bank: 'HDFC Bank',
      branch: 'MUMBAI - SANDOZ HOUSE',
      address: 'SANDOZ HOUSE, DR. A.B.ROADWORLIMUMBAIMAHARASHTRA400 018',
      city: 'GREATER MUMBAI',
      state: 'MAHARASHTRA',
    });
    await renderAddDialog();

    fireEvent.change(field('IFSC'), { target: { value: 'HDFC0000240' } });

    await waitFor(() => expect(field('Branch').value).toBe('MUMBAI - SANDOZ HOUSE'));
    expect(api.lookupIfsc).toHaveBeenCalledWith('HDFC0000240');
    expect(field('Bank *').value).toBe('HDFC Bank');
    expect(field('Branch address').value).toBe(
      'SANDOZ HOUSE, DR. A.B.ROADWORLIMUMBAIMAHARASHTRA400 018',
    );
  });

  it('suggests nominees from other accounts and fills their relation', async () => {
    await renderAddDialog();
    fireEvent.change(field('Nominee name'), { target: { value: 'asha' } });
    fireEvent.click(await screen.findByRole('option', { name: /Asha Kothari/ }));

    expect(field('Nominee name').value).toBe('Asha Kothari');
    expect(field('Relation').value).toBe('Mother');
  });

  it('dates a newly entered balance to today', async () => {
    await renderAddDialog();
    fireEvent.change(field('Current balance (₹)'), { target: { value: '1000' } });
    // Local date, not UTC — UTC lags IST until 05:30.
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(field('As of').value).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    );
  });

  it('takes the debit card expiry from month and year dropdowns', async () => {
    await renderAddDialog();
    fireEvent.change(field('Bank *'), { target: { value: 'HDFC Bank' } });
    fireEvent.change(field('Last 4 digits *'), { target: { value: '4321' } });
    fireEvent.change(field('Customer ID *'), { target: { value: 'CIF999' } });
    fireEvent.change(field('Card expiry month'), { target: { value: '08' } });
    fireEvent.change(field('Card expiry year'), { target: { value: '29' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ bankName: 'HDFC Bank', debitCardExpiry: '08/29' }),
      ),
    );
  });
});
