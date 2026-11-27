// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ list: vi.fn(), ask: vi.fn(), close: vi.fn(), downloadDocument: vi.fn() }));
vi.mock('@/api/caDocumentRequests.api', async (orig) => ({
  ...(await orig<typeof import('@/api/caDocumentRequests.api')>()),
  caDocumentRequestsApi: api,
}));

import { DocumentRequestsPanel } from './DocumentRequestsPanel';

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset().mockResolvedValue(undefined);
  api.list.mockResolvedValue([
    { id: 'r1', clientId: 'c1', title: 'Form 16', note: null, financialYear: '2025-26', dueDate: null, status: 'UPLOADED', documentId: 'd1', clientNote: null, respondedAt: null, createdAt: '2026-11-20T00:00:00Z' },
    { id: 'r2', clientId: 'c1', title: 'Rent receipts', note: null, financialYear: null, dueDate: null, status: 'NOT_APPLICABLE', documentId: null, clientNote: 'I do not pay rent.', respondedAt: null, createdAt: '2026-11-20T00:00:00Z' },
  ]);
});
afterEach(() => cleanup());

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DocumentRequestsPanel clientId="c1" />
    </QueryClientProvider>,
  );
}

describe('DocumentRequestsPanel', () => {
  it('sends a request with the year and date', async () => {
    renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: /document to ask for/i }), { target: { value: 'Bank interest certificate' } });
    fireEvent.change(screen.getByRole('combobox', { name: /financial year/i }), { target: { value: screen.getAllByRole('option')[1]!.getAttribute('value') } });
    fireEvent.change(screen.getByLabelText(/needed by/i), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));
    await waitFor(() =>
      expect(api.ask).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Bank interest certificate', dueDate: '2026-06-30' })),
    );
  });

  it("shows the client's answer and lets the CA download and accept", async () => {
    renderPanel();
    expect(await screen.findByText(/I do not pay rent/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    await waitFor(() => expect(api.downloadDocument).toHaveBeenCalledWith('c1', 'd1', null));
    fireEvent.click(screen.getAllByRole('button', { name: /^accept$/i })[0]!);
    await waitFor(() => expect(api.close).toHaveBeenCalledWith('c1', 'r1', 'ACCEPTED'));
  });
});

describe('DocumentRequestsPanel for a record with no login', () => {
  it('explains instead of offering a request nobody could receive', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <DocumentRequestsPanel clientId="c1" canRequest={false} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/no login to send a request to/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /send request/i })).toBeNull();
  });
});
