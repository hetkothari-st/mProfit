import { sanitiseNextPath } from '@/hooks/useNextPath';

/**
 * Where ProtectedRoute's `state.from` points, with its query string and hash
 * kept - a shared link (e.g. an EMI calculator link) carries its state there.
 * Returns null when there is no usable internal path.
 */
export function fromLocationPath(state: unknown): string | null {
  const from = (state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } } | null)?.from;
  if (!from || typeof from.pathname !== 'string') return null;
  const search = typeof from.search === 'string' ? from.search : '';
  const hash = typeof from.hash === 'string' ? from.hash : '';
  return sanitiseNextPath(from.pathname + search + hash);
}
