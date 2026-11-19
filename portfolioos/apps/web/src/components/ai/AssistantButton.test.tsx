// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantButton } from './AssistantButton';

// The AI feature is off by default on the server. The launcher used to show
// regardless, and every tap ended in an error.
const api = vi.hoisted(() => ({
  status: vi.fn(async () => ({ enabled: false })),
  suggested: vi.fn(async () => []),
}));
vi.mock('@/api/aiAssistant.api', () => ({ aiAssistantApi: api }));
// The panel itself is out of scope here.
vi.mock('./AIAssistant', () => ({ AIAssistant: () => null }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssistantButton />
    </QueryClientProvider>,
  );
}

describe('AssistantButton', () => {
  it('is hidden when the server reports the assistant disabled', async () => {
    api.status.mockResolvedValueOnce({ enabled: false });
    renderButton();
    await waitFor(() => expect(api.status).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).toBeNull();
    expect(api.suggested).not.toHaveBeenCalled();
  });

  it('shows when the server reports it enabled', async () => {
    api.status.mockResolvedValueOnce({ enabled: true });
    renderButton();
    expect(await screen.findByRole('button', { name: /open ai assistant/i })).toBeTruthy();
  });

  describe('teaser bubble over page content', () => {
    afterEach(() => {
      vi.useRealTimers();
      window.sessionStorage.clear();
      document.querySelectorAll('main').forEach((m) => m.remove());
    });

    async function enabledWithFakeTimers() {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.status.mockResolvedValue({ enabled: true });
      api.suggested.mockResolvedValue([]);
      renderButton();
      await screen.findByRole('button', { name: /open ai assistant/i });
    }

    it('keeps rotating a new question every 12s so users keep discovering the feature', async () => {
      api.status.mockResolvedValue({ enabled: true });
      api.suggested.mockResolvedValue([{ question: 'First question?' }, { question: 'Second question?' }] as never);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderButton();
      await screen.findByRole('button', { name: /open ai assistant/i });

      await act(async () => { await vi.advanceTimersByTimeAsync(6_500); });
      expect(screen.getByText(/try asking/i)).toBeTruthy();
      expect(screen.getByText(/First question\?/)).toBeTruthy();

      await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
      expect(screen.getByText(/Second question\?/)).toBeTruthy();

      // Many rotations later it is still there, not retired.
      await act(async () => { await vi.advanceTimersByTimeAsync(12_000 * 10); });
      expect(screen.getByText(/try asking/i)).toBeTruthy();
    });

    it('steps aside while the page is scrolled down, on desktop too, and returns on scroll up', async () => {
      const main = document.createElement('main');
      document.body.appendChild(main);
      await enabledWithFakeTimers();
      expect(screen.getByText(/meet your portfolio assistant/i)).toBeTruthy();

      main.scrollTop = 300;
      act(() => { fireEvent.scroll(main); });
      expect(screen.queryByText(/meet your portfolio assistant/i)).toBeNull();
      // The 48px launcher stays put on desktop; only the wide bubble moves.
      expect(screen.getByRole('button', { name: /open ai assistant/i })).toBeTruthy();

      main.scrollTop = 100;
      act(() => { fireEvent.scroll(main); });
      expect(screen.getByText(/meet your portfolio assistant/i)).toBeTruthy();
    });
  });
});
