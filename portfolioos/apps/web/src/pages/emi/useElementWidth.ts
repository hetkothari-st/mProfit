import { useCallback, useLayoutEffect, useState } from 'react';

/**
 * Width of an element, kept current with ResizeObserver. Measured once in a
 * layout effect as soon as the element mounts, so the first paint already uses
 * the right layout (no narrow-then-wide flicker when data is cached). Returns 0
 * until measured and where layout is unavailable (jsdom), so callers fall back
 * to their narrow layout.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, width];
}

/**
 * Room one whole-rupee crore figure needs in a text-sm table cell, padding
 * included (measured: "₹99,24,00,560" clips below ~92 px).
 */
export const PX_PER_MONEY_COLUMN = 96;
