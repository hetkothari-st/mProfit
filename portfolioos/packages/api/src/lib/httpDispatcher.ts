import { Agent, interceptors } from 'undici';

/**
 * Upper bounds for every outbound call. undici's defaults are 300 s for headers
 * and 300 s between body chunks, so a stalled upstream held a request (or a
 * cron tick) for five minutes or more. `bodyTimeout` is the gap between chunks,
 * not the whole download, so large files such as the AMFI NAV dump are fine.
 */
export const OUTBOUND_TIMEOUTS = {
  connect: { timeout: 10_000 },
  headersTimeout: 30_000,
  bodyTimeout: 60_000,
} as const;

/** For `fetch()` calls: abort after this long (pass `AbortSignal.timeout(...)`). */
export const OUTBOUND_FETCH_TIMEOUT_MS = 30_000;

export function createBoundedAgent(opts: Partial<Agent.Options> = {}): Agent {
  return new Agent({ ...OUTBOUND_TIMEOUTS, ...opts });
}

/**
 * Dispatcher for outbound `request()` calls that do not follow redirects.
 *
 * Passing one explicitly also keeps the call off undici's *global* dispatcher,
 * which Node's built-in fetch replaces with its own bundled undici on first use
 * (see `followRedirects` below for what that broke).
 */
export const boundedAgent = createBoundedAgent();

/**
 * Dispatcher for outbound `request()` calls that should follow redirects.
 *
 * `request(url, { maxRedirections })` goes through undici's global
 * dispatcher, and Node's built-in fetch registers its own (bundled undici)
 * global dispatcher the first time anything calls fetch. On Node 22+ that is
 * undici v7, which rejects `maxRedirections` outright ("maxRedirections is
 * not supported, use the redirect interceptor"), so every AMFI/NSE/BSE fetch
 * failed once any fetch() had run. Production is on Node 20 today, which hid
 * it; an image bump would have broken the price feeds.
 *
 * An Agent built from the undici package itself, composed with the redirect
 * interceptor, behaves the same on every Node version.
 */
export const followRedirects = createBoundedAgent().compose(interceptors.redirect({ maxRedirections: 5 }));
