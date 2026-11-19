// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { TransactionDTO } from '@everypaisa/shared';
import { TransactionFormDialog } from './TransactionFormDialog';
import { canCheckPrice, describePriceCheck, type PriceCheckResult } from './priceSanity';

const tx = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), priceCheck: vi.fn() }));
vi.mock('@/api/transactions.api', () => ({ transactionsApi: tx }));
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: { list: vi.fn(async () => [{ id: 'p1', name: 'Main' }]) },
}));
vi.mock('@/components/common/AssetSearch', () => ({ AssetSearch: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const warn = (over: Partial<PriceCheckResult> = {}): PriceCheckResult => ({
  status: 'warn',
  code: 'LIKELY_UNIT_SLIP',
  diffPct: '9900.00',
  hint: 'This is about 100 times the market price: it may be in paise, or have two extra digits.',
  reference: { kind: 'CLOSE', value: '100', date: '2026-02-11', low: '98', high: '102' },
  ...over,
});

describe('canCheckPrice', () => {
  const base = { assetClass: 'EQUITY', transactionType: 'BUY', stockSymbol: 'ABC', tradeDate: '2026-02-11', price: 100 };

  it('needs a listed instrument, a trade date and a positive price', () => {
    expect(canCheckPrice(base)).toBe(true);
    expect(canCheckPrice({ ...base, stockSymbol: '' })).toBe(false);
    expect(canCheckPrice({ ...base, tradeDate: '' })).toBe(false);
    expect(canCheckPrice({ ...base, price: 0 })).toBe(false);
    expect(canCheckPrice({ ...base, price: Number.NaN })).toBe(false);
  });

  it('uses the scheme code for mutual funds and skips assets and trade types with no market price', () => {
    const mf = { ...base, assetClass: 'MUTUAL_FUND', stockSymbol: undefined, schemeCode: '119551' };
    expect(canCheckPrice(mf)).toBe(true);
    expect(canCheckPrice({ ...mf, schemeCode: '' })).toBe(false);
    expect(canCheckPrice({ ...base, assetClass: 'FIXED_DEPOSIT' })).toBe(false);
    expect(canCheckPrice({ ...base, transactionType: 'RIGHTS_ISSUE' })).toBe(false);
  });
});

describe('describePriceCheck', () => {
  it('says nothing unless the price looks wrong', () => {
    expect(describePriceCheck(undefined)).toBeNull();
    expect(describePriceCheck({ status: 'ok' })).toBeNull();
    expect(describePriceCheck({ status: 'unknown', reason: 'NO_PRICE_HISTORY' })).toBeNull();
  });

  it('names the reference, its date in dd/mm/yyyy, and the direction', () => {
    const d = describePriceCheck(warn({ diffPct: '40.00', hint: null }))!;
    expect(d.text).toBe('The closing price on 11/02/2026 was ₹100.00; the price you entered is 40% higher.');
    expect(d.hint).toBeNull();
    expect(describePriceCheck(warn({ diffPct: '-35.00' }))!.text).toContain('35% lower');
    expect(describePriceCheck(warn({ reference: { kind: 'NAV', value: '50', date: '2026-02-11', low: null, high: null } }))!.text).toMatch(/^The NAV on/);
  });
});

describe('TransactionFormDialog price notice', () => {
  const initial = {
    id: 't1', portfolioId: 'p1', transactionType: 'BUY', assetClass: 'EQUITY', symbol: 'ABC', exchange: 'NSE',
    assetName: 'ABC Ltd', tradeDate: '2026-02-11', quantity: '10', price: '10000',
  } as unknown as TransactionDTO;

  function renderEdit() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TransactionFormDialog open onOpenChange={() => undefined} initial={initial} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('shows a heads-up under the price when it looks like a slip, and still allows saving', async () => {
    tx.priceCheck.mockResolvedValue(warn());
    renderEdit();
    expect(await screen.findByText(/about 100 times the market price/i, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/you can still save if it is right/i)).toBeTruthy();
    expect(tx.priceCheck).toHaveBeenCalledWith(
      expect.objectContaining({ assetClass: 'EQUITY', stockSymbol: 'ABC', tradeDate: '2026-02-11', price: '10000' }),
    );
    expect((screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows nothing when the price is plausible', async () => {
    tx.priceCheck.mockResolvedValue({ status: 'ok', reference: { kind: 'CLOSE', value: '10000', date: '2026-02-11', low: null, high: null } });
    renderEdit();
    await vi.waitFor(() => expect(tx.priceCheck).toHaveBeenCalled(), { timeout: 4000 });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
