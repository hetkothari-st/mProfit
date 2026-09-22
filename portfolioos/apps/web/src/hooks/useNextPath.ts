import { useLocation } from 'react-router-dom';

/**
 * Where to go once signing in or signing up is done, when the caller said.
 *
 * Exists because a link can arrive mid-errand. A professional opening an
 * invitation has to make an account before they can accept it, and without
 * this they finish registering, land on the dashboard as a brand-new user with
 * nothing in it, and the invitation is simply lost — the token was only ever
 * in the URL they were bounced away from.
 *
 * Only INTERNAL paths are honoured. `?next=https://elsewhere.example` on a
 * login page is the classic open-redirect: the domain is ours, the login is
 * real, and the victim lands somewhere else with their guard down. A value
 * must start with a single `/` and carry no backslash — `//host` and `/\host`
 * are both read as protocol-relative URLs by browsers.
 */
export function useNextPath(): string | null {
  const { search } = useLocation();
  const raw = new URLSearchParams(search).get('next');
  return sanitiseNextPath(raw);
}

/** Exported for the tests, and for callers that already hold the string. */
export function sanitiseNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  if (raw.includes('\\')) return null;
  return raw;
}
