// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { AuthUser } from '@portfolioos/shared';
import type { CreditCardDTO } from '@/api/creditCards.api';
import { useAuthStore } from '@/stores/auth.store';
import { CreditCardVisual } from './CreditCardVisual';

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1', name: 'Het Kothari' } as AuthUser });
});
afterEach(() => cleanup());

function makeCard(over: Partial<CreditCardDTO> = {}): CreditCardDTO {
  return {
    id: 'cc1',
    userId: 'u1',
    portfolioId: null,
    issuerBank: 'HDFC Bank',
    cardName: 'Regalia Gold',
    last4: '1234',
    network: 'VISA',
    creditLimit: '500000',
    outstandingBalance: '0',
    statementDay: 1,
    dueDay: 20,
    interestRate: null,
    annualFee: null,
    status: 'ACTIVE',
    statements: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const face = () => screen.getByTestId('credit-card-face');

describe('CreditCardVisual', () => {
  it('draws a catalog card as that card', () => {
    render(<CreditCardVisual card={makeCard()} />);
    expect(face().getAttribute('data-card')).toBe('hdfc-regalia-gold');
    expect(face().getAttribute('data-finish')).toBe('metal');
    expect(screen.getByText('Regalia Gold')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'HDFC Bank logo' })).toBeTruthy();
  });

  it("prints the holder's name and only the last 4 digits", () => {
    render(<CreditCardVisual card={makeCard()} />);
    expect(screen.getByText('HET KOTHARI')).toBeTruthy();
    expect(screen.getByText('1234')).toBeTruthy();
  });

  it('shows the network mark', () => {
    render(<CreditCardVisual card={makeCard({ network: 'MASTERCARD' })} />);
    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeTruthy();
  });

  it('draws vertical cards upright', () => {
    render(<CreditCardVisual card={makeCard({ cardName: 'Tata Neu Infinity', network: 'RUPAY' })} />);
    expect(face().getAttribute('data-orientation')).toBe('vertical');
    expect(screen.getByRole('img', { name: 'RuPay' })).toBeTruthy();
  });

  it('groups an Amex number the Amex way', () => {
    render(<CreditCardVisual card={makeCard({ issuerBank: 'Amex', cardName: 'Platinum Card', network: 'AMEX', last4: '1005' })} />);
    expect(face().getAttribute('data-card')).toBe('amex-platinum');
    expect(screen.getByRole('img', { name: 'American Express' })).toBeTruthy();
    // 15 digits in 4-6-5: only the final group shows its last four.
    expect(face().textContent).toMatch(/•{4}\s*•{6}\s*•1005/);
  });

  it('gives an unlisted card its tier finish', () => {
    render(<CreditCardVisual card={makeCard({ issuerBank: 'Canara Bank', cardName: 'Platinum', network: 'RUPAY' })} />);
    expect(face().getAttribute('data-card')).toBe('tier:platinum');
    expect(face().getAttribute('data-finish')).toBe('metal');
    expect(screen.getByText('Platinum')).toBeTruthy();
  });
});
