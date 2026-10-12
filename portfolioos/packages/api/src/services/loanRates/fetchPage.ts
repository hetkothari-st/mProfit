import { robotsAllows } from './robots.js';
import { READER_URLS } from './sources/index.js';

/** Plain, honest agent string naming the app; no browser impersonation. */
export const LOAN_RATES_USER_AGENT = 'EveryPaisa/1.0 (loan-rate reader; one request per page per day)';
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type FetchPageErrorCode =
  | 'NOT_ALLOWED'
  | 'ROBOTS_DISALLOWED'
  | 'ROBOTS_UNAVAILABLE'
  | 'HTTP_STATUS'
  | 'TOO_LARGE'
  | 'TIMEOUT'
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

/** The transport. Production uses global fetch; tests pass a function that returns canned Responses. */
export type HttpGet = (url: string, init: RequestInit) => Promise<Response>;

export interface FetchPageOptions {
  /** Exact URLs that may be fetched. Defaults to the reader URLs; nothing user-supplied ever gets here. */
  allowList?: ReadonlySet<string>;
  get?: HttpGet;
  timeoutMs?: number;
  maxBytes?: number;
  /** robots.txt per origin, shared across one run so each host's file is fetched once. */
  robotsCache?: Map<string, string>;
}

/**
 * GET one allow-listed page as text. Refuses anything not on the list, follows at most three redirects and
 * only within the same host, honours robots.txt for `User-agent: *`, stops after `timeoutMs` and refuses
 * bodies over `maxBytes` without buffering them. The body is returned as text; nothing in it is executed.
 */
export async function fetchPage(url: string, opts: FetchPageOptions = {}): Promise<string> {
  if (!(opts.allowList ?? READER_URLS).has(url)) throw new FetchPageError('NOT_ALLOWED', `Not an allow-listed loan-rate page: ${url}`);
  const get = opts.get ?? ((u: string, init: RequestInit) => fetch(u, init));
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BODY_BYTES;
  const signal = AbortSignal.timeout(timeoutMs);
  const target = new URL(url);

  await assertRobotsAllow(target, get, signal, opts.robotsCache ?? new Map(), maxBytes);

  let current = target;
  for (let hop = 0; ; hop++) {
    const res = await request(get, current.toString(), signal, 'text/html,application/xhtml+xml');
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      const next = new URL(res.headers.get('location')!, current);
      if (next.host !== target.host || hop >= MAX_REDIRECTS) {
        throw new FetchPageError('NOT_ALLOWED', `Redirect to ${next.toString()} is outside ${target.host}`);
      }
      current = next;
      continue;
    }
    if (!res.ok) throw new FetchPageError('HTTP_STATUS', `HTTP ${res.status} for ${current.toString()}`);
    return readCapped(res, maxBytes, current.toString());
  }
}

async function assertRobotsAllow(
  target: URL,
  get: HttpGet,
  signal: AbortSignal,
  cache: Map<string, string>,
  maxBytes: number,
): Promise<void> {
  let robots = cache.get(target.origin);
  if (robots === undefined) {
    const res = await request(get, `${target.origin}/robots.txt`, signal, 'text/plain');
    if (res.status >= 500) throw new FetchPageError('ROBOTS_UNAVAILABLE', `robots.txt answered ${res.status} for ${target.host}`);
    // 4xx (RBI answers 418) means "no robots file": everything is allowed (RFC 9309 s2.3.1.3).
    robots = res.ok ? await readCapped(res, maxBytes, `${target.origin}/robots.txt`) : '';
    cache.set(target.origin, robots);
  }
  if (!robotsAllows(robots, target.pathname)) {
    throw new FetchPageError('ROBOTS_DISALLOWED', `robots.txt disallows ${target.pathname} on ${target.host}`);
  }
}

async function request(get: HttpGet, url: string, signal: AbortSignal, accept: string): Promise<Response> {
  try {
    return await get(url, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': LOAN_RATES_USER_AGENT, Accept: accept },
    });
  } catch (err) {
    if (signal.aborted) throw new FetchPageError('TIMEOUT', `Timed out fetching ${url}`);
    throw new FetchPageError('NETWORK', `${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function readCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new FetchPageError('TOO_LARGE', `${url} declares ${declared} bytes (cap ${maxBytes})`);
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchPageError('TOO_LARGE', `${url} is over ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
