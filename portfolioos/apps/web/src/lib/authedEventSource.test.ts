// @vitest-environment jsdom
// The auth store persists through browser storage (see "Remember me" in
// stores/auth.store.ts), so setting a token in the test needs a DOM.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthedEventSource } from './authedEventSource';
import { useAuthStore } from '@/stores/auth.store';

/**
 * SEC-38 — the PF live-event stream never authenticated.
 *
 * `new EventSource(url, { withCredentials: true })` cannot set headers and
 * the API has no cookie session, so `authenticate` returned 401 and the
 * captcha/OTP flow could not work. AuthedEventSource reads the stream with
 * fetch so it can send the Bearer token — without putting the token in the
 * URL, which would leak it into access logs.
 */

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

function mockFetch(chunks: string[], init: { ok?: boolean } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    body: streamOf(chunks),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function flush() {
  // Let the async reader loop drain.
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-access-token' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthedEventSource', () => {
  it('sends the Bearer token in a header, never in the URL', async () => {
    const fetchFn = mockFetch([]);
    new AuthedEventSource('https://api.example/api/epfppf/sessions/abc/events');
    await flush();

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).not.toContain('token');
    expect(init.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('dispatches named events with their data', async () => {
    mockFetch(['event: status\ndata: {"step":"SCRAPING"}\n\n']);
    const es = new AuthedEventSource('https://api.example/x');
    const received: string[] = [];
    es.addEventListener('status', (e) => received.push(e.data));
    await flush();
    expect(received).toEqual(['{"step":"SCRAPING"}']);
  });

  it('reassembles an event split across network chunks', async () => {
    mockFetch(['event: otp_req', 'uired\ndata: {"a"', ':1}\n', '\n']);
    const es = new AuthedEventSource('https://api.example/x');
    const received: string[] = [];
    es.addEventListener('otp_required', (e) => received.push(e.data));
    await flush();
    expect(received).toEqual(['{"a":1}']);
  });

  it('handles several events in one chunk and CRLF line endings', async () => {
    mockFetch(['event: a\r\ndata: 1\r\n\r\nevent: b\ndata: 2\n\n']);
    const es = new AuthedEventSource('https://api.example/x');
    const got: string[] = [];
    es.addEventListener('a', (e) => got.push(`a:${e.data}`));
    es.addEventListener('b', (e) => got.push(`b:${e.data}`));
    await flush();
    expect(got).toEqual(['a:1', 'b:2']);
  });

  it('ignores keep-alive comments', async () => {
    mockFetch([': keep-alive\n\nevent: status\ndata: ok\n\n']);
    const es = new AuthedEventSource('https://api.example/x');
    const got: string[] = [];
    es.addEventListener('status', (e) => got.push(e.data));
    await flush();
    expect(got).toEqual(['ok']);
  });

  it('reports an error for a rejected (e.g. 401) response', async () => {
    mockFetch([], { ok: false });
    const es = new AuthedEventSource('https://api.example/x');
    const onerror = vi.fn();
    es.onerror = onerror;
    await flush();
    expect(onerror).toHaveBeenCalled();
  });

  it('does not report an error after a deliberate close', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    const es = new AuthedEventSource('https://api.example/x');
    const onerror = vi.fn();
    es.onerror = onerror;
    es.close();
    await flush();
    expect(onerror).not.toHaveBeenCalled();
  });
});
