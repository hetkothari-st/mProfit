// @vitest-environment jsdom
/**
 * With no boundary anywhere, one render-time throw unmounted the whole app and
 * left a blank white screen.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error('render failed');
  return <p>page content</p>;
}

afterEach(() => {
  cleanup();
  shouldThrow = true;
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows a fallback instead of unmounting everything', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <nav>sidebar</nav>
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('sidebar')).toBeTruthy();
  });

  it('"Try again" re-renders the children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('page content')).toBeTruthy();
  });

  it('clears the error when the route changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    rerender(
      <ErrorBoundary resetKey="/b">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText('page content')).toBeTruthy();
  });
});
