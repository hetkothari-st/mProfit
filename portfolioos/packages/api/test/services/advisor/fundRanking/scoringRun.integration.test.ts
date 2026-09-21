import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../src/lib/prisma.js';
import { runAsSystem } from '../../../../src/lib/requestContext.js';
import { runFundScoring } from '../../../../src/services/advisor/fundRanking/scoringRun.service.js';
import {
  currentMethodology,
  snapshotIsFresh,
} from '../../../../src/services/advisor/fundRanking/methodology.service.js';
import type { MethodologyConfig } from '../../../../src/services/advisor/fundRanking/types.js';

/**
 * The scoring pass against a real database: idempotency on re-run, and the
 * rule that an unsigned methodology never advises.
 *
 * These use `runAsSystem` because every table involved is market-level
 * reference data with no owner — there is no user context to run them under.
 */

const SUFFIX = randomUUID().slice(0, 8);
const ASOF = new Date('2026-09-20T00:00:00Z');

let methodologyId: string;
const schemeCodes: string[] = [];
const fundIds: string[] = [];

function monthlyNavs(months: number, monthlyPct: number, start = 100) {
  const out: Array<{ date: Date; nav: string }> = [];
  let nav = start;
  for (let i = months; i >= 0; i -= 1) {
    out.push({
      date: new Date(Date.UTC(2026, 8 - i, 15)),
      nav: nav.toFixed(4),
    });
    nav *= 1 + monthlyPct / 100;
  }
  return out;
}

async function makeFund(
  label: string,
  name: string,
  category: 'EQUITY' | 'INDEX_FUND',
  growthPct: number,
  opts: { plan?: string; option?: string; aumInr?: string | null; terPct?: string | null } = {},
) {
  const schemeCode = `TEST${label}${SUFFIX}`;
  const fund = await prisma.mutualFundMaster.create({
    data: {
      schemeCode,
      schemeName: name,
      amcName: `Test AMC ${label}`,
      category,
      subCategory: 'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)',
      isActive: true,
      planType: opts.plan ?? 'Direct Plan',
      optionType: opts.option ?? 'Growth Option',
      // v2 requires a size: a scheme we cannot size is ineligible, so the
      // fixtures that are meant to be scored carry one.
      aumInr: opts.aumInr === undefined ? '50000000000' : opts.aumInr,
      terPct: opts.terPct === undefined ? '0.5000' : opts.terPct,
      navHistory: { create: monthlyNavs(48, growthPct) },
    },
  });
  schemeCodes.push(schemeCode);
  fundIds.push(fund.id);
  return fund;
}

beforeAll(async () => {
  await runAsSystem(async () => {
    const seeded = await currentMethodology();
    if (seeded) {
      methodologyId = seeded.id;
    } else {
      // The migration seeds v1 unsigned; sign a throwaway copy for the test
      // rather than mutating the seeded row other tests may assert on.
      const row = await prisma.rankingMethodologyVersion.findFirst({ orderBy: { version: 'desc' } });
      const config = (row?.config ?? {}) as unknown as MethodologyConfig;
      const created = await prisma.rankingMethodologyVersion.create({
        data: {
          version: (row?.version ?? 0) + 1000,
          config: config as object,
          description: `test methodology ${SUFFIX}`,
          signedOffBy: 'Test Principal Officer',
          signedOffAt: new Date(),
        },
      });
      methodologyId = created.id;
    }

    await makeFund('A', `Alpha Flexi Cap Fund ${SUFFIX}`, 'EQUITY', 1.2);
    await makeFund('B', `Beta Flexi Cap Fund ${SUFFIX}`, 'EQUITY', 0.6);
    // A regular plan, which must never be scored however well it performed.
    await makeFund('C', `Gamma Flexi Cap Fund ${SUFFIX}`, 'EQUITY', 2.0, { plan: 'Regular Plan' });
    // No AUM: ineligible under v2, where a scheme we cannot size is one we
    // cannot honestly rank.
    await makeFund('D', `Delta Flexi Cap Fund ${SUFFIX}`, 'EQUITY', 1.0, { aumInr: null });
  });
}, 120_000);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.fundScoreSnapshot.deleteMany({ where: { schemeCode: { in: schemeCodes } } });
    await prisma.mFNav.deleteMany({ where: { fundId: { in: fundIds } } });
    await prisma.mutualFundMaster.deleteMany({ where: { id: { in: fundIds } } });
    await prisma.rankingMethodologyVersion.deleteMany({
      where: { description: `test methodology ${SUFFIX}` },
    });
  });
}, 120_000);

describe('runFundScoring', () => {
  it('scores the universe and records ineligible schemes with reasons', async () => {
    const methodology = await runAsSystem(async () => {
      const row = await prisma.rankingMethodologyVersion.findUniqueOrThrow({
        where: { id: methodologyId },
      });
      return row.config as unknown as MethodologyConfig;
    });

    await runAsSystem(() =>
      runFundScoring({ methodologyVersionId: methodologyId, config: methodology, asOf: ASOF }),
    );

    const rows = await runAsSystem(() =>
      prisma.fundScoreSnapshot.findMany({
        where: { methodologyVersionId: methodologyId, schemeCode: { in: schemeCodes } },
      }),
    );

    const regular = rows.find((r) => r.schemeCode === `TESTC${SUFFIX}`);
    expect(regular?.eligible).toBe(false);
    expect(regular?.exclusionReasons).toContain('regular_plan');
    // Ineligible means unscored: a score would imply it was a candidate.
    expect(regular?.score).toBeNull();

    const unsized = rows.find((r) => r.schemeCode === `TESTD${SUFFIX}`);
    expect(unsized?.eligible).toBe(false);
    expect(unsized?.exclusionReasons).toContain('aum_unknown');

    const direct = rows.filter((r) => r.eligible);
    expect(direct.length).toBeGreaterThanOrEqual(2);
    for (const row of direct) {
      expect(row.score).not.toBeNull();
      expect(row.rankInBucket).not.toBeNull();
    }
  }, 180_000);

  it('is idempotent: a re-run upserts rather than duplicating', async () => {
    const config = await runAsSystem(async () => {
      const row = await prisma.rankingMethodologyVersion.findUniqueOrThrow({
        where: { id: methodologyId },
      });
      return row.config as unknown as MethodologyConfig;
    });

    const countBefore = await runAsSystem(() =>
      prisma.fundScoreSnapshot.count({
        where: { methodologyVersionId: methodologyId, schemeCode: { in: schemeCodes } },
      }),
    );

    await runAsSystem(() =>
      runFundScoring({ methodologyVersionId: methodologyId, config, asOf: ASOF }),
    );

    const countAfter = await runAsSystem(() =>
      prisma.fundScoreSnapshot.count({
        where: { methodologyVersionId: methodologyId, schemeCode: { in: schemeCodes } },
      }),
    );
    expect(countAfter).toBe(countBefore);
  }, 180_000);
});

describe('methodology gating', () => {
  it('never returns an unsigned methodology for advice', async () => {
    const unsignedVersion = 9_000 + Math.floor(Math.random() * 900);
    const created = await runAsSystem(() =>
      prisma.rankingMethodologyVersion.create({
        data: {
          version: unsignedVersion,
          config: {} as object,
          description: `unsigned test ${SUFFIX}`,
        },
      }),
    );
    try {
      const current = await runAsSystem(() => currentMethodology());
      // Either there is no signed methodology at all, or it is not this one.
      expect(current?.id).not.toBe(created.id);
    } finally {
      await runAsSystem(() =>
        prisma.rankingMethodologyVersion.delete({ where: { id: created.id } }),
      );
    }
  }, 120_000);

  it('treats a snapshot older than the configured window as stale', () => {
    const config = { snapshotMaxAgeDays: 3 } as MethodologyConfig;
    const now = new Date('2026-09-21T00:00:00Z');
    expect(snapshotIsFresh(new Date('2026-09-20T00:00:00Z'), config, now)).toBe(true);
    expect(snapshotIsFresh(new Date('2026-09-10T00:00:00Z'), config, now)).toBe(false);
    expect(snapshotIsFresh(null, config, now)).toBe(false);
  });
});
