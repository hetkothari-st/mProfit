// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AIAssistant } from './AIAssistant';

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function scrollTo() {};
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const disclosure = vi.hoisted(() => ({ state: { status: 'needed', accept: async () => undefined } as Record<string, unknown> }));
vi.mock('@/hooks/useAiDisclosure', () => ({ useAiDisclosure: () => disclosure.state }));
vi.mock('@/hooks/useAIAssistant', () => ({
  useAIAssistant: () => ({
    sessions: [],
    activeSessionId: 's1',
    messages: [],
    isStreaming: false,
    error: null,
    suggestedQuestions: [],
    quota: { used: 1, limit: 20 },
    loadingHistory: false,
    sendMessage: vi.fn(),
    newChat: vi.fn(),
    switchSession: vi.fn(),
    removeSession: vi.fn(),
    renameChat: vi.fn(),
  }),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'u1', name: 'Het Kothari' } }),
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const renderPanel = () =>
  render(
    <MemoryRouter>
      <AIAssistant open onClose={vi.fn()} pendingPrompt={null} />
    </MemoryRouter>,
  );

describe('AIAssistant and the AI-use notice', () => {
  it('shows the notice instead of the chat until it is accepted', () => {
    disclosure.state = { status: 'needed', accept: async () => undefined };
    renderPanel();
    expect(screen.getByRole('button', { name: /I understand/i })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the chat once accepted, with a footer link to how AI is used', () => {
    disclosure.state = { status: 'ok', accept: async () => undefined };
    renderPanel();
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByRole('link', { name: /how we use AI/i }).getAttribute('href')).toBe('/legal/ai-use');
    expect(screen.queryByText(/Not investment advice/)).toBeNull();
  });
});
