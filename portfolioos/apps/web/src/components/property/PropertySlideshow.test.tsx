// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertySlideshow } from './PropertySlideshow';

const api = vi.hoisted(() => ({ image: vi.fn() }));
vi.mock('@/api/propertyMedia.api', () => ({ propertyPhotosApi: api }));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
  api.image.mockResolvedValue(new Blob(['img'], { type: 'image/webp' }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  // jsdom has no matchMedia; a test may have added one.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

// Cards link to the property; moving through photos must not open it.
function renderInCard(photoIds: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/list']}>
        <Routes>
          <Route
            path="/list"
            element={
              <Link to="/property">
                <PropertySlideshow photoIds={photoIds} className="h-40" />
              </Link>
            }
          />
          <Route path="/property" element={<div>PROPERTY PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const at = (n: number, of: number) => screen.getByText(`Photo ${n} of ${of}`);

describe('PropertySlideshow', () => {
  it('steps through the photos with its arrows, wrapping round, without opening the property', () => {
    renderInCard(['p1', 'p2', 'p3']);
    expect(at(1, 3)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(at(2, 3)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(at(3, 3)).toBeTruthy();
    expect(screen.queryByText('PROPERTY PAGE')).toBeNull();
  });

  it('jumps to a photo from its dot', () => {
    renderInCard(['p1', 'p2', 'p3']);
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 3' }));
    expect(at(3, 3)).toBeTruthy();
    expect(screen.queryByText('PROPERTY PAGE')).toBeNull();
  });

  it('moves on by itself every few seconds, and pauses while pointed at', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    renderInCard(['p1', 'p2', 'p3']);
    act(() => vi.advanceTimersByTime(7000));
    expect(at(2, 3)).toBeTruthy();

    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Photos' }));
    act(() => vi.advanceTimersByTime(15000));
    expect(at(2, 3)).toBeTruthy();
  });

  it('stays still for people who prefer reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    renderInCard(['p1', 'p2', 'p3']);
    act(() => vi.advanceTimersByTime(20000));
    expect(at(1, 3)).toBeTruthy();
  });

  it('loads only the photo shown and the next one', () => {
    renderInCard(['p1', 'p2', 'p3', 'p4']);
    const loaded = api.image.mock.calls.map((c) => c[0]);
    expect(new Set(loaded)).toEqual(new Set(['p1', 'p2']));
  });

  it('is a plain photo when there is only one', () => {
    renderInCard(['p1']);
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Show photo/ })).toBeNull();
  });
});
