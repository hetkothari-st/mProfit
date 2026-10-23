// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: toastError }),
}));

vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: {
    list: vi.fn().mockResolvedValue([
      { id: 'pf-mine', userId: 'u1', name: 'My Portfolio' },
      { id: 'pf-spouse', userId: 'u2', name: "Spouse's Portfolio" },
    ]),
  },
}));

vi.mock('@/api/reports.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reports.api')>();
  return {
    ...actual,
    reportsApi: {
      ...actual.reportsApi,
      summary: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('@/components/reports/DataQualityBanner', () => ({ DataQualityBanner: () => null }));

// Every subject-picker on the page shares one selection: a family member.
const subject = vi.hoisted(() => ({ value: 'u2' }));
vi.mock('@/components/reports/useReportSubject', () => ({
  useReportSubject: () => ({
    subject: subject.value,
    setSubject: vi.fn(),
    options: [
      { value: 'self', label: 'Me' },
      { value: 'u2', label: 'Asha' },
    ],
    enabled: true,
    params: subject.value === 'self' ? {} : { subject: subject.value, familyId: 'fam-1' },
    filenameSuffix: subject.value === 'self' ? '' : '-asha',
    appendTo: (u: string) =>
      subject.value === 'self' ? u : `${u}${u.includes('?') ? '&' : '?'}subject=${subject.value}&familyId=fam-1`,
  }),
}));

const { ReportsPage } = await import('./ReportsPage');

const fetchMock = vi.fn();

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1', plan: 'FREE' } as never, accessToken: 't' } as never);
  fetchMock.mockResolvedValue(new Response('pdf', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  subject.value = 'u2';
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
      <MemoryRouter initialEntries={['/reports?tab=statements']}>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectMyPortfolioAndDownloadHoldings() {
  renderPage();
  await screen.findByRole('option', { name: 'My Portfolio' });
  const picker = screen.getAllByRole('combobox')[0]!;
  fireEvent.change(picker, { target: { value: 'pf-mine' } });
  fireEvent.click(screen.getByRole('button', { name: 'Statements' }));
  const card = (await screen.findAllByRole('heading', { level: 3 }))[0]!.closest('div.rounded-lg, [class*="card"]') as HTMLElement | null;
  const scope = card ?? document.body;
  fireEvent.click(within(scope).getAllByRole('button', { name: /PDF/ })[0]!);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return String(fetchMock.mock.calls[0]![0]);
}

describe('Reports page in a family view', () => {
  it("offers only the caller's own portfolios", async () => {
    renderPage();
    await screen.findByRole('option', { name: 'My Portfolio' });
    expect(screen.queryByRole('option', { name: "Spouse's Portfolio" })).toBeNull();
  });

  it('Statements follow "Report for" and cover all of the member\'s portfolios', async () => {
    const url = await selectMyPortfolioAndDownloadHoldings();
    expect(url).toContain('subject=u2');
    expect(url).toContain('portfolioIds=all');
    expect(url).not.toContain('pf-mine');
  });

  it('Statements for yourself keep the picked portfolio', async () => {
    subject.value = 'self';
    const url = await selectMyPortfolioAndDownloadHoldings();
    expect(url).toContain('portfolioIds=pf-mine');
  });

  it('a failed statement download is a toast with the server message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }));
    await selectMyPortfolioAndDownloadHoldings();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Forbidden'));
  });
});
