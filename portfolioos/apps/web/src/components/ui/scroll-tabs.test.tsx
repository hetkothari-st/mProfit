// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ScrollTabs } from './scroll-tabs';

/** jsdom lays nothing out, so the scroller's geometry is supplied by hand. */
let scrollLeft = 0;
const scrollTo = vi.fn();

beforeEach(() => {
  scrollLeft = 0;
  scrollTo.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 });
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (v: number) => {
      scrollLeft = v;
    },
  });
  HTMLElement.prototype.scrollTo = scrollTo as never;
});
afterEach(() => cleanup());

function renderTabs() {
  render(
    <ScrollTabs aria-label="Sections" activeKey="a">
      <button aria-current="page">Chart of accounts</button>
      <button>Vouchers</button>
      <button>Documents</button>
    </ScrollTabs>,
  );
  return screen.getByRole('navigation', { name: 'Sections' });
}

describe('ScrollTabs', () => {
  it('shows a right arrow only while tabs are hidden to the right, and scrolls on click', () => {
    renderTabs();
    expect(screen.queryByRole('button', { name: /scroll tabs left/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /scroll tabs right/i }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number), behavior: 'smooth' }));
    expect(scrollTo.mock.calls[0]![0].left).toBeGreaterThan(0);
  });

  it('shows a left arrow once scrolled away from the start, and drops the right one at the end', () => {
    const nav = renderTabs();
    act(() => {
      scrollLeft = 600; // the end: 900 - 300
      fireEvent.scroll(nav);
    });
    expect(screen.getByRole('button', { name: /scroll tabs left/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /scroll tabs right/i })).toBeNull();
  });

  it('turns the mouse wheel into sideways scrolling, and lets the page scroll at the ends', () => {
    const nav = renderTabs();
    const down = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
    act(() => {
      nav.dispatchEvent(down);
    });
    expect(scrollLeft).toBe(120);
    expect(down.defaultPrevented).toBe(true);

    scrollLeft = 0;
    const up = new WheelEvent('wheel', { deltaY: -120, cancelable: true, bubbles: true });
    act(() => {
      nav.dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(false); // already at the start: the page keeps its scroll
  });
});
