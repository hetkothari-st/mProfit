/**
 * Reports / tax / analytics defects (fix/reports-tax).
 *
 *  1. The Tax page's "Schedule 112A CSV (with FMV)" went to
 *     `/api/tax/grandfathering.csv`, which read `req.user.id` and ignored
 *     "Download reports for" — picking a family member downloaded the caller's
 *     own sales under the member's file name.
 *  3. A holdings/statement download for a family member that named the
 *     caller's own portfolio (the picker lists the caller's books) was refused
 *     with a bare 403 instead of covering the member's portfolios.
 *  5. The Analytics harvest card, scoped to one portfolio, filtered only the
 *     candidate list; the loss totals and the tax saving still covered every
 *     portfolio.
 *  7. A professional acting for a client was gated on their OWN plan, though
 *     acting for a client who invited you is meant to be free — the client is
 *     the customer, so the client's plan decides.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

// Only the CSV renderer is replaced, so the test can see WHOSE rows it was
// asked for without seeding a year of sales. Everything else is real.
vi.mock('../../src/services/tax/tax.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/tax/tax.service.js')>();
  return {
    ...actual,
    schedule112ACsv: vi.fn(async (userId: string, fy: string) => `csv-for:${userId}:${fy}`),
  };
});

const { downloadGrandfatheringCsv } = await import('../../src/controllers/fmv.controller.js');
const { getHoldingsExport, getStatementHoldings } = await import(
  '../../src/controllers/reports.controller.js'
);
const { getTaxHarvestSummary } = await import('../../src/services/analytics/analytics.service.js');
const { requireFeatureForSubject } = await import('../../src/middleware/requirePlan.js');

let owner: TestScope;
let member: TestScope;
let outsider: TestScope;
let familyId: string;

function req(userId: string, query: Record<string, string> = {}): Request {
  return { user: { id: userId }, query, params: {}, header: () => undefined } as unknown as Request;
}

interface FakeRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}
function res(): Response & FakeRes {
  const r = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) {
      r.statusCode = c;
      return r;
    },
    json(b: unknown) {
      r.body = b;
      return r;
    },
    send(b: unknown) {
      r.body = b;
      return r;
    },
    setHeader(k: string, v: string) {
      r.headers[k] = v;
      return r;
    },
  };
  return r as unknown as Response & FakeRes;
}

beforeAll(async () => {
  owner = await createTestScope('rt-owner');
  member = await createTestScope('rt-member');
  outsider = await createTestScope('rt-outsider');
  familyId = await runAsSystem(async () => {
    const family = await prisma.family.create({
      data: { name: 'Reports Tax Family', createdById: owner.userId },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: member.userId, role: 'VIEWER', status: 'ACTIVE' },
    });
    return family.id;
  });
}, 120_000);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.familyMember.deleteMany({ where: { familyId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
  });
  await owner.cleanup();
  await member.cleanup();
  await outsider.cleanup();
}, 120_000);

describe('Schedule 112A CSV (with FMV) follows "Download reports for"', () => {
  it('renders the chosen member, not the caller', async () => {
    const r = res();
    await owner.runAs(() =>
      downloadGrandfatheringCsv(
        req(owner.userId, { fy: '2024-25', subject: member.userId, familyId }),
        r,
      ),
    );
    expect(r.body).toBe(`csv-for:${member.userId}:2024-25`);
  });

  it('still refuses a stranger named as the subject', async () => {
    await expect(
      owner.runAs(() =>
        downloadGrandfatheringCsv(
          req(owner.userId, { fy: '2024-25', subject: outsider.userId, familyId }),
          res(),
        ),
      ),
    ).rejects.toThrow(/not part of a family you can see/i);
  });

  it('refuses the whole household — a combined 112A is not a filing', async () => {
    await expect(
      owner.runAs(() =>
        downloadGrandfatheringCsv(req(owner.userId, { fy: '2024-25', subject: 'family', familyId }), res()),
      ),
    ).rejects.toThrow(/covers one person/i);
  });

  it('is unchanged for the caller themselves', async () => {
    const r = res();
    await owner.runAs(() => downloadGrandfatheringCsv(req(owner.userId, { fy: '2024-25' }), r));
    expect(r.body).toBe(`csv-for:${owner.userId}:2024-25`);
  });
});

describe('a family member’s holdings download with the caller’s portfolio picked', () => {
  // The picker lists the caller's own books; a member's report covers that
  // member's portfolios — the same rule the on-screen reports already follow.
  it('holdings export covers the member instead of failing Forbidden', async () => {
    const r = res();
    await owner.runAs(() =>
      getHoldingsExport(
        req(owner.userId, { format: 'json', subject: member.userId, familyId, portfolioIds: owner.portfolioId }),
        r,
      ),
    );
    expect(r.statusCode).toBe(200);
  });

  it('holdings statement covers the member instead of failing Forbidden', async () => {
    const r = res();
    await owner.runAs(() =>
      getStatementHoldings(
        req(owner.userId, { format: 'json', subject: member.userId, familyId, portfolioIds: owner.portfolioId }),
        r,
      ),
    );
    expect(r.statusCode).toBe(200);
  });

  it('still refuses another user’s portfolio on a self report', async () => {
    await expect(
      owner.runAs(() =>
        getStatementHoldings(req(owner.userId, { format: 'json', portfolioIds: outsider.portfolioId }), res()),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('Analytics harvest card scoped to one portfolio', () => {
  let secondPortfolioId: string;

  beforeAll(async () => {
    secondPortfolioId = await runAsSystem(async () => {
      const p = await prisma.portfolio.create({
        data: { userId: owner.userId, name: 'rt second', type: 'INVESTMENT', currency: 'INR' },
      });
      // A ₹100 loss in the first portfolio and a ₹1,000 loss in the second.
      for (const [portfolioId, avg, cost, value, key] of [
        [owner.portfolioId, '100', '1000', '900', 'name:rt-a'],
        [p.id, '500', '5000', '4000', 'name:rt-b'],
      ] as const) {
        await prisma.holdingProjection.create({
          data: {
            portfolioId,
            assetKey: key,
            assetClass: 'EQUITY',
            assetName: key,
            quantity: '10',
            avgCostPrice: avg,
            totalCost: cost,
            currentValue: value,
            sourceTxCount: 0,
          },
        });
      }
      return p.id;
    });
  }, 60_000);

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.holdingProjection.deleteMany({ where: { portfolioId: secondPortfolioId } });
      await prisma.portfolio.deleteMany({ where: { id: secondPortfolioId } });
    });
  });

  it('totals cover only the selected portfolio', async () => {
    const one = await owner.runAs(() =>
      getTaxHarvestSummary({ kind: 'portfolio', portfolioId: owner.portfolioId }),
    );
    expect(one.unrealisedLoss).toBe('100');
    expect(one.candidates.map((c) => c.assetName)).toEqual(['name:rt-a']);

    const all = await owner.runAs(() => getTaxHarvestSummary({ kind: 'user', userId: owner.userId }));
    expect(all.unrealisedLoss).toBe('1100');
  });
});

describe('report gates for a professional acting for a client', () => {
  function run(mw: (req: Request, res: Response, next: NextFunction) => void, r: Partial<Request>): Promise<unknown> {
    return new Promise((resolve) => mw(r as Request, {} as Response, (err?: unknown) => resolve(err ?? 'next')));
  }
  const freeCaForClient = {
    user: { id: 'ca', plan: 'FREE' },
    query: { clientId: 'c1' },
    header: () => undefined,
  } as unknown as Partial<Request>;
  const future = new Date('2099-01-01T00:00:00Z');

  it("follows the client's plan, not the professional's", async () => {
    const mw = requireFeatureForSubject('TAX_REPORT_CATALOG', async () => ({ plan: 'PLUS', planExpiresAt: null }));
    expect(await run(mw, freeCaForClient)).toBe('next');
  });

  it("refuses when the client's plan does not include it", async () => {
    const mw = requireFeatureForSubject('TAX_REPORT_CATALOG', async () => ({ plan: 'FREE', planExpiresAt: null }));
    expect(await run(mw, freeCaForClient)).toMatchObject({ statusCode: 403 });
  });

  it('a lapsed client plan does not count', async () => {
    const mw = requireFeatureForSubject('TAX_REPORT_CATALOG', async () => ({
      plan: 'PLUS',
      planExpiresAt: new Date('2020-01-01T00:00:00Z'),
    }));
    expect(await run(mw, freeCaForClient)).toMatchObject({ statusCode: 403 });
  });

  it('passes a grant refusal through (no grant, no report)', async () => {
    const mw = requireFeatureForSubject('TAX_REPORT_CATALOG', async () => {
      throw Object.assign(new Error('That client is not yours.'), { statusCode: 403 });
    });
    expect(await run(mw, freeCaForClient)).toMatchObject({ message: 'That client is not yours.' });
  });

  it('without a client, gates on the caller as before', async () => {
    let looked = false;
    const mw = requireFeatureForSubject('TAX_REPORT_CATALOG', async () => {
      looked = true;
      return { plan: 'PRO_ADVISOR', planExpiresAt: future };
    });
    const r = { user: { id: 'u', plan: 'FREE' }, query: {}, header: () => undefined } as unknown as Partial<Request>;
    expect(await run(mw, r)).toMatchObject({ statusCode: 403 });
    expect(looked).toBe(false);
  });

  it('a caller with the plan is not slowed by a client lookup', async () => {
    let looked = false;
    const mw = requireFeatureForSubject('TAX_REPORT_CATALOG', async () => {
      looked = true;
      return null;
    });
    expect(await run(mw, { ...freeCaForClient, user: { id: 'ca', plan: 'PLUS' } } as unknown as Partial<Request>)).toBe('next');
    expect(looked).toBe(false);
  });
});
