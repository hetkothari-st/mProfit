/**
 * Act on it — fixes from the final review (C1, I1, I5, I6, I7, I8, I9).
 */
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem, runAsUser } from '../../../src/lib/requestContext.js';
import type { AdvisorRule, RecommendationDraft } from '../../../src/services/advisor/types.js';

const registry = vi.hoisted(() => ({ rules: [] as AdvisorRule[], unavailable: [] as string[] }));
vi.mock('../../../src/services/advisor/rules/index.js', () => ({
  get ADVISOR_RULES() {
    return registry.rules;
  },
}));
vi.mock('../../../src/services/advisor/actOnItFacts.builder.js', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    buildActOnItFacts: async (...args: unknown[]) => {
      const f = await (real.buildActOnItFacts as (...a: unknown[]) => Promise<Record<string, unknown>>)(...args);
      return { ...f, unavailable: [...(f.unavailable as string[]), ...registry.unavailable] };
    },
  };
});

const { runAdvisorEngine } = await import('../../../src/services/advisor/advisorEngine.service.js');
const { confirmFromData } = await import('../../../src/services/actOnIt/confirm.js');
const { measureDue } = await import('../../../src/services/actOnIt/measure.js');

const DAY = 86_400_000;
const NOW = new Date('2026-11-06T06:00:00Z');
const T0 = new Date('2025-06-02T06:00:00Z');
const scopes: TestScope[] = [];
const FUNDS = ['TEST-RF-LIQ', 'TEST-RF-EQ', 'TEST-RF-OTHER'];
const fund: Record<string, string> = {};

afterAll(async () => {
  for (const s of scopes) {
    await runAsSystem(async () => {
      await prisma.transaction.deleteMany({ where: { portfolioId: s.portfolioId } });
      await prisma.advisorRecommendation.updateMany({ where: { userId: s.userId }, data: { supersededById: null } });
      await prisma.advisorRecommendation.deleteMany({ where: { userId: s.userId } });
      await prisma.advisorRun.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  }
  await runAsSystem(() => prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { in: FUNDS } } }));
});

beforeEach(() => {
  registry.rules = [];
  registry.unavailable = [];
});

async function scope(label: string) {
  const s = await createTestScope(label);
  scopes.push(s);
  if (!fund.liq) {
    await runAsSystem(async () => {
      fund.liq = (await prisma.mutualFundMaster.create({ data: { schemeCode: FUNDS[0]!, schemeName: 'Test Liquid', amcName: 'T', category: 'DEBT', subCategory: 'Liquid Fund' } })).id;
      fund.eq = (await prisma.mutualFundMaster.create({ data: { schemeCode: FUNDS[1]!, schemeName: 'Test Equity', amcName: 'T', category: 'EQUITY', subCategory: 'Flexi Cap Fund' } })).id;
      fund.other = (await prisma.mutualFundMaster.create({ data: { schemeCode: FUNDS[2]!, schemeName: 'Test Other', amcName: 'T', category: 'EQUITY', subCategory: 'Mid Cap Fund' } })).id;
    });
  }
  return s;
}

async function rec(s: TestScope, over: Record<string, unknown>) {
  return runAsUser(s.userId, async () => {
    const run = await prisma.advisorRun.create({ data: { userId: s.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' } });
    return prisma.advisorRecommendation.create({
      data: {
        userId: s.userId, generationRunId: run.id, ruleId: 'IDLE_CASH_PARKING', ruleVersion: 1, category: 'IDLE_CASH_PARKING', priority: 22,
        action: [], rationale: 'r', inputsSnapshot: {}, dedupeKey: 'k', headline: 'h', createdAt: T0,
        promise: { gainInr: '6300.00', riskBand: 'LOW', costInr: '0.00', liquidity: null, confidence: 'HIGH' },
        measurement: { method: 'NAV_VS_CASH', horizonDays: 365, baseline: { amountInr: '180000.00', savingsRatePct: 3, referenceFundId: null, fundKind: 'LIQUID' } },
        ...over,
      } as never,
    });
  });
}

const buy = (s: TestScope, fundId: string, amount: string, type = 'BUY', date = '2025-06-05', extra: Record<string, unknown> = {}) =>
  runAsUser(s.userId, () => prisma.transaction.create({
    data: { portfolioId: s.portfolioId, assetClass: 'MUTUAL_FUND', transactionType: type as never, tradeDate: new Date(date), fundId, assetName: 'x', quantity: '1', price: amount, grossAmount: amount, netAmount: amount, ...extra },
  }));
const get = (s: TestScope, id: string) => runAsUser(s.userId, () => prisma.advisorRecommendation.findUniqueOrThrow({ where: { id } }));

describe('final review fixes (DB)', () => {
  it('C1: a move made without tapping Accept is confirmed even after the engine withdrew the advice', async () => {
    const s = await scope('rf-c1');
    const r = await rec(s, { status: 'WITHDRAWN' });
    await buy(s, fund.liq!, '180000');
    expect(await runAsUser(s.userId, () => confirmFromData(s.userId, new Date(T0.getTime() + 10 * DAY)))).toBe(1);
    expect(await get(s, r.id)).toMatchObject({ status: 'DONE', confirmedBy: 'DATA' });
  });

  it('I6: cash-deployment advice is confirmed only by its own fund, within ±20%', async () => {
    const s = await scope('rf-i6a');
    const base = { ruleId: 'CASH_DEPLOYMENT', category: 'CASH_DEPLOYMENT', measurement: { method: 'NAV_VS_CASH', horizonDays: 365, baseline: { amountInr: '100000.00', savingsRatePct: 3, fundId: null, referenceFundId: null } } };
    const r = await rec(s, { ...base, measurement: { ...base.measurement, baseline: { ...base.measurement.baseline, fundId: fund.eq, referenceFundId: fund.eq } } });
    await buy(s, fund.other!, '100000'); // an unrelated fund
    expect(await runAsUser(s.userId, () => confirmFromData(s.userId, new Date(T0.getTime() + 10 * DAY)))).toBe(0);
    await buy(s, fund.eq!, '300000'); // the right fund, but three times the amount
    expect(await runAsUser(s.userId, () => confirmFromData(s.userId, new Date(T0.getTime() + 10 * DAY)))).toBe(0);
    expect((await get(s, r.id)).status).toBe('OPEN');
  });

  it('I6: selling one unit does not confirm gain booking', async () => {
    const s = await scope('rf-i6b');
    const r = await rec(s, { ruleId: 'LTCG_BOOKING', category: 'LTCG_BOOKING', measurement: { method: 'TAX_SAVED', horizonDays: 300, baseline: { kind: 'LTCG_BOOKING', bookInr: '100000.00', sellInr: '400000.00', ratePct: 12.5, isin: 'INE000T01019', assetName: 'Test Bluechip', realisedAtAdvice: '25000.00', exemptionInr: '125000.00', fy: '2025-26' } } });
    await runAsUser(s.userId, () => prisma.transaction.create({ data: { portfolioId: s.portfolioId, assetClass: 'EQUITY', transactionType: 'SELL', tradeDate: new Date('2025-06-05'), isin: 'INE000T01019', assetName: 'Test Bluechip', quantity: '1', price: '400', grossAmount: '400', netAmount: '400' } }));
    expect(await runAsUser(s.userId, () => confirmFromData(s.userId, new Date(T0.getTime() + 10 * DAY)))).toBe(0);
    expect((await get(s, r.id)).status).toBe('OPEN');
  });

  it('I5: skipped advice re-issued later is counted as missed once, not twice', async () => {
    const s = await scope('rf-i5');
    const first = await rec(s, { status: 'EXPIRED' });
    await rec(s, { status: 'EXPIRED', createdAt: new Date(T0.getTime() + 40 * DAY) });
    await runAsUser(s.userId, () => measureDue(s.userId, new Date('2026-08-01T00:00:00Z')));
    const f = await get(s, first.id);
    expect(f.outcomeStatus).toBe('NOT_MEASURED');
    expect((f.outcomeDetail as { reason: string }).reason).toMatch(/newer/);
  });

  it('I7: gain booking is priced from gains actually booked; loss harvesting is not priced on a guess', async () => {
    const s = await scope('rf-i7');
    const ltcg = await rec(s, { status: 'DONE', confirmedBy: 'DATA', confirmedAt: T0, ruleId: 'LTCG_BOOKING', category: 'LTCG_BOOKING', measurement: { method: 'TAX_SAVED', horizonDays: 30, baseline: { kind: 'LTCG_BOOKING', bookInr: '100000.00', sellInr: '400000.00', ratePct: 12.5, realisedAtAdvice: '0.00', exemptionInr: '125000.00', fy: '2025-26' } } });
    const tlh = await rec(s, { status: 'DONE', confirmedBy: 'DATA', confirmedAt: T0, ruleId: 'TAX_LOSS_HARVEST', category: 'TAX_HARVEST', dedupeKey: 'tlh', measurement: { method: 'TAX_SAVED', horizonDays: 30, baseline: { lossInr: '50000.00', ratePct: 20 } } });
    await runAsUser(s.userId, () => measureDue(s.userId, new Date('2026-08-01T00:00:00Z')));
    // Nothing was booked in the records: no ₹12,500 claimed.
    expect((await get(s, ltcg.id)).outcomeInr?.toString()).toBe('0');
    expect((await get(s, tlh.id)).outcomeStatus).toBe('NOT_MEASURED');
  });

  const draft = (over: Partial<RecommendationDraft> = {}): RecommendationDraft => ({
    ruleId: 'TEST_RF', ruleVersion: 1, category: 'FD_MATURITY', priority: 6, action: [], rationale: 'FD of 200000.00 matures.', inputsUsed: { a: 1 },
    provenance: { kind: 'NONE' }, dedupeKey: 'fd', headline: 'FD matures', promise: { gainInr: null, riskBand: 'LOW', costInr: null, liquidity: null, confidence: 'HIGH' },
    measurement: { method: 'NOT_MEASURED', horizonDays: 0, baseline: {} }, expiresAt: new Date(NOW.getTime() + 9 * DAY), urgentUntil: null, ...over,
  });

  it('I8: advice turns urgent as its deadline comes inside a week, on a plain refresh', async () => {
    const s = await scope('rf-i8');
    registry.rules = [{ id: 'TEST_RF', version: 1, description: 't', evaluate: () => [draft()] }];
    await runAsUser(s.userId, () => runAdvisorEngine(s.userId, { asOf: NOW }));
    const deadline = new Date(NOW.getTime() + 9 * DAY);
    registry.rules = [{ id: 'TEST_RF', version: 1, description: 't', evaluate: () => [draft({ urgentUntil: deadline })] }];
    await runAsUser(s.userId, () => runAdvisorEngine(s.userId, { asOf: new Date(NOW.getTime() + 3 * DAY) }));
    const rows = await runAsUser(s.userId, () => prisma.advisorRecommendation.findMany({ where: { userId: s.userId } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.urgentUntil?.toISOString()).toBe(deadline.toISOString());
  });

  it('I9: open advice from before tracking is re-issued under the new contract, not hidden', async () => {
    const s = await scope('rf-i9');
    const old = await rec(s, { ruleId: 'TEST_RF', category: 'FD_MATURITY', dedupeKey: 'fd', headline: null, promise: null, measurement: null, outcomeStatus: 'BEFORE_TRACKING', createdAt: NOW, status: 'OPEN' });
    registry.rules = [{ id: 'TEST_RF', version: 1, description: 't', evaluate: () => [draft()] }];
    await runAsUser(s.userId, () => runAdvisorEngine(s.userId, { asOf: NOW }));
    const o = await get(s, old.id);
    expect(o.supersededById).not.toBeNull();
    const n = await get(s, o.supersededById!);
    expect(n).toMatchObject({ status: 'OPEN', headline: 'FD matures', outcomeStatus: 'NOT_MEASURED' });
  });

  it('I1: when a data source fails, rules that need it are skipped and their advice stays', async () => {
    const s = await scope('rf-i1');
    registry.rules = [{ id: 'TEST_RF', version: 1, description: 't', needs: ['fds'], evaluate: () => [draft()] }];
    await runAsUser(s.userId, () => runAdvisorEngine(s.userId, { asOf: NOW }));
    registry.unavailable = ['fds'];
    registry.rules = [{ id: 'TEST_RF', version: 1, description: 't', needs: ['fds'], evaluate: () => [] }];
    const r = await runAsUser(s.userId, () => runAdvisorEngine(s.userId, { asOf: NOW }));
    expect(r.ruleErrors.TEST_RF).toMatch(/unavailable/);
    const rows = await runAsUser(s.userId, () => prisma.advisorRecommendation.findMany({ where: { userId: s.userId } }));
    expect(rows.map((x) => x.status)).toEqual(['OPEN']);
  });
});
