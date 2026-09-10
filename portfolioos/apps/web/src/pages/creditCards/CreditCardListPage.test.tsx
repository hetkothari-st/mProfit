// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreditCardListPage } from './CreditCardListPage';

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/creditCards.api', () => ({ creditCardsApi: api }));
vi.mock('@/components/reports/DownloadReportButton', () => ({ DownloadReportButton: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  api.list.mockResolvedValue([]);
  api.create.mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreditCardListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Add credit card', () => {
  it('takes the full card number, fills the last 4 from it and sends it to be stored', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /add card/i }))[0]!);

    fireEvent.change(screen.getByLabelText(/issuer bank/i), { target: { value: 'HDFC Bank' } });
    fireEvent.change(screen.getByLabelText(/^card \*/i), { target: { value: 'Infinia' } });
    fireEvent.change(screen.getByLabelText(/full card number/i), {
      target: { value: '4111 1111 1111 1111' },
    });
    expect((screen.getByLabelText(/last 4 digits/i) as HTMLInputElement).value).toBe('1111');
    fireEvent.change(screen.getByLabelText(/credit limit/i), { target: { value: '100000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0]![0]).toMatchObject({
      issuerBank: 'HDFC Bank',
      cardName: 'Infinia',
      last4: '1111',
      cardNumber: '4111111111111111',
    });
  });

  it('leaves the full number out when none is typed', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /add card/i }))[0]!);
    fireEvent.change(screen.getByLabelText(/issuer bank/i), { target: { value: 'HDFC Bank' } });
    fireEvent.change(screen.getByLabelText(/^card \*/i), { target: { value: 'Infinia' } });
    fireEvent.change(screen.getByLabelText(/last 4 digits/i), { target: { value: '4821' } });
    fireEvent.change(screen.getByLabelText(/credit limit/i), { target: { value: '100000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0]![0]).not.toHaveProperty('cardNumber');
    expect(api.create.mock.calls[0]![0]).toMatchObject({ last4: '4821' });
  });
});
