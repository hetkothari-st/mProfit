// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import type { BankAccountDTO } from '@/api/bankAccounts.api';
import { BankAccountVisual } from './BankAccountVisual';

const reveal = vi.hoisted(() => vi.fn());
vi.mock('@/api/bankAccounts.api', () => ({
  bankAccountsApi: { revealAccountNumber: reveal },
}));

afterEach(() => {
  cleanup();
  reveal.mockReset();
});

function makeAccount(overrides: Partial<BankAccountDTO> = {}): BankAccountDTO {
  return {
    id: 'ba1',
    userId: 'u1',
    portfolioId: null,
    bankName: 'HDFC Bank',
    accountType: 'SAVINGS',
    accountHolder: 'TEST USER',
    last4: '6789',
    hasAccountNumber: true,
    customerId: 'CIF1',
    ifsc: null,
    branch: null,
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
    ...overrides,
  };
}

// The list page wraps the visual in a <Link>, so the eye button must not
// trigger navigation to the detail page.
function renderInLink(account: BankAccountDTO) {
  render(
    <MemoryRouter initialEntries={['/bank-accounts']}>
      <Routes>
        <Route
          path="/bank-accounts"
          element={
            <Link to={`/bank-accounts/${account.id}`}>
              <BankAccountVisual account={account} />
            </Link>
          }
        />
        <Route path="/bank-accounts/:id" element={<div>DETAIL PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BankAccountVisual account-number reveal', () => {
  it('shows only the last 4 digits by default', () => {
    renderInLink(makeAccount());
    expect(screen.getByText('6789')).toBeTruthy();
    expect(screen.queryByText(/5010/)).toBeNull();
    expect(screen.getByRole('button', { name: /show account number/i })).toBeTruthy();
    expect(reveal).not.toHaveBeenCalled();
  });

  it('reveals the full number on click and hides it again', async () => {
    reveal.mockResolvedValue({ accountNumber: '50100123456789' });
    renderInLink(makeAccount());

    fireEvent.click(screen.getByRole('button', { name: /show account number/i }));
    expect(await screen.findByText('5010 0123 4567 89')).toBeTruthy();
    expect(reveal).toHaveBeenCalledWith('ba1');
    expect(screen.queryByText('DETAIL PAGE')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /hide account number/i }));
    expect(screen.queryByText('5010 0123 4567 89')).toBeNull();
    expect(screen.getByText('6789')).toBeTruthy();
    expect(screen.queryByText('DETAIL PAGE')).toBeNull();
  });

  it('does not call the API when no full number is saved', () => {
    renderInLink(makeAccount({ hasAccountNumber: false }));
    fireEvent.click(screen.getByRole('button', { name: /show account number/i }));
    expect(reveal).not.toHaveBeenCalled();
    expect(screen.getByText('6789')).toBeTruthy();
    expect(screen.queryByText('DETAIL PAGE')).toBeNull();
  });
});
