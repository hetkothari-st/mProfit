// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { TransactionDTO } from '@everypaisa/shared';
import { TransactionFormDialog } from './TransactionFormDialog';

const tx = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  priceCheck: vi.fn(async () => ({ status: 'unknown', reason: 'NO_PRICE_HISTORY' })),
}));
vi.mock('@/api/transactions.api', () => ({ transactionsApi: tx }));
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: { list: vi.fn(async () => [{ id: 'p1', name: 'Main' }]) },
}));
vi.mock('@/components/common/AssetSearch', () => ({ AssetSearch: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const base = {
  id: 't1', portfolioId: 'p1', transactionType: 'BUY', assetClass: 'EQUITY', symbol: 'ABC', exchange: 'NSE',
  assetName: 'ABC Ltd', tradeDate: '2026-02-11', quantity: '100', price: '1000',
  brokerage: '0', stt: '0', stampDuty: '0', exchangeCharges: '0', gst: '0', sebiCharges: '0', otherCharges: '0',
};

async function renderEdit(over: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionFormDialog open onOpenChange={() => undefined} initial={{ ...base, ...over } as unknown as TransactionDTO} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // The form resets once portfolios load; act after that or the edits are wiped.
  await screen.findByRole('option', { name: 'Main' });
}

const field = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

describe('Estimate charges', () => {
  it('fills STT, stamp duty, exchange, SEBI and GST for a delivery buy, and says it is an estimate', async () => {
    await renderEdit();
    fireEvent.click(await screen.findByRole('button', { name: /estimate charges/i }));
    await waitFor(() => expect(field('stt')).toBe('100'));
    expect(field('stampDuty')).toBe('15');
    expect(field('exchangeCharges')).toBe('2.97');
    expect(field('sebiCharges')).toBe('0.1');
    expect(field('gst')).toBe('0.55');
    expect(field('brokerage')).toBe('0'); // never guessed
    expect(screen.getByText(/check the amounts against your contract note/i)).toBeTruthy();
  });

  it('uses intraday rates when the box is ticked', async () => {
    await renderEdit();
    fireEvent.click(await screen.findByLabelText(/intraday/i));
    fireEvent.click(screen.getByRole('button', { name: /estimate charges/i }));
    await waitFor(() => expect(field('stampDuty')).toBe('3'));
    expect(field('stt')).toBe('0'); // intraday STT is on the sell side only
  });

  it('puts the typed brokerage into the GST', async () => {
    await renderEdit({ brokerage: '20' });
    fireEvent.click(await screen.findByRole('button', { name: /estimate charges/i }));
    await waitFor(() => expect(field('gst')).toBe('4.15'));
  });

  it('is not offered for assets it cannot estimate', async () => {
    await renderEdit({ assetClass: 'MUTUAL_FUND', symbol: undefined, schemeCode: '119551' });
    await screen.findByRole('button', { name: /save changes/i });
    expect(screen.queryByRole('button', { name: /estimate charges/i })).toBeNull();
  });
});
