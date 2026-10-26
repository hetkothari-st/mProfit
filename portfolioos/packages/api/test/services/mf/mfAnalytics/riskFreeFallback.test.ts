/**
 * FBIL's risk-free curve starts 2017-08-23; RBI's 91-day auction history
 * (`TBILL_91D`) covers the years before. The metrics take one series out of
 * the two — fallback before the switch date, active from it — and the weekly
 * job fills the fallback once.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../../../src/lib/prisma.js';
import { runAsSystem } from '../../../../src/lib/requestContext.js';
import { mergeRiskFreeRows } from '../../../../src/services/mf/mfAnalytics/mfMetrics.service.js';
import { ensureRbiTbillHistory } from '../../../../src/jobs/riskFreeRateJob.js';
import { fetchRbiTbillHistory } from '../../../../src/priceFeeds/rbiTbillHandbook.v1.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const here = fileURLToPath(new URL('.', import.meta.url));

describe('mergeRiskFreeRows', () => {
  const start = day('2017-08-23');
  const active = [{ date: day('2017-08-23'), v: 'fbil-1' }, { date: day('2017-08-30'), v: 'fbil-2' }];
  const fallback = [
    { date: day('2017-08-09'), v: 'rbi-1' },
    { date: day('2017-08-16'), v: 'rbi-2' },
    // RBI keeps publishing after FBIL starts; those rows must not be used.
    { date: day('2017-08-23'), v: 'rbi-3' },
    { date: day('2017-08-30'), v: 'rbi-4' },
  ];

  it('takes the fallback before the switch date and the active series from it', () => {
    expect(mergeRiskFreeRows(active, fallback, start).map((r) => r.v)).toEqual([
      'rbi-1',
      'rbi-2',
      'fbil-1',
      'fbil-2',
    ]);
  });

  it('is the active series alone when the window starts after the switch', () => {
    expect(mergeRiskFreeRows(active, [], start).map((r) => r.v)).toEqual(['fbil-1', 'fbil-2']);
  });
});

describe('ensureRbiTbillHistory', () => {
  const DB_URL = process.env.DATABASE_URL ?? '';
  const fixture = (id: string) =>
    readFile(resolve(here, '../../../fixtures/mf/benchmarks/', `rbi-tbill-handbook-${id}.table.html`), 'utf8');
  const fetchSeries = (range: { from: Date; to: Date }) =>
    fetchRbiTbillHistory(range, {
      fetchText: async (url) => ({ ok: true as const, text: await fixture(/id=(\d+)/.exec(url)![1]!) }),
    });

  afterAll(async () => {
    await runAsSystem(() => prisma.riskFreeRate.deleteMany({ where: { series: 'TBILL_91D' } }));
  });

  it.runIf(/localhost|127\.0\.0\.1/.test(DB_URL))('fills TBILL_91D once, then does nothing', async () => {
    await runAsSystem(() => prisma.riskFreeRate.deleteMany({ where: { series: 'TBILL_91D' } }));

    const first = await ensureRbiTbillHistory({ fetchSeries });
    expect(first?.status).toBe('OK');
    expect(first?.rowsInserted).toBeGreaterThan(300);

    const stored = await runAsSystem(() =>
      prisma.riskFreeRate.findMany({ where: { series: 'TBILL_91D' }, orderBy: { date: 'asc' } }),
    );
    expect(stored[0]!.date.toISOString().slice(0, 10)).toBe('2012-07-04');
    expect(stored[0]!.ratePct.toString()).toBe('8.2692');

    expect(await ensureRbiTbillHistory({ fetchSeries })).toBeNull();
  });
});
