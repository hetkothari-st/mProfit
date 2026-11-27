// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ mine: vi.fn(), upload: vi.fn(), notApplicable: vi.fn() }));
vi.mock('@/api/caDocumentRequests.api', async (orig) => ({
  ...(await orig<typeof import('@/api/caDocumentRequests.api')>()),
  caDocumentRequestsApi: api,
}));

import { MyDocumentRequests } from './MyDocumentRequests';

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset().mockResolvedValue(undefined);
  api.mine.mockResolvedValue([
    { id: 'r1', title: 'Form 16', note: 'From your employer', financialYear: '2025-26', dueDate: '2026-06-15', status: 'OPEN', clientNote: null, documentId: null, createdAt: '2026-11-20T00:00:00Z', askedBy: 'Ramesh Iyer' },
  ]);
});
afterEach(() => cleanup());

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MyDocumentRequests />
    </QueryClientProvider>,
  );
}

describe('MyDocumentRequests', () => {
  it('shows who asked and uploads the chosen file', async () => {
    renderIt();
    expect(await screen.findByText(/Asked by Ramesh Iyer/)).toBeTruthy();
    const file = new File(['%PDF-1.4'], 'form16.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/upload form 16/i), { target: { files: [file] } });
    await waitFor(() => expect(api.upload).toHaveBeenCalledWith('r1', file));
  });

  it("says it doesn't apply, with a reason", async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: /doesn't apply/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /why it doesn't apply/i }), { target: { value: 'Not employed this year' } });
    fireEvent.click(screen.getByRole('button', { name: /tell my ca/i }));
    await waitFor(() => expect(api.notApplicable).toHaveBeenCalledWith('r1', 'Not employed this year'));
  });

  it('shows nothing when nothing is asked', async () => {
    api.mine.mockResolvedValue([]);
    renderIt();
    await waitFor(() => expect(api.mine).toHaveBeenCalled());
    expect(screen.queryByText(/documents your ca asked for/i)).toBeNull();
  });
});
