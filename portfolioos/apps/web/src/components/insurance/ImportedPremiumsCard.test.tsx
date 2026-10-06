// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ImportSuggestionDTO } from '@/api/insurance.api';
import { ImportedPremiumsCard } from './ImportedPremiumsCard';

const api = vi.hoisted(() => ({
  importSuggestions: vi.fn(),
  linkImportedPremium: vi.fn(),
  dismissImportSuggestion: vi.fn(),
}));
vi.mock('@/api/insurance.api', () => ({ insuranceApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const suggestion: ImportSuggestionDTO = {
  transactionId: 'tx1',
  paidOn: '2025-10-03',
  amount: '25000.00',
  insurer: 'HDFC Life',
  policyNumberLast4: '2345',
  matchedBy: 'POLICY_NUMBER',
  periodFrom: '2025-10-01',
  periodTo: '2026-10-01',
};

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImportedPremiumsCard policyId="pol1" />
    </QueryClientProvider>,
  );
}

describe('ImportedPremiumsCard', () => {
  it('shows what was found and why it matched', async () => {
    api.importSuggestions.mockResolvedValue([suggestion]);
    renderCard();
    expect(await screen.findByText('From your imported statements')).toBeTruthy();
    expect(screen.getByText('HDFC Life · policy no. ending 2345')).toBeTruthy();
    expect(screen.getByText(/Same policy number · for the premium due 1 Oct 2025/)).toBeTruthy();
  });

  it('links a payment to the policy', async () => {
    api.importSuggestions.mockResolvedValue([suggestion]);
    api.linkImportedPremium.mockResolvedValue({});
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /^Link the ₹25,000 paid 3 Oct 2025$/ }));
    await waitFor(() => expect(api.linkImportedPremium).toHaveBeenCalledWith('pol1', 'tx1'));
  });

  it('dismisses one that is not this policy’s', async () => {
    api.importSuggestions.mockResolvedValue([suggestion]);
    api.dismissImportSuggestion.mockResolvedValue(undefined);
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /not this policy/i }));
    await waitFor(() => expect(api.dismissImportSuggestion).toHaveBeenCalledWith('pol1', 'tx1'));
  });

  it('shows nothing when there is nothing to review', async () => {
    api.importSuggestions.mockResolvedValue([]);
    const { container } = renderCard();
    await waitFor(() => expect(api.importSuggestions).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
