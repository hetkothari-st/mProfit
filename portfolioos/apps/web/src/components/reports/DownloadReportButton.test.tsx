// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: toastError }),
}));

const download = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDownloadReport', () => ({
  useDownloadReport: () => ({ download, loading: false }),
}));

// Family view: the list carries the caller's book and a spouse's.
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: {
    list: vi.fn().mockResolvedValue([
      { id: 'pf-mine', userId: 'u1', name: 'My Portfolio' },
      { id: 'pf-spouse', userId: 'u2', name: "Spouse's Portfolio" },
    ]),
  },
}));

const subject = vi.hoisted(() => ({ value: 'self' }));
vi.mock('./useReportSubject', () => ({
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
    appendTo: (u: string) => u,
  }),
}));

const { DownloadReportButton } = await import('./DownloadReportButton');

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1', plan: 'FREE' } as never });
  download.mockResolvedValue(undefined);
  subject.value = 'self';
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DownloadReportButton type="holdings" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openAndDownload() {
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: /Download/ }));
  await screen.findByText('Download Report');
  // Let the portfolio list arrive.
  await waitFor(() => expect(screen.queryAllByRole('option').length).toBeGreaterThan(0));
  const buttons = screen.getAllByRole('button', { name: /Download/ });
  fireEvent.click(buttons[buttons.length - 1]!);
  await waitFor(() => expect(download).toHaveBeenCalled());
  return download.mock.calls[0]![1] as Record<string, unknown>;
}

describe('holdings Download Report dialog', () => {
  it('"All portfolios" asks for all, not every id in a family-view list', async () => {
    const params = await openAndDownload();
    expect(params.portfolioIds).toEqual(['all']);
  });

  it("offers only the caller's own portfolios", async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    await screen.findByRole('option', { name: 'My Portfolio' });
    expect(screen.queryByRole('option', { name: "Spouse's Portfolio" })).toBeNull();
  });

  it("for a member, covers all of that member's portfolios", async () => {
    subject.value = 'u2';
    const params = await openAndDownload();
    expect(params.portfolioIds).toEqual(['all']);
    expect(params.subject).toBe('u2');
  });

  it('shows a failed download as a toast with the server message', async () => {
    download.mockRejectedValue(new Error('The holdings export covers one person'));
    await openAndDownload();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]![0]).toBe('The holdings export covers one person');
  });
});
