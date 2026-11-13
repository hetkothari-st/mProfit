import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { robotsAllows } from './robots.js';
import { READER_URLS } from './sources/index.js';

/** Plain, honest agent string naming the app; no browser impersonation. */
export const LOAN_RATES_USER_AGENT = 'EveryPaisa/1.0 (loan-rate reader; one request per page per day)';
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

export type FetchPageErrorCode =
  | 'NOT_ALLOWED'
  | 'ROBOTS_DISALLOWED'
  | 'ROBOTS_UNAVAILABLE'
  | 'HTTP_STATUS'
  | 'TOO_LARGE'
  | 'TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'NETWORK';

export class FetchPageError extends Error {
  constructor(
    readonly code: FetchPageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FetchPageError';
  }
}

/** The transport. Production uses a guarded undici fetch; tests pass a function that returns canned Responses. */
export type HttpGet = (url: string, init: RequestInit) => Promise<Response>;

export interface FetchPageOptions {
  /** Exact URLs that may be fetched. Defaults to the reader URLs; nothing user-supplied ever gets here. */
  allowList?: ReadonlySet<string>;
  get?: HttpGet;
  timeoutMs?: number;
  maxBytes?: number;
  /** robots.txt per origin, shared across one run so each host's file is fetched once. */
  robotsCache?: Map<string, string>;
  /** Test-only: skip the private-address guard of the default transport (local test servers run on 127.0.0.1). */
  allowPrivateHosts?: boolean;
}

/**
 * True for anything that is not a plain public unicast address: loopback, private, link-local, unspecified,
 * carrier-grade NAT (100.64/10), benchmarking (198.18/15), multicast, reserved and broadcast (224/4 and up),
 * unique-local and multicast IPv6, and IPv6 forms that embed an IPv4 address (::a.b.c.d, ::ffff:a.b.c.d,
 * 64:ff9b::/96 NAT64, 2002::/16 6to4) when the embedded address is one of those.
 */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip.split('.').map((x) => Number.parseInt(x, 10)));
  if (kind !== 6) return true; // not an IP at all: refuse
  const groups = expandV6(ip);
  if (groups.every((g, i) => (i < 7 ? g === 0 : g <= 1))) return true; // :: and ::1
  const first = groups[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  const v4 = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  const zeros = (from: number, to: number) => groups.slice(from, to).every((g) => g === 0);
  if (zeros(0, 5) && groups[5] === 0xffff) return isPrivateV4(v4(groups[6]!, groups[7]!)); // ::ffff:a.b.c.d
  if (zeros(0, 6)) return isPrivateV4(v4(groups[6]!, groups[7]!)); // ::a.b.c.d (IPv4-compatible)
  if (first === 0x64 && groups[1] === 0xff9b && zeros(2, 6)) return isPrivateV4(v4(groups[6]!, groups[7]!)); // NAT64
  if (first === 0x2002) return isPrivateV4(v4(groups[1]!, groups[2]!)); // 6to4
  return false;
}

function isPrivateV4(o: number[]): boolean {
  const [a, b] = o as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function expandV6(ip: string): number[] {
  let text = ip.split('%')[0]!;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map((x) => Number.parseInt(x, 10)) as [number, number, number, number];
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : new Array<string>(8 - h.length - t.length).fill('0');
  return [...h, ...fill, ...t].map((g) => Number.parseInt(g, 16));
}

/** A transport whose DNS lookup refuses private addresses, so a public name that resolves inward is not fetched. */
const guardedAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return callback(err, '', 4);
        const list = addrs as { address: string; family: number }[];
        if (list.some((a) => isPrivateAddress(a.address))) {
          return callback(new FetchPageError('NOT_ALLOWED', `${hostname} resolves to a private address`), '', 4);
        }
        if (options.all) return (callback as unknown as (e: null, a: unknown) => void)(null, list);
        return callback(null, list[0]!.address, list[0]!.family);
      });
    },
  },
});
const guardedGet: HttpGet = (u, init) => undiciFetch(u, { ...init, dispatcher: guardedAgent } as never) as unknown as Promise<Response>;
const openGet: HttpGet = (u, init) => fetch(u, init);

/** Path-only form of a URL for messages: never echoes credentials, queries or a hostile Location in full. */
function safeUrl(u: URL): string {
  return u.origin + u.pathname;
}

async function cancelBody(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined); // releasing the stream; nothing useful to do on failure
}

/**
 * GET one allow-listed page as text. Refuses anything not on the list, follows at most five redirects, each re-checked
 * (https, same host as the original, exact allow-list entry, robots.txt), stops after `timeoutMs` and refuses
 * bodies over `maxBytes` without buffering them. The body is returned as text; nothing in it is executed.
 */
export async function fetchPage(url: string, opts: FetchPageOptions = {}): Promise<string> {
  const allowList = opts.allowList ?? READER_URLS;
  if (!allowList.has(url)) throw new FetchPageError('NOT_ALLOWED', `Not an allow-listed loan-rate page: ${url}`);
  const literal = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (!opts.allowPrivateHosts && isIP(literal) !== 0 && isPrivateAddress(literal)) {
    throw new FetchPageError('NOT_ALLOWED', `${literal} is a private address`);
  }
  const get = opts.get ?? (opts.allowPrivateHosts ? openGet : guardedGet);
  const allowedHosts = new Set([...allowList].map((u) => new URL(u).host));
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BODY_BYTES;
  const signal = AbortSignal.timeout(timeoutMs);
  const robotsCache = opts.robotsCache ?? new Map<string, string>();

  const origin = new URL(url);
  let current = origin;
  for (let hop = 0; ; hop++) {
    // Every hop (the first included) is robots-checked; redirect targets are vetted below before the next loop.
    await assertRobotsAllow(current, get, signal, robotsCache, maxBytes, allowedHosts);
    const res = await request(get, current, signal, 'text/html,application/xhtml+xml');
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      await cancelBody(res);
      if (hop >= MAX_REDIRECTS) throw new FetchPageError('TOO_MANY_REDIRECTS', `More than ${MAX_REDIRECTS} redirects from ${safeUrl(origin)}`);
      const next = parseRedirect(res.headers.get('location')!, current);
      const sameSite =
        next.protocol === 'https:' &&
        next.username === '' &&
        next.password === '' &&
        next.port === '' &&
        next.host === origin.host &&
        isIP(next.hostname.replace(/^\[|\]$/g, '')) === 0;
      if (!sameSite || !allowList.has(next.toString())) {
        throw new FetchPageError('NOT_ALLOWED', `Redirect to ${safeUrl(next)} is not an allow-listed page`);
      }
      current = next;
      continue;
    }
    if (!res.ok) {
      await cancelBody(res);
      throw new FetchPageError('HTTP_STATUS', `HTTP ${res.status} for ${safeUrl(current)}`);
    }
    return readCapped(res, maxBytes, safeUrl(current), signal);
  }
}

function parseRedirect(location: string, base: URL): URL {
  try {
    return new URL(location, base);
  } catch {
    throw new FetchPageError('NOT_ALLOWED', `Unparseable redirect from ${safeUrl(base)}`);
  }
}

/** robots.txt for one origin. Redirects are followed only to https://<allow-listed host>/robots.txt; anything else is unavailable. */
async function fetchRobots(
  target: URL,
  get: HttpGet,
  signal: AbortSignal,
  maxBytes: number,
  allowedHosts: ReadonlySet<string>,
): Promise<string> {
  let robotsUrl = new URL('/robots.txt', target.origin);
  for (let hop = 0; ; hop++) {
    const res = await request(get, robotsUrl, signal, 'text/plain');
    if (res.status >= 300 && res.status < 400) {
      await cancelBody(res);
      const loc = res.headers.get('location');
      if (loc === null || hop >= MAX_REDIRECTS) {
        throw new FetchPageError('ROBOTS_UNAVAILABLE', `robots.txt redirects too much or without a target for ${target.host}`);
      }
      let next: URL;
      try {
        next = new URL(loc, robotsUrl);
      } catch {
        throw new FetchPageError('ROBOTS_UNAVAILABLE', `robots.txt redirect is unparseable for ${target.host}`);
      }
      const ok =
        next.protocol === 'https:' &&
        next.pathname === '/robots.txt' &&
        next.username === '' &&
        next.password === '' &&
        next.port === '' &&
        allowedHosts.has(next.host);
      if (!ok) throw new FetchPageError('ROBOTS_UNAVAILABLE', `robots.txt redirect to ${safeUrl(next)} refused for ${target.host}`);
      robotsUrl = next;
      continue;
    }
    if (res.status >= 500) {
      await cancelBody(res);
      throw new FetchPageError('ROBOTS_UNAVAILABLE', `robots.txt answered ${res.status} for ${target.host}`);
    }
    if (!res.ok) {
      await cancelBody(res); // 4xx (RBI answers 418) means "no robots file": all allowed (RFC 9309 s2.3.1.3)
      return '';
    }
    return readCapped(res, maxBytes, safeUrl(robotsUrl), signal);
  }
}

async function assertRobotsAllow(
  target: URL,
  get: HttpGet,
  signal: AbortSignal,
  cache: Map<string, string>,
  maxBytes: number,
  allowedHosts: ReadonlySet<string>,
): Promise<void> {
  let robots = cache.get(target.origin);
  if (robots === undefined) {
    robots = await fetchRobots(target, get, signal, maxBytes, allowedHosts);
    cache.set(target.origin, robots);
  }
  if (!robotsAllows(robots, target.pathname)) {
    throw new FetchPageError('ROBOTS_DISALLOWED', `robots.txt disallows ${target.pathname} on ${target.host}`);
  }
}

/** One GET. Error messages name the URL without its query (a robots redirect may carry one). */
async function request(get: HttpGet, target: URL, signal: AbortSignal, accept: string): Promise<Response> {
  const url = safeUrl(target);
  try {
    return await get(target.toString(), {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': LOAN_RATES_USER_AGENT, Accept: accept },
    });
  } catch (err) {
    if (signal.aborted) throw new FetchPageError('TIMEOUT', `Timed out fetching ${url}`);
    for (let cause: unknown = err; cause instanceof Error; cause = cause.cause) {
      if (cause instanceof FetchPageError) throw cause; // e.g. the DNS guard, wrapped by fetch
    }
    const raw = err instanceof Error ? err.message : String(err);
    const detail = target.search === '' ? raw : raw.split(target.search).join('');
    throw new FetchPageError('NETWORK', `${url}: ${detail}`);
  }
}

async function readCapped(res: Response, maxBytes: number, url: string, signal: AbortSignal): Promise<string> {
  // Byte count from a header, not money.
  // eslint-disable-next-line everypaisa/no-money-coercion -- content-length is a byte count
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    await cancelBody(res);
    throw new FetchPageError('TOO_LARGE', `${url} declares ${declared} bytes (cap ${maxBytes})`);
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const aborted = new Promise<never>((_resolve, reject) => {
    const fail = () => reject(new FetchPageError('TIMEOUT', `Timed out reading ${url}`));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => undefined); // handled via the race below; avoids an unhandled rejection after success
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new FetchPageError('TOO_LARGE', `${url} is over ${maxBytes} bytes`);
      chunks.push(value);
    }
  } catch (err) {
    reader.cancel().catch(() => undefined); // release the stream; the original error is what matters
    if (err instanceof FetchPageError) throw err;
    if (signal.aborted) throw new FetchPageError('TIMEOUT', `Timed out reading ${url}`);
    throw new FetchPageError('NETWORK', `${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
