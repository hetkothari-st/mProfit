import { Agent, interceptors } from 'undici';

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
export const followRedirects = new Agent().compose(interceptors.redirect({ maxRedirections: 5 }));
