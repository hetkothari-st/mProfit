import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useScrollFade } from '@/hooks/useScrollFade';
import { cn } from '@/lib/cn';

type ScrollTabsProps = Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  children: React.ReactNode;
  /** Changes when the open tab changes, so it is scrolled into view (e.g. opened from a link). */
  activeKey?: string;
};

/**
 * A tab strip that scrolls sideways when the tabs do not fit.
 *
 * The scrollbar is hidden to keep the strip tidy, which on a desktop left no
 * sign that it scrolled at all: tabs past the right edge were simply gone. So
 * it gets what a mouse user needs — arrow buttons while tabs are hidden on a
 * side, the mouse wheel turning into sideways scroll, and the open tab scrolled
 * into view. A phone still swipes, with the edge fade from `useScrollFade`.
 */
export function ScrollTabs({ children, activeKey, className, ...navProps }: ScrollTabsProps) {
  const ref = React.useRef<HTMLElement>(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);
  useScrollFade(ref);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 2);
      setCanRight(max > 2 && el.scrollLeft < max - 2);
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
  }, []);

  // The wheel scrolls the strip sideways while it can, and hands over to the
  // page at either end. Not passive: it has to be able to cancel the page scroll.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // already sideways (trackpad)
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  React.useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeKey]);

  const by = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const left = Math.max(0, el.scrollLeft + direction * Math.max(160, el.clientWidth * 0.6));
    if (el.scrollTo) el.scrollTo({ left, behavior: 'smooth' });
    else el.scrollLeft = left;
  };

  const arrow = 'absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground focus-ring';

  return (
    <div className={cn('relative', className)}>
      <nav
        ref={ref}
        className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        {...navProps}
      >
        {children}
      </nav>
      {canLeft && (
        <button type="button" aria-label="Scroll tabs left" onClick={() => by(-1)} className={cn(arrow, 'left-1')}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {canRight && (
        <button type="button" aria-label="Scroll tabs right" onClick={() => by(1)} className={cn(arrow, 'right-1')}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
