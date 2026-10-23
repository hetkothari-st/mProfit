import { describe, it, expect } from 'vitest';
import { reportablePortfolios, errorFromResponse, isConcentrated } from './reportDownloads';

describe('reportablePortfolios', () => {
  const list = [
    { id: 'mine', userId: 'me' },
    { id: 'shared-by-spouse', userId: 'spouse' },
    { id: 'spouse-personal', userId: 'spouse' },
  ];

  it('lists only the books the Reports/Analytics APIs will serve', () => {
    expect(reportablePortfolios(list, 'me').map((p) => p.id)).toEqual(['mine']);
  });

  it('is empty before data or a user is known', () => {
    expect(reportablePortfolios(undefined, 'me')).toEqual([]);
    expect(reportablePortfolios(list, null)).toEqual([]);
  });
});

describe('errorFromResponse', () => {
  it("surfaces the server's message, not the raw JSON body", async () => {
    const r = new Response(JSON.stringify({ success: false, error: 'That member is not part of a family you can see.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    expect((await errorFromResponse(r)).message).toBe('That member is not part of a family you can see.');
  });

  it('reads a nested error object too', async () => {
    const r = new Response(JSON.stringify({ error: { message: 'Nope' } }), { status: 400 });
    expect((await errorFromResponse(r)).message).toBe('Nope');
  });

  it('falls back to the status when the body is not JSON', async () => {
    const r = new Response('', { status: 502 });
    expect((await errorFromResponse(r, 'Download failed')).message).toBe('Download failed (HTTP 502)');
  });
});

describe('isConcentrated', () => {
  const row = (pct: number, cumulativePct: number) => ({ pct, cumulativePct });
  it('flags when the top three holdings exceed 60%', () => {
    expect(isConcentrated([row(30, 30), row(20, 50), row(15, 65), row(5, 70)])).toBe(true);
  });
  it('does not flag a spread portfolio', () => {
    expect(isConcentrated([row(20, 20), row(18, 38), row(15, 53), row(10, 63)])).toBe(false);
  });
  it('uses what there is when fewer than three are listed', () => {
    expect(isConcentrated([row(70, 70)])).toBe(true);
    expect(isConcentrated([])).toBe(false);
  });
});
