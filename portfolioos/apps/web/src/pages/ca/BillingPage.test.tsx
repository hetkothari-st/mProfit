// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({
  profile: vi.fn(),
  saveProfile: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  setPaid: vi.fn(),
  cancel: vi.fn(),
  defaults: vi.fn(),
  downloadPdf: vi.fn(),
}));
vi.mock('@/api/caInvoice.api', () => ({ caInvoiceApi: api }));
vi.mock('@/api/ca.api', async (orig) => ({
  ...(await orig<typeof import('@/api/ca.api')>()),
  caApi: { listClients: vi.fn().mockResolvedValue([]) },
}));

import { BillingPage } from './BillingPage';

const profile = { userId: 'u', firmName: 'Iyer & Co.', address: 'Pune', stateCode: '27', gstin: '27AAPFU0939F1ZV', invoicePrefix: 'IC', paymentNote: null };

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset().mockResolvedValue(undefined);
  api.list.mockResolvedValue({
    summary: { billed: '5900.00', paid: '0.00', outstanding: '5900.00' },
    invoices: [
      {
        id: 'i1', clientId: 'c1', number: 'IC/26-27/0001', invoiceDate: '2026-07-20', financialYear: '2026-27',
        seller: { ...profile }, buyerName: 'Asha Verma', buyerAddress: null, buyerGstin: null, placeOfSupply: '27',
        taxable: '5000.00', cgst: '450.00', sgst: '450.00', igst: '0.00', total: '5900.00', status: 'ISSUED',
        paidOn: null, paymentNote: null, lines: [],
      },
    ],
  });
});
afterEach(() => cleanup());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BillingPage', () => {
  it('asks for firm details before the first invoice and rejects a bad GSTIN', async () => {
    api.profile.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText(/before your first invoice/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '27AAPFU0939F1ZW' } });
    expect(screen.getByText('That GSTIN is not valid.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /save firm details/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows billed, received and outstanding, and marks an invoice paid', async () => {
    api.profile.mockResolvedValue(profile);
    renderPage();
    const row = (await screen.findByText('IC/26-27/0001')).closest('tr')!;
    expect(within(row).getByText('Unpaid')).toBeTruthy();
    expect(screen.getByLabelText(/billing summary/i).textContent).toContain('5,900');
    fireEvent.click(within(row).getByRole('button', { name: /mark paid/i }));
    fireEvent.change(within(row).getByLabelText(/paid on/i), { target: { value: '2026-07-25' } });
    fireEvent.click(within(row).getByRole('button', { name: /save/i }));
    await waitFor(() => expect(api.setPaid).toHaveBeenCalledWith('i1', { paid: true, paidOn: '2026-07-25' }));
  });
});
