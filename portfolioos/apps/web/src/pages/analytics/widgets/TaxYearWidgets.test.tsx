// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdvanceTaxCard } from './TaxYearWidgets';
import { currentFy } from '../financialYear';
import type { AdvanceTaxReport } from '@/api/tax.api';

if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const api = vi.hoisted(() => ({ advance: vi.fn(), availableFys: vi.fn() }));
vi.mock('@/api/tax.api', () => ({ taxApi: api }));

function report(over: Partial<AdvanceTaxReport> = {}): AdvanceTaxReport {
  return {
    financialYear: currentFy(),
    totalTax: '100000',
    payableNow: '100000',
    estimatedInterest: '0',
    belowThreshold: false,
    bookedGains: '400000',
    slabPct: 30,
    slabIsEstimate: false,
    components: { stcgEquity: '0', ltcgEquity: '0', ltcgOther: '0', stcgOther: '0', intraday: '0', crypto: '0' },
    asOf: '2026-09-18',
    instalments: [
      { label: '15 June', dueDate: '2026-06-15', cumulativePct: 15, cumulativeDue: '15000', shortfall: '15000', interest: '450', status: 'due' },
      { label: '15 September', dueDate: '2026-09-15', cumulativePct: 45, cumulativeDue: '45000', shortfall: '45000', interest: '1350', status: 'due' },
      { label: '15 December', dueDate: '2026-12-15', cumulativePct: 75, cumulativeDue: '75000', shortfall: '75000', interest: '0', status: 'upcoming' },
      { label: '15 March', dueDate: '2027-03-15', cumulativePct: 100, cumulativeDue: '100000', shortfall: '100000', interest: '0', status: 'upcoming' },
    ],
    ...over,
  };
}

beforeEach(() => {
  api.availableFys.mockResolvedValue({ fys: [currentFy(), '2025-26'] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCard(fy = currentFy()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdvanceTaxCard fy={fy} />
    </QueryClientProvider>,
  );
}

describe('AdvanceTaxCard', () => {
  it('leads with the amount and shows all four instalment dates', async () => {
    api.advance.mockResolvedValue(report());
    renderCard();
    expect(await screen.findByText(/you owe about/)).toBeTruthy();
    // The same figure appears in the sentence and on the March instalment.
    expect(screen.getAllByText('₹1,00,000.00').length).toBeGreaterThan(0);
    // Month abbreviation is the runtime's ("Sept" on this ICU), so match loosely.
    for (const d of [/15 Jun 2026/, /15 Sept? 2026/, /15 Dec 2026/, /15 Mar 2027/]) {
      expect(screen.getByText(d), String(d)).toBeTruthy();
    }
  });

  it('flags missed instalments and the interest they carry', async () => {
    api.advance.mockResolvedValue(report({ estimatedInterest: '1800' }));
    renderCard();
    expect(await screen.findByText(/Missed · ₹450.00 interest/)).toBeTruthy();
    expect(screen.getByText(/1,800.00 of interest/)).toBeTruthy();
  });

  // Sec 208: below ₹10,000 there is nothing to pay in instalments at all.
  it('says instalments do not apply below the threshold', async () => {
    api.advance.mockResolvedValue(report({ totalTax: '4200', belowThreshold: true }));
    renderCard();
    expect(await screen.findByText(/nothing to pay in instalments/)).toBeTruthy();
    expect(screen.queryByText('15 Jun 2026')).toBeNull();
  });

  it('says so plainly when no gains were booked', async () => {
    api.advance.mockResolvedValue(report({ totalTax: '0', belowThreshold: true, bookedGains: '0' }));
    renderCard();
    expect(await screen.findByText(/no gains have been booked/)).toBeTruthy();
  });

  // Zero tax and zero gains are different. A long-term gain inside the ₹1.25L
  // exemption produces no tax, and saying "no gains" there contradicts the
  // harvest card sitting directly below this one.
  it('distinguishes no tax from no gains', async () => {
    api.advance.mockResolvedValue(report({ totalTax: '0', belowThreshold: true, bookedGains: '14600' }));
    renderCard();
    expect(await screen.findByText(/covered by exemptions and set-off/)).toBeTruthy();
    expect(screen.queryByText(/no gains have been booked/)).toBeNull();
  });

  it('names the assumed slab rate only when it is assumed', async () => {
    api.advance.mockResolvedValue(report({ slabIsEstimate: true }));
    renderCard();
    expect(await screen.findByText(/assume 30%/)).toBeTruthy();
  });

  it('is scoped to investment income, and says so', async () => {
    api.advance.mockResolvedValue(report());
    renderCard();
    expect(await screen.findByText(/Salary, TDS already deducted/)).toBeTruthy();
  });
});
