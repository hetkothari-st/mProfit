// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClientOverview } from '@/api/caClientList.api';
import { dueLabel } from '@/api/caClientList.api';

const overview = vi.fn();
const setFiling = vi.fn();
vi.mock('@/api/caClientList.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/caClientList.api')>()),
  caClientListApi: {
    overview: (...a: unknown[]) => overview(...a),
    setFiling: (...a: unknown[]) => setFiling(...a),
    downloadCsv: vi.fn(),
  },
}));

import { ClientListTable } from './ClientListTable';

const page: ClientOverview = {
  fy: '2025-26',
  total: 2,
  page: 1,
  limit: 50,
  counts: { NOT_STARTED: 1, DOCS_PENDING: 0, IN_PROGRESS: 0, READY_FOR_REVIEW: 0, FILED: 1, VERIFIED: 0 },
  rows: [
    {
      clientId: 'c1',
      name: 'Asha Verma',
      email: 'asha@example.test',
      panMasked: 'XXXXXX234F',
      access: 'FULL',
      accessUntil: null,
      filing: { financialYear: '2025-26', status: 'NOT_STARTED', itrForm: null, auditApplicable: false, filedOn: null, dueDate: '2026-07-31', daysLeft: -119 },
    },
    {
      clientId: 'c2',
      name: 'Ravi Nair',
      email: null,
      panMasked: null,
      access: 'VIEW',
      accessUntil: null,
      filing: { financialYear: '2025-26', status: 'FILED', itrForm: 'ITR-2', auditApplicable: false, filedOn: '2026-07-20', dueDate: '2026-07-31', daysLeft: null },
    },
  ],
};

beforeEach(() => {
  overview.mockReset().mockResolvedValue(page);
  setFiling.mockReset().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

function renderTable() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ClientListTable onCloseEngagement={() => {}} closing={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ClientListTable', () => {
  it('shows each client with masked PAN, return status and how late it is', async () => {
    renderTable();
    const row = (await screen.findByText('Asha Verma')).closest('tr')!;
    expect(within(row).getByText('XXXXXX234F')).toBeTruthy();
    expect(within(row).getByText('119 days overdue')).toBeTruthy();
    expect(within(row).getByRole('link', { name: /open books/i }).getAttribute('href')).toBe('/ca/clients/c1');
    expect(screen.getByText('Filed 1')).toBeTruthy();
  });

  it('searches on the server as you type', async () => {
    renderTable();
    await screen.findByText('Asha Verma');
    fireEvent.change(screen.getByRole('searchbox', { name: /search clients/i }), { target: { value: 'ravi' } });
    await waitFor(() => expect(overview).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ravi', page: 1 })));
  });

  it('saves a new return status for one client', async () => {
    renderTable();
    const row = (await screen.findByText('Asha Verma')).closest('tr')!;
    fireEvent.change(within(row).getByRole('combobox', { name: /return status for asha verma/i }), {
      target: { value: 'DOCS_PENDING' },
    });
    await waitFor(() => expect(setFiling).toHaveBeenCalledWith('c1', '2025-26', { status: 'DOCS_PENDING' }));
  });
});

describe('dueLabel', () => {
  it('reads days left, today and overdue', () => {
    expect(dueLabel(12)).toBe('12 days left');
    expect(dueLabel(1)).toBe('1 day left');
    expect(dueLabel(0)).toBe('Due today');
    expect(dueLabel(-3)).toBe('3 days overdue');
    expect(dueLabel(null)).toBe('');
  });
});
