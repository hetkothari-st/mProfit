import { useEffect } from 'react';

/**
 * Horizontal swipe detection for touch screens, used to open the mobile nav
 * drawer with a swipe right and close it with a swipe left.
 *
 * A swipe counts only when it is clearly horizontal and clearly deliberate,
 * and never when it starts inside something that already uses sideways
 * movement — a table or tab row that scrolls horizontally, a slider, a text
 * field, a chart — so those keep working exactly as before.
 */

/** Minimum horizontal travel, in px. */
export const SWIPE_MIN_DX = 60;
/** Vertical drift allowed, as a fraction of the horizontal travel. */
export const SWIPE_MAX_SLOPE = 0.6;
/** Slower than this is a drag or a read, not a swipe. */
export const SWIPE_MAX_MS = 800;

export interface TouchPoint {
  x: number;
  y: number;
  t: number;
}

export function swipeDirection(start: TouchPoint, end: TouchPoint): 'left' | 'right' | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (end.t - start.t > SWIPE_MAX_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DX) return null;
  if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_SLOPE) return null;
  return dx > 0 ? 'right' : 'left';
}

/** True when the touch began somewhere that owns horizontal gestures itself. */
export function startsInSidewaysControl(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      if (el.dataset.noSwipe !== undefined) return true;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
      const role = el.getAttribute('role');
      if (role === 'slider' || role === 'scrollbar') return true;
      if (el.scrollWidth > el.clientWidth + 1) {
        const overflowX = getComputedStyle(el).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
    }
    // Charts track a finger for their tooltips.
    if (el.classList.contains('recharts-wrapper')) return true;
    el = el.parentElement;
  }
  return false;
}

interface Options {
  /** Listen only while this is true (e.g. phone layout, drawer closed). */
  enabled: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  /** Element to listen on; defaults to the whole document. */
  target?: () => HTMLElement | null;
}

export function useSwipeGesture({ enabled, onSwipe, target }: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const node: HTMLElement | Document = target?.() ?? document;
    let start: TouchPoint | null = null;

    const onStart = (e: Event) => {
      const t = (e as TouchEvent).touches;
      if (t.length !== 1 || startsInSidewaysControl(e.target)) {
        start = null;
        return;
      }
      start = { x: t[0]!.clientX, y: t[0]!.clientY, t: Date.now() };
    };
    const onEnd = (e: Event) => {
      const t = (e as TouchEvent).changedTouches;
      if (!start || t.length !== 1) return;
      const dir = swipeDirection(start, { x: t[0]!.clientX, y: t[0]!.clientY, t: Date.now() });
      start = null;
      if (dir) onSwipe(dir);
    };
    const onCancel = () => {
      start = null;
    };

    // Passive: the gesture is read, never blocked, so page scrolling stays
    // smooth and the browser's own gestures are untouched.
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchend', onEnd, { passive: true });
    node.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, onSwipe, target]);
}
