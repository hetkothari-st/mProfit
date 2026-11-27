import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Launch review B9: the Gold page read "Live · updated 4241 min ago". The live
 * snapshot is refreshed in the background, one refresh at a time. A Yahoo quote
 * call has no timeout of its own, so one that never answered left the in-flight
 * refresh pending forever: no later request could start another, and the page
 * kept serving the last good snapshot for days.
 *
 * Synthetic prices only.
 */

const yahooQuoteRaw = vi.fn();
vi.mock('../../src/priceFeeds/yahooClient.js', () => ({ yahooQuoteRaw }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('live gold/silver refresh', () => {
  it('gives up on a hung upstream, so the next request can refresh again', async () => {
    vi.useFakeTimers();
    // First refresh: Yahoo never answers, the JSON sources are down.
    yahooQuoteRaw.mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    const mod = await import('../../src/priceFeeds/commodity.service.js');
    // Let the refresh started at module load hit its time limit.
    await vi.advanceTimersByTimeAsync(mod.LIVE_REFRESH_TIMEOUT_MS + 1_000);

    // Upstreams recover.
    yahooQuoteRaw.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('coingecko')) {
          return new Response(JSON.stringify({ 'pax-gold': { inr: 311035, usd: 3500 } }), { status: 200 });
        }
        throw new Error('offline');
      }),
    );

    const pending = mod.fetchLivePrices();
    await vi.advanceTimersByTimeAsync(10);
    const live = await pending;
    // 311035 INR per troy ounce / 31.1035 g = 10000 INR per gram.
    expect(live.GOLD?.toFixed(2)).toBe('10000.00');
  });
});
