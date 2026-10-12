import { sanitiseNextPath } from '@/hooks/useNextPath';
import { isOnboardingUnfinished } from '@/lib/onboardingProgress';

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

/**
 * Where to go once signed in - one decision for finishSignIn and the
 * already-signed-in effect, so neither can override the other:
 * an explicit `?next=` first, then unfinished onboarding (the flag is
 * per-browser, so new accounts must be routed there explicitly), then the
 * page that sent the user to login, then the dashboard.
 */
export function postLoginPath(opts: { nextPath: string | null; userId: string | null | undefined; state: unknown }): string {
  if (opts.nextPath) return opts.nextPath;
  if (isOnboardingUnfinished(opts.userId)) return '/onboarding';
  return fromLocationPath(opts.state) ?? '/dashboard';
}
