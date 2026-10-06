import { useEffect, type RefObject } from 'react';

/**
 * Marks a horizontal scroller with `data-scroll-fade="left|right|both"` while
 * part of its content is hidden off an edge. globals.css fades that edge, so a
 * phone user can see there is more to swipe to (tab rows, tickers, chip strips).
 * Renders nothing extra and does nothing when the content fits.
 *
 * Pass `remountKey` when the scroller only mounts after data loads, so the
 * listener attaches once the element exists.
 */
export function useScrollFade(ref: RefObject<HTMLElement>, remountKey?: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 2;
      const right = max > 2 && el.scrollLeft < max - 2;
      const fade = left && right ? 'both' : left ? 'left' : right ? 'right' : '';
      if (fade) el.dataset.scrollFade = fade;
      else delete el.dataset.scrollFade;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    for (const child of Array.from(el.children)) ro?.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [ref, remountKey]);
}
