/**
 * Personal inflation end to end against Postgres: the CPI job (with fixture-
 * backed transports — nothing reaches MoSPI), its idempotency, the official
 * long-run rates, the user summary, and RLS isolation of the basket.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal } from 'decimal.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser, runAsSystem } from '../../src/lib/requestContext.js';
import { runCpiRefresh } from '../../src/jobs/cpiJob.js';
import { parseCpi2024Page, parseCpi2012Page, legacyRowsToDivisions } from '../../src/priceFeeds/mospiCpi.parse.js';
import type { CpiFetchOutcome } from '../../src/priceFeeds/mospiCpi.v1.js';
import {
  createItem,
  getSummary,
  updateProfile,
} from '../../src/services/personalInflation/personalInflation.service.js';

const dir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/cpi');
const fixture = (name: string) => readFileSync(resolve(dir, name), 'utf8');

const NEW_FIXTURES: Record<number, string> = {
  1: 'mospi-cpi2024-allindia-2026-09-p1.json',
  20: 'mospi-cpi2024-maharashtra-2026-09-p1.json',
};
const OLD_FIXTURES: Record<number, string> = {
  1: 'mospi-cpi2012-allindia-2025-09.json',
  20: 'mospi-cpi2012-maharashtra-2025-09.json',
};
const STATES = [1, 20];
const NOW = new Date('2026-11-03T06:00:00Z');

let fetch2024Calls = 0;
let fetch2012Calls = 0;

/** Base-2024: the real Sep 2026 page, re-dated for Jan–Sep; Oct onward unreleased. */
async function fake2024(args: { stateCode: number; year: number; month: number }): Promise<CpiFetchOutcome> {
  fetch2024Calls += 1;
  const sourceRef = `test:${args.stateCode}:${args.year}-${args.month}`;
  if (args.year !== 2026 || args.month > 9) return { ok: true, rows: [], failures: [], sourceRef, noData: true };
  const parsed = parseCpi2024Page(fixture(NEW_FIXTURES[args.stateCode]!), args.stateCode);
  if (parsed.kind !== 'ok') throw new Error('fixture did not parse');
  return { ok: true, rows: parsed.rows.map((r) => ({ ...r, month: args.month })), failures: [], sourceRef };
}

/**
 * Base-2012: the real Sep 2025 page for 2025, and the same readings shifted
 * by a known amount per earlier year so the long-run rate is checkable.
 */
const YEAR_SHIFT: Record<number, number> = { 2025: 0, 2024: 1, 2023: 2, 2022: 3 };
async function fake2012(args: { stateCode: number; legacyStateCode: number; years: readonly number[] }): Promise<CpiFetchOutcome> {
  fetch2012Calls += 1;
  const page = parseCpi2012Page(fixture(OLD_FIXTURES[args.stateCode]!));
  if (page.kind !== 'ok') throw new Error('fixture did not parse');
  const subgroups = args.years.flatMap((y) =>
    page.rows.map((r) => ({ ...r, year: y, inflationPct: r.inflationPct.plus(YEAR_SHIFT[y] ?? 0) })),
  );
  return { ok: true, rows: legacyRowsToDivisions(subgroups, args.stateCode), failures: [], sourceRef: 'test-legacy' };
}

describe('personal inflation (DB)', () => {
  let a: TestScope;
  let b: TestScope;
  // CpiObservation is global reference data. The job under test needs these
  // states empty, so park any real rows (a dev DB with live CPI) and put
  // them back afterwards rather than wiping them.
  let parked: Awaited<ReturnType<typeof prisma.cpiObservation.findMany>> = [];

  beforeAll(async () => {
    a = await createTestScope('pinfl-a');
    b = await createTestScope('pinfl-b');
    parked = await runAsSystem(() => prisma.cpiObservation.findMany({ where: { stateCode: { in: STATES } } }));
    await runAsSystem(() => prisma.cpiObservation.deleteMany({ where: { stateCode: { in: STATES } } }));
  });

  afterAll(async () => {
    await runAsSystem(() => prisma.cpiObservation.deleteMany({ where: { stateCode: { in: STATES } } }));
    if (parked.length > 0) await runAsSystem(() => prisma.cpiObservation.createMany({ data: parked }));
    await a.cleanup();
    await b.cleanup();
  });

  it('job backfills both series, then a re-run writes nothing', async () => {
    const opts = { now: NOW, fetch2024: fake2024, fetch2012: fake2012, throttleMs: 0, stateCodes: STATES, opsUserId: a.userId };
    const first = await runCpiRefresh(opts);
    expect(first.status).toBe('OK');
    expect(first.latest).toBe('2026-09');
    expect(first.monthsFetched).toHaveLength(9);
    expect(first.legacyStatesBackfilled).toBe(2);
    // 9 months × 2 states × 39 + 4 legacy years × 2 states × 39
    expect(first.rowsInserted).toBe(9 * 2 * 39 + 4 * 2 * 39);

    fetch2024Calls = 0;
    fetch2012Calls = 0;
    const second = await runCpiRefresh(opts);
    expect(second.rowsInserted).toBe(0);
    expect(second.rowsUpdated).toBe(0);
    expect(second.monthsFetched).toEqual([]);
    // A quiet day costs one probe and no legacy fetches.
    expect(fetch2024Calls).toBe(1);
    expect(fetch2012Calls).toBe(0);
  });

  it('summary: official long-run rates, history-derived item rate, weighted personal rate', async () => {
    await runAsUser(a.userId, async () => {
      await updateProfile(a.userId, { stateCode: 20, sector: 'URBAN' });
      await createItem(a.userId, {
        name: 'School fee',
        divisionCode: '10',
        amount: '300000',
        rateMode: 'HISTORY',
        pricePoints: [
          { asOf: '2024-06-01', amount: '226843.10' },
          { asOf: '2026-06-01', amount: '300000' },
        ],
      });
      await createItem(a.userId, { name: 'Groceries', divisionCode: '01', amount: '8333.33', frequency: 'MONTHLY' });
    });

    const s = await runAsUser(a.userId, () => getSummary(a.userId));
    expect(s.asOf).toBe('2026-09');
    expect(s.profile).toEqual({ stateCode: 20, sector: 'URBAN' });

    // Maharashtra urban education: 2026 reading 4.10 (base 2024), then the
    // old series 2.90 shifted +0 (2025), +1, +2, +3.
    const edu = s.official.find((o) => o.divisionCode === '10')!;
    expect(edu.source).toBe('STATE');
    expect(edu.yearsUsed).toBe(5);
    expect(edu.latestYoy).toBe('0.041000');
    const expected = [4.1, 2.9, 3.9, 4.9, 5.9]
      .reduce((g, p) => g.times(new Decimal(1).plus(new Decimal(p).dividedBy(100))), new Decimal(1))
      .pow(new Decimal(1).dividedBy(5)).minus(1);
    expect(edu.longRunRate).toBe(expected.toFixed(6));

    const fee = s.items.find((i) => i.name === 'School fee')!;
    expect(fee.rateSource).toBe('HISTORY');
    expect(new Decimal(fee.resolvedRate!).toFixed(3)).toBe('0.150');
    // Next year's fee = 3,00,000 × (1 + rate); view rates are 6 dp, so allow paise.
    const nextYear = new Decimal(300000).times(new Decimal(1).plus(fee.resolvedRate!));
    expect(new Decimal(fee.projections[0]!).minus(nextYear).abs().lessThan(1)).toBe(true);

    const groc = s.items.find((i) => i.name === 'Groceries')!;
    expect(groc.annualAmount).toBe('99999.9600');
    expect(groc.rateSource).toBe('OFFICIAL');

    // Weighted: 3,00,000 @ 15% and ~1,00,000 @ food long-run.
    const food = new Decimal(s.official.find((o) => o.divisionCode === '01')!.longRunRate!);
    const personal = new Decimal(fee.resolvedRate!).times(300000).plus(food.times('99999.96')).dividedBy('399999.96');
    expect(new Decimal(s.personalRate!).minus(personal).abs().lessThan('0.000002')).toBe(true);
    expect(s.byDivision.map((d) => d.divisionCode).sort()).toEqual(['01', '10']);
  });

  it('a state missing a division falls back to All India for it', async () => {
    await runAsSystem(() =>
      prisma.cpiObservation.deleteMany({ where: { stateCode: 20, divisionCode: '06', baseYear: 2024 } }),
    );
    const s = await runAsUser(a.userId, () => getSummary(a.userId));
    expect(s.official.find((o) => o.divisionCode === '06')!.source).toBe('ALL_INDIA');
  });

  it('a state with under 3 years of history uses All India (the Ladakh case)', async () => {
    await runAsSystem(() =>
      prisma.cpiObservation.deleteMany({ where: { stateCode: 20, divisionCode: '09', baseYear: 2012 } }),
    );
    const s = await runAsUser(a.userId, () => getSummary(a.userId));
    const rec = s.official.find((o) => o.divisionCode === '09')!;
    expect(rec.source).toBe('ALL_INDIA');
    expect(rec.yearsUsed).toBe(5);
    // Divisions with full history stay on the state's own figures.
    expect(s.official.find((o) => o.divisionCode === '10')!.source).toBe('STATE');
  });

  it("user B cannot see user A's basket", async () => {
    const s = await runAsUser(b.userId, () => getSummary(b.userId));
    expect(s.items).toEqual([]);
    expect(s.profile).toEqual({ stateCode: 1, sector: 'COMBINED' });
    const leaked = await runAsUser(b.userId, () => prisma.inflationBasketItem.findMany({ where: { userId: a.userId } }));
    expect(leaked).toEqual([]);
    const points = await runAsUser(b.userId, () => prisma.inflationPricePoint.findMany({}));
    expect(points).toEqual([]);
  });
});
