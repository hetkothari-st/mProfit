// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
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
});
