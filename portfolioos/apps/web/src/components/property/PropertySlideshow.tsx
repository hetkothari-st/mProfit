import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePhotoUrl } from './usePhotoUrl';

const DEFAULT_INTERVAL_MS = 5000;

/** A per-card offset (0–1.5 s) so a page of cards doesn't flip in unison. */
function staggerMs(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 1500;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function Slide({ photoId, active }: { photoId: string; active: boolean }) {
  const url = usePhotoUrl(photoId, 'thumb');
  const [loaded, setLoaded] = useState(false);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      onLoad={() => setLoaded(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
        active && loaded ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}

/**
 * A card's photos as a slideshow: cross-fades every few seconds, pauses while
 * pointed at or focused, and stays still for reduced-motion users. Arrows and
 * dots move by hand without opening the card's link. Only the photo shown and
 * the next one are fetched; the rest load as the show reaches them.
 */
export function PropertySlideshow({
  photoIds,
  className = '',
  interval = DEFAULT_INTERVAL_MS,
}: {
  photoIds: string[];
  className?: string;
  interval?: number;
}) {
  const count = photoIds.length;
  const listKey = photoIds.join(',');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);
  // Slides mounted so far: kept so a cross-fade has both images, and grown
  // only as the show approaches each photo.
  const [mounted, setMounted] = useState<ReadonlySet<number>>(() => new Set(count > 1 ? [0, 1] : [0]));

  // A different set of photos starts over.
  useEffect(() => {
    setIndex(0);
    setMounted(new Set(count > 1 ? [0, 1] : [0]));
  }, [listKey, count]);

  useEffect(() => {
    if (count === 0) return;
    const next = (index + 1) % count;
    setMounted((m) => (m.has(index) && m.has(next) ? m : new Set([...m, index, next])));
  }, [index, count]);

  // Auto-advance; restarts after every step, manual ones included.
  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), interval + staggerMs(photoIds[0]!));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photoIds is represented by listKey
  }, [index, count, paused, reducedMotion, interval, listKey]);

  const go = (e: MouseEvent, to: number) => {
    // The card is a link; moving through photos mustn't open it.
    e.preventDefault();
    e.stopPropagation();
    setIndex(((to % count) + count) % count);
  };

  const control =
    'grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80';

  return (
    <div
      role="group"
      aria-label="Photos"
      aria-roledescription="carousel"
      className={`group/slides relative overflow-hidden bg-muted ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="absolute inset-0 animate-pulse bg-muted" />
      {photoIds.map((id, i) => (mounted.has(i) ? <Slide key={id} photoId={id} active={i === index} /> : null))}

      {count > 1 && (
        <>
          <span className="sr-only">
            Photo {index + 1} of {count}
          </span>
          <div className="pointer-events-none absolute inset-y-0 left-2 right-2 z-10 flex items-center justify-between opacity-0 transition-opacity duration-200 group-hover/slides:opacity-100 group-focus-within/slides:opacity-100">
            <button type="button" aria-label="Previous photo" onClick={(e) => go(e, index - 1)} className={`pointer-events-auto ${control}`}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Next photo" onClick={(e) => go(e, index + 1)} className={`pointer-events-auto ${control}`}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="absolute inset-x-0 bottom-2.5 z-10 flex justify-center gap-1">
            {photoIds.map((id, i) => (
              <button
                key={id}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                onClick={(e) => go(e, i)}
                className={`h-1.5 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] transition-all duration-300 ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
