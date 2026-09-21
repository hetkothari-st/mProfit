// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AIAssistant } from './AIAssistant';

// jsdom implements neither of these; the panel scrolls itself to the newest
// message on render.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const hook = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/hooks/useAIAssistant', () => ({ useAIAssistant: () => hook.state }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'u1', name: 'Het Kothari' } }),
}));

beforeEach(() => {
  localStorage.clear();
  hook.state = {
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
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel() {
  return render(
    <MemoryRouter>
      <AIAssistant open onClose={vi.fn()} pendingPrompt={null} />
    </MemoryRouter>,
  );
}

const panel = () => screen.getByRole('dialog', { name: 'EveryPaisa Assistant' });
const expandButton = () => screen.getByRole('button', { name: /Expand the assistant/i });
const shrinkButton = () => screen.getByRole('button', { name: /Shrink the assistant/i });

describe('AIAssistant expand', () => {
  it('starts docked in the corner', () => {
    renderPanel();
    expect(panel().className).toContain('sm:bottom-24');
    expect(expandButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('expands to a wide window and remembers it', () => {
    renderPanel();
    fireEvent.click(expandButton());
    expect(panel().className).toContain('sm:inset-6');
    expect(panel().className).not.toContain('sm:bottom-24');
    expect(shrinkButton().getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('assistant_expanded')).toBe('1');
  });

  it('opens expanded when that is how it was left', () => {
    localStorage.setItem('assistant_expanded', '1');
    renderPanel();
    expect(panel().className).toContain('sm:inset-6');
  });

  it('shrinks back, and forgets the preference', () => {
    localStorage.setItem('assistant_expanded', '1');
    renderPanel();
    fireEvent.click(shrinkButton());
    expect(panel().className).toContain('sm:bottom-24');
    expect(localStorage.getItem('assistant_expanded')).toBeNull();
  });

  // The app behind has to stay visible — that was the point of expanding
  // rather than going full-screen.
  it('dims the page behind without covering it, and clicking it shrinks back', () => {
    renderPanel();
    fireEvent.click(expandButton());
    const backdrop = document.querySelector('[aria-hidden].fixed.inset-0');
    expect(backdrop).toBeTruthy();
    expect(backdrop!.className).toContain('bg-foreground/20');
    fireEvent.click(backdrop!);
    expect(panel().className).toContain('sm:bottom-24');
  });

  it('Escape shrinks first and only then closes', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AIAssistant open onClose={onClose} pendingPrompt={null} />
      </MemoryRouter>,
    );
    fireEvent.click(expandButton());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(panel().className).toContain('sm:bottom-24');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
