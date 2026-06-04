import * as React from 'react';
import { cn } from '@/lib/cn';

interface AutoFitTextProps {
  children: React.ReactNode;
  /** Applied to the (clipping) wrapper. Put layout margins here, not on the child. */
  className?: string;
  /** Lower bound on the down-scale so text never becomes unreadable. */
  min?: number;
}

/**
 * Scales its single-line content DOWN (never up) so it always fits the
 * available width — no matter how large the number. Only shrinks when the
 * content would overflow, so on wide containers (desktop) it renders at the
 * natural size and is visually identical to a plain render.
 *
 * Use for money / metric values in fixed-width tiles where the magnitude is
 * unbounded (₹500, ₹5L, ₹50Cr all fit). Keeps full precision — unlike
 * compact notation it never drops digits.
 */
export function AutoFitText({ children, className, min = 0.5 }: AutoFitTextProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLSpanElement>(null);

  const fit = React.useCallback(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    inner.style.transform = 'scale(1)';
    const avail = wrap.clientWidth;
    const need = inner.scrollWidth;
    if (need > 0 && need > avail) {
      inner.style.transform = `scale(${Math.max(min, avail / need)})`;
    }
  }, [min]);

  // Re-fit after every render so changing values (live prices) re-measure.
  React.useLayoutEffect(() => {
    fit();
  });

  // Re-fit when the container resizes (orientation change, layout shifts).
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <div ref={wrapRef} className={cn('min-w-0 overflow-hidden', className)}>
      <span
        ref={innerRef}
        className="inline-block origin-left whitespace-nowrap will-change-transform"
      >
        {children}
      </span>
    </div>
  );
}
