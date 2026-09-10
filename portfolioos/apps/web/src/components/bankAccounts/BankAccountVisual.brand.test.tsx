// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { BankAccountDTO } from '@/api/bankAccounts.api';
import { BankAccountVisual } from './BankAccountVisual';

vi.mock('@/api/bankAccounts.api', () => ({ bankAccountsApi: { revealAccountNumber: vi.fn() } }));

afterEach(() => cleanup());

function makeAccount(bankName: string): BankAccountDTO {
  return {
    id: 'ba1',
    userId: 'u1',
    portfolioId: null,
    bankName,
    accountType: 'SAVINGS',
    accountHolder: 'TEST USER',
    last4: '6789',
    hasAccountNumber: false,
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
  };
}

describe('BankAccountVisual branding', () => {
  it("paints a known bank's tile in its brand and shows its logo", () => {
    render(<BankAccountVisual account={makeAccount('HDFC Bank')} />);
    expect(screen.getByLabelText('HDFC Bank bank account').getAttribute('data-brand')).toBe('hdfc-bank');
    expect(screen.getByRole('img', { name: 'HDFC Bank logo' })).toBeTruthy();
  });

  it('recognises the bank from a loosely typed name', () => {
    render(<BankAccountVisual account={makeAccount('sbi')} />);
    expect(screen.getByLabelText('sbi bank account').getAttribute('data-brand')).toBe('state-bank-of-india');
  });

  it('falls back to a neutral facade and initials for an unknown bank', () => {
    render(<BankAccountVisual account={makeAccount('Nowhere Co-op Bank')} />);
    expect(screen.getByLabelText('Nowhere Co-op Bank bank account').getAttribute('data-brand')).toBe('neutral');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
