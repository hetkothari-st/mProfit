import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and re-render on match changes.
 *
 * Used to drive layout decisions that can't live purely in CSS — e.g.
 * the sidebar renders label text based on a JS `collapsed` boolean, so
 * we need to know the viewport band in React, not just in Tailwind
 * classes.
 *
 * SSR-safe: returns `false` until mounted on the client, and where
 * `matchMedia` is missing (jsdom).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Sync immediately in case the query changed between render and effect.
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Tailwind's `lg` breakpoint. Above this the full sidebar (with the
// user's expand/collapse preference) is shown; below it the sidebar is
// forced to the icon rail so tablet-portrait content isn't crushed.
export const LG_QUERY = '(min-width: 1024px)';
