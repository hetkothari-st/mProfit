import { createServer } from 'node:http';
import { describe, it, expect } from 'vitest';
import { robotsAllows } from '../../src/services/loanRates/robots.js';
import {
  FetchPageError, LOAN_RATES_USER_AGENT, fetchPage, isPrivateAddress, type HttpGet,
} from '../../src/services/loanRates/fetchPage.js';
import { fixture } from './readerFixtures.js';

describe('robotsAllows on real robots.txt files', () => {
  const icici = fixture('robots-icici.bank.in.txt');
  it('ICICI: rate pages allowed; /cars/*, *.pdf and /campaigns/ disallowed; a longer Allow wins', () => {
    expect(robotsAllows(icici, '/personal-banking/loans/home-loan/interest-rates')).toBe(true);
    expect(robotsAllows(icici, '/interest-rate')).toBe(true);
    expect(robotsAllows(icici, '/cars/new')).toBe(false);
    expect(robotsAllows(icici, '/x/rates.pdf')).toBe(false);
    expect(robotsAllows(icici, '/campaigns/other')).toBe(false);
    expect(robotsAllows(icici, '/campaigns/TOB/x')).toBe(true);
  });
  it('SBI: an empty Disallow allows everything', () => {
    expect(robotsAllows(fixture('robots-sbi.bank.in.txt'), '/web/interest-rates/interest-rates/mclr')).toBe(true);
  });
  it('HDFC: only the * group applies, and it blocks just /homeloans-cug', () => {
    const hdfc = fixture('robots-hdfc.bank.in.txt');
    expect(robotsAllows(hdfc, '/interest-rates')).toBe(true);
    expect(robotsAllows(hdfc, '/homeloans-cug')).toBe(false);
  });
  it('RBI answers robots.txt with an HTML error page: no rules, so allowed', () => {
    expect(robotsAllows(fixture('robots-www.rbi.org.in.txt'), '/')).toBe(true);
  });
});

const PAGE = 'https://www.icici.bank.in/interest-rate';
const noRobots = () => new Map([['https://www.icici.bank.in', '']]);
const res = (body: string | null, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers });
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (err) {
    return err instanceof FetchPageError ? err.code : `UNEXPECTED ${String(err)}`;
  }
}

describe('fetchPage', () => {
  it('fetches robots.txt then the page, with the plain app User-Agent', async () => {
    const calls: { url: string; ua: string | undefined; redirect: RequestRedirect | undefined }[] = [];
    const get: HttpGet = async (url, init) => {
      calls.push({ url, ua: (init.headers as Record<string, string>)['User-Agent'], redirect: init.redirect });
      return url.endsWith('/robots.txt') ? res('User-agent: *\nDisallow: /cars/*\n') : res('<html>rates</html>');
    };
    expect(await fetchPage(PAGE, { get })).toBe('<html>rates</html>');
    expect(calls.map((c) => c.url)).toEqual(['https://www.icici.bank.in/robots.txt', PAGE]);
    expect(calls.every((c) => c.ua === LOAN_RATES_USER_AGENT && c.redirect === 'manual')).toBe(true);
    expect(LOAN_RATES_USER_AGENT).toMatch(/^EveryPaisa\//);
  });

  it('refuses any URL that is not a reader URL, without a request', async () => {
    let called = false;
    const get: HttpGet = async () => {
      called = true;
      return res('x');
    };
    expect(await codeOf(fetchPage('http://169.254.169.254/latest/meta-data', { get }))).toBe('NOT_ALLOWED');
    expect(await codeOf(fetchPage('https://www.icici.bank.in/interest-rate?x=1', { get }))).toBe('NOT_ALLOWED');
    expect(called).toBe(false);
  });

  it('honours robots: disallowed path, 4xx robots = allowed, 5xx robots = skip', async () => {
    const allow = new Set([PAGE, 'https://www.icici.bank.in/cars/x']);
    const robots = (body: string, status = 200): HttpGet => async (url) => (url.endsWith('/robots.txt') ? res(body, status) : res('page'));
    expect(await codeOf(fetchPage('https://www.icici.bank.in/cars/x', { allowList: allow, get: robots('User-agent: *\nDisallow: /cars/*') }))).toBe('ROBOTS_DISALLOWED');
    expect(await codeOf(fetchPage(PAGE, { get: robots('Unauthorised', 418) }))).toBe('OK');
    expect(await codeOf(fetchPage(PAGE, { get: robots('', 503) }))).toBe('ROBOTS_UNAVAILABLE');
  });

  it('caches robots.txt per origin across one run', async () => {
    const cache = new Map<string, string>();
    let robotsHits = 0;
    const get: HttpGet = async (url) => {
      if (url.endsWith('/robots.txt')) robotsHits++;
      return res('ok');
    };
    await fetchPage(PAGE, { get, robotsCache: cache });
    await fetchPage(PAGE, { get, robotsCache: cache });
    expect(robotsHits).toBe(1);
  });

  it('refuses a body over the cap, by header and by stream', async () => {
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), maxBytes: 10, get: async () => res('x'.repeat(11)) }))).toBe('TOO_LARGE');
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), maxBytes: 10, get: async () => res('tiny', 200, { 'content-length': '5000000' }) }))).toBe('TOO_LARGE');
    expect(await fetchPage(PAGE, { robotsCache: noRobots(), maxBytes: 10, get: async () => res('x'.repeat(10)) })).toBe('xxxxxxxxxx');
  });

  it('follows a same-host redirect but not one to another host', async () => {
    let n = 0;
    const same: HttpGet = async (url) => (n++ === 0 ? res(null, 302, { location: '/interest-rate/' }) : res(`at ${url}`));
    expect(await fetchPage(PAGE, { allowList: new Set([PAGE, 'https://www.icici.bank.in/interest-rate/']), robotsCache: noRobots(), get: same })).toBe('at https://www.icici.bank.in/interest-rate/');
    const away: HttpGet = async () => res(null, 301, { location: 'https://evil.example/' });
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: away }))).toBe('NOT_ALLOWED');
  });

  it('times out, and reports HTTP and network failures by code', async () => {
    const hang: HttpGet = (_url, init) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), timeoutMs: 50, get: hang }))).toBe('TIMEOUT');
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: async () => res('gone', 404) }))).toBe('HTTP_STATUS');
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: async () => { throw new Error('ECONNRESET'); } }))).toBe('NETWORK');
  });

  it('re-checks every redirect hop: allow-list, robots, and a hop limit', async () => {
    const redirect = (to: string): HttpGet => async (url) => (url.endsWith('/robots.txt') ? res('User-agent: *\nDisallow: /secret') : res(null, 302, { location: to }));
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: redirect('/other-page') }))).toBe('NOT_ALLOWED');
    const allow = new Set([PAGE, 'https://www.icici.bank.in/secret']);
    expect(await codeOf(fetchPage(PAGE, { allowList: allow, get: redirect('/secret') }))).toBe('ROBOTS_DISALLOWED');
    let hits = 0;
    const loop: HttpGet = async () => {
      hits++;
      return res(null, 302, { location: PAGE });
    };
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: loop }))).toBe('TOO_MANY_REDIRECTS');
    expect(hits).toBe(6);
  });

  it('times out while the body stalls, and cancels the stream', async () => {
    let cancelled = false;
    const stalled: HttpGet = async () =>
      new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('<ht')), cancel: () => { cancelled = true; } }), { status: 200 });
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), timeoutMs: 50, get: stalled }))).toBe('TIMEOUT');
    expect(cancelled).toBe(true);
  });
});

describe('fetchPage hardening', () => {
  const HOST = 'https://www.icici.bank.in';
  it('follows a same-host robots.txt redirect to /robots.txt and honours its Disallow', async () => {
    const get: HttpGet = async (url) => {
      if (url === `${HOST}/robots.txt`) return res(null, 301, { location: `${HOST}/robots.txt?x=1` });
      if (url.includes('/robots.txt')) return res('User-agent: *\nDisallow: /interest-rate');
      return res('page');
    };
    expect(await codeOf(fetchPage(PAGE, { get }))).toBe('ROBOTS_DISALLOWED');
  });

  it('treats an off-list, off-path, http or looping robots.txt redirect as ROBOTS_UNAVAILABLE', async () => {
    const to = (loc: string): HttpGet => async () => res(null, 301, { location: loc });
    expect(await codeOf(fetchPage(PAGE, { get: to('https://evil.example/robots.txt') }))).toBe('ROBOTS_UNAVAILABLE');
    expect(await codeOf(fetchPage(PAGE, { get: to('/other.txt') }))).toBe('ROBOTS_UNAVAILABLE');
    expect(await codeOf(fetchPage(PAGE, { get: to('http://www.icici.bank.in/robots.txt') }))).toBe('ROBOTS_UNAVAILABLE');
    let hits = 0;
    const loop: HttpGet = async () => {
      hits++;
      return res(null, 301, { location: '/robots.txt' });
    };
    expect(await codeOf(fetchPage(PAGE, { get: loop }))).toBe('ROBOTS_UNAVAILABLE');
    expect(hits).toBe(6);
  });

  it('refuses page redirects to another allow-listed host, even when the target is on the list', async () => {
    const other = 'https://www.sbi.bank.in/x';
    const get: HttpGet = async (url) => (url.endsWith('/robots.txt') ? res('') : res(null, 302, { location: other }));
    expect(await codeOf(fetchPage(PAGE, { allowList: new Set([PAGE, other]), get }))).toBe('NOT_ALLOWED');
  });

  it.each([
    ['http downgrade', 'http://www.icici.bank.in/interest-rate/'],
    ['credentials', 'https://user:pw@www.icici.bank.in/interest-rate/'],
    ['odd port', 'https://www.icici.bank.in:8443/interest-rate/'],
    ['IP literal', 'https://203.0.113.9/interest-rate/'],
  ])('refuses a redirect with %s even if listed', async (_name, location) => {
    const get: HttpGet = async (url) => (url.endsWith('/robots.txt') ? res('') : res(null, 302, { location }));
    const err = await fetchPage(PAGE, { allowList: new Set([PAGE, location]), get }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchPageError);
    expect((err as FetchPageError).code).toBe('NOT_ALLOWED');
    expect((err as FetchPageError).message).not.toMatch(/user:pw|pw@/);
  });

  it('classifies private, loopback, link-local and mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '203.0.113.9', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('the default transport refuses a private address; allowPrivateHosts is the test-only escape', async () => {
    const server = createServer((req, r) => r.end(req.url === '/robots.txt' ? '' : 'local page'));
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    try {
      const { port } = server.address() as { port: number };
      const local = `http://localhost:${port}/rates`;
      const allowList = new Set([local]);
      expect(await codeOf(fetchPage(local, { allowList }))).toBe('NOT_ALLOWED');
      expect(await fetchPage(local, { allowList, allowPrivateHosts: true })).toBe('local page');
    } finally {
      await new Promise((ok) => server.close(ok));
    }
  });
});
