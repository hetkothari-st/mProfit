/**
 * FBIL's risk-free curve starts 2017-08-23; RBI's 91-day auction history
 * (`TBILL_91D`) covers the years before. The metrics take one series out of
 * the two — fallback before the switch date, active from it. The fallback
 * ships as a data migration generated from the committed edition tables.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { prisma } from '../../../../src/lib/prisma.js';
import { runAsSystem } from '../../../../src/lib/requestContext.js';
import { mergeRiskFreeRows } from '../../../../src/services/mf/mfAnalytics/mfMetrics.service.js';
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

describe('RBI history data migration', () => {
  const DB_URL = process.env.DATABASE_URL ?? '';
  const fixture = (id: string) =>
    readFile(resolve(here, '../../../fixtures/mf/benchmarks/', `rbi-tbill-handbook-${id}.table.html`), 'utf8');

  it.runIf(/localhost|127\.0\.0\.1/.test(DB_URL))(
    'stored exactly what the parser reads from the committed edition tables',
    async () => {
      const parsed = await fetchRbiTbillHistory(
        { from: day('2012-07-04'), to: day('2018-07-31') },
        { fetchText: async (url) => ({ ok: true as const, text: await fixture(/id=(\d+)/.exec(url)![1]!) }) },
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const stored = await runAsSystem(() =>
        prisma.riskFreeRate.findMany({ where: { series: 'TBILL_91D' }, orderBy: { date: 'asc' } }),
      );
      expect(stored).toHaveLength(314);
      expect(stored.map((r) => [r.date.toISOString().slice(0, 10), r.ratePct.toFixed(4)])).toEqual(
        parsed.rows.map((r) => [r.date.toISOString().slice(0, 10), r.ratePct.toFixed(4)]),
      );
    },
  );
});
