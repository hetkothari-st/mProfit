// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { InsuranceDocumentDTO } from '@/api/insurance/insurance.api';
import { InsuranceDocumentsCard } from './InsuranceDocumentsCard';

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  unlockDocument: vi.fn(),
  dismissDocument: vi.fn(),
  approveDocument: vi.fn(),
}));
vi.mock('@/api/insurance/insurance.api', () => ({ insuranceApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const doc = (over: Partial<InsuranceDocumentDTO>): InsuranceDocumentDTO => ({
  id: 'd1',
  fileName: 'policy.pdf',
  fromAddress: 'policy@starhealth.in',
  receivedAt: '2025-04-16T00:00:00.000Z',
  docKind: null,
  status: 'NEEDS_PASSWORD',
  problems: [],
  errorMessage: 'This PDF is password protected.',
  note: null,
  policyId: null,
  policyNumberLast4: null,
  extract: null,
  ...over,
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InsuranceDocumentsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InsuranceDocumentsCard', () => {
  it('asks once per insurer for locked PDFs and remembers by default', async () => {
    api.listDocuments.mockResolvedValue([doc({ id: 'd1' }), doc({ id: 'd2', fileName: 'receipt.pdf' })]);
    api.unlockDocument.mockResolvedValue({ unlocked: 2 });
    renderCard();

    const box = await screen.findByLabelText('2 locked PDFs from starhealth.in');
    fireEvent.change(box, { target: { value: 'star1990' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(api.unlockDocument).toHaveBeenCalledWith('d1', 'star1990', true));
  });

  it('can open without keeping the password', async () => {
    api.listDocuments.mockResolvedValue([doc({})]);
    api.unlockDocument.mockResolvedValue({ unlocked: 1 });
    renderCard();

    fireEvent.change(await screen.findByLabelText('1 locked PDF from starhealth.in'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(api.unlockDocument).toHaveBeenCalledWith('d1', 'pw', false));
  });

  it('offers a found policy to add, and links filed documents to Documents', async () => {
    api.listDocuments.mockResolvedValue([
      doc({
        id: 's1',
        status: 'SUGGESTED',
        docKind: 'POLICY_DOCUMENT',
        policyNumberLast4: '2024',
        errorMessage: null,
        extract: {
          insurer: 'Star Health',
          policy_type: 'HEALTH',
          plan_name: 'Family Health Optima',
          policy_holder: 'Test User',
          sum_assured: '500000.00',
          premium_amount: '24000.00',
          premium_frequency: 'ANNUAL',
          start_date: '2024-04-10',
          end_date: null,
          next_premium_due: null,
          premium_paid_amount: null,
          premium_paid_on: null,
        },
      }),
      doc({ id: 'f1', status: 'FILED', policyId: 'p1', errorMessage: null, note: 'Linked to the policy.' }),
    ]);
    renderCard();

    expect(await screen.findByText('Star Health — Family Health Optima')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Review and add/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Filed in Documents under the policy holder' }).getAttribute('href')).toBe(
      '/documents',
    );
  });
});
