// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: toastError }),
}));

// A family member is chosen under "Download reports for".
vi.mock('@/components/reports/useReportSubject', () => ({
  useReportSubject: () => ({
    subject: 'member-2',
    setSubject: vi.fn(),
    options: [
      { value: 'self', label: 'Me' },
      { value: 'member-2', label: 'Asha' },
    ],
    enabled: true,
    params: { subject: 'member-2', familyId: 'fam-1' },
    filenameSuffix: '-asha',
    appendTo: (url: string) => `${url}${url.includes('?') ? '&' : '?'}subject=member-2&familyId=fam-1`,
  }),
}));

const api = vi.hoisted(() => ({
  availableFys: vi.fn(),
  summary: vi.fn(),
  schedule112A: vi.fn(),
  schedule43: vi.fn(),
  grandfathering: vi.fn(),
  putFmvOverride: vi.fn(),
}));
vi.mock('@/api/tax.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/tax.api')>();
  return { ...actual, taxApi: { ...actual.taxApi, ...api } };
});

const { TaxPage } = await import('./TaxPage');

const emptyGains = { rows: [], totals: {}, count: 0 };
const grandfathering = {
  rows: [
    {
      isin: 'INE000A01010',
      assetName: 'Old Equity',
      buyDate: '2016-05-01',
      sellDate: '2024-06-01',
      quantity: '10',
      buyAmount: '1000',
      sellAmount: '3000',
      gainLoss: '2000',
      fmvPerUnit: null,
      fmvSource: null,
      fmvTotalBasis: null,
      adjustedCostBasis: null,
      correctedGain: null,
      correctedTaxableGain: null,
      gainDifference: null,
      needsUserInput: true,
      financialYear: '2024-25',
    },
  ],
  summary: { totalCorrectedGain: '2000', totalUncorrectedGain: '2000', totalTaxSaving: '0', rowsNeedingInput: 1 },
  count: 1,
};

const fetchMock = vi.fn();

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1', plan: 'FREE' } as never, accessToken: 't' } as never);
  api.availableFys.mockResolvedValue({ fys: ['2024-25'] });
  api.summary.mockResolvedValue(undefined);
  api.schedule112A.mockResolvedValue(emptyGains);
  api.grandfathering.mockResolvedValue(grandfathering);
  api.schedule43.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(new Response('csv', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TaxPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openTab(label: string) {
  renderPage();
  await waitFor(() => expect(api.availableFys).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: label }));
}

describe('Tax page CSVs follow "Download reports for"', () => {
  it('the ITR-portal CSV asks the subject-aware endpoint for the chosen member', async () => {
    await openTab('Schedule 112A');
    fireEvent.click(await screen.findByRole('button', { name: /ITR-portal CSV/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/api/tax/schedule-112a.csv');
    expect(url).toContain('subject=member-2');
  });

  it('the CSV with FMV carries the chosen member too', async () => {
    await openTab('Grandfathering (112A FMV)');
    fireEvent.click(await screen.findByRole('button', { name: /Schedule 112A CSV \(with FMV\)/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]![0])).toContain('subject=member-2');
  });
});

describe('download and save errors', () => {
  it("show the server's message in a toast, not raw JSON in an alert", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'That member is not part of a family you can see.' }), {
        status: 403,
      }),
    );
    await openTab('Schedule 112A');
    fireEvent.click(await screen.findByRole('button', { name: /ITR-portal CSV/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]![0]).toBe('That member is not part of a family you can see.');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a failed FMV save is reported, and the editor stays open', async () => {
    api.putFmvOverride.mockRejectedValue(new Error('fmvPerUnit must be positive'));
    await openTab('Grandfathering (112A FMV)');
    fireEvent.click(await screen.findByRole('button', { name: /Enter FMV/ }));
    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: '✓' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0]![0])).toMatch(/fmvPerUnit must be positive/);
    expect(document.querySelector('input[type="number"]')).toBeTruthy();
  });
});

describe('F&O (Sec. 43(5)) below Pro/Advisor', () => {
  it('shows a plan-lock card instead of a blank tab, and does not call the gated API', async () => {
    await openTab('F&O (Sec. 43(5))');
    expect(await screen.findByText(/F&O \(Sec\. 43\(5\)\) is locked/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Upgrade|View plans/i })).toBeTruthy();
    expect(api.schedule43).not.toHaveBeenCalled();
  });
});
