import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { searchPlace } from '../../src/lib/nominatim.js';

// Nominatim's usage policy: identify the app in the User-Agent, one request at
// a time, no more than one a second. Tests turn the spacing off.

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.NOMINATIM_MIN_INTERVAL_MS = '0';
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('searchPlace', () => {
  it('asks Nominatim for one result, identifying the app', async () => {
    fetchMock.mockResolvedValue(ok([{ lat: '19.1136', lon: '72.8697' }]));
    const hit = await searchPlace('Andheri East, Mumbai', 'in');

    expect(hit).toEqual({ lat: 19.1136, lon: 72.8697 });
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(u.searchParams.get('q')).toBe('Andheri East, Mumbai');
    expect(u.searchParams.get('format')).toBe('jsonv2');
    expect(u.searchParams.get('limit')).toBe('1');
    expect(u.searchParams.get('countrycodes')).toBe('in');
    expect((init as RequestInit).headers).toMatchObject({ 'User-Agent': expect.stringMatching(/PortfolioOS/) });
  });

  it('returns null when nothing matches', async () => {
    fetchMock.mockResolvedValue(ok([]));
    expect(await searchPlace('Nowhere Lane')).toBeNull();
  });

  it('throws when the service answers with an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(searchPlace('Pune')).rejects.toThrow(/429/);
  });
});
