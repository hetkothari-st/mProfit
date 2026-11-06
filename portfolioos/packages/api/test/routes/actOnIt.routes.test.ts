/**
 * `/api/act-on-it` over real HTTP: plan gate, the page, actions, why, the
 * pop-up, another user's advice, and what the ₹ total counts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { actOnItRouter } from '../../src/routes/actOnIt.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let a: TestScope;
let b: TestScope;
let tokenA: string;
let tokenB: string;
let tokenFree: string;
const ids: Record<string, string> = {};

async function call(method: string, path: string, token: string | null = tokenA) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: res.status, body: (await res.json()) as { success: boolean; data?: any } };
}

describe('/api/act-on-it routes', () => {
  beforeAll(async () => {
    a = await createTestScope('aoi-routes-a');
    b = await createTestScope('aoi-routes-b');
    const email = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true } })).email;
    tokenA = signAccessToken({ sub: a.userId, email: await email(a.userId), role: 'INVESTOR', plan: 'PLUS' }).token;
    tokenB = signAccessToken({ sub: b.userId, email: await email(b.userId), role: 'INVESTOR', plan: 'PLUS' }).token;
    tokenFree = signAccessToken({ sub: b.userId, email: await email(b.userId), role: 'INVESTOR', plan: 'FREE' }).token;
    await runAsUser(a.userId, async () => {
      const run = await prisma.advisorRun.create({ data: { userId: a.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' } });
      const base = { userId: a.userId, generationRunId: run.id, ruleId: 'IDLE_CASH_PARKING', ruleVersion: 1, category: 'IDLE_CASH_PARKING' as const, priority: 22, action: [], rationale: 'Move ₹1,80,000.00 to a liquid fund.', headline: 'Your ₹1,80,000.00 is resting. Put it to work.' };
      const promise = { gainInr: '6300.00', riskBand: 'LOW', costInr: '0.00', liquidity: '1 working day', confidence: 'HIGH' };
      const measurement = { method: 'NAV_VS_CASH', horizonDays: 365, baseline: { amountInr: '180000.00', savingsRatePct: 3, expectedYieldPct: 6.5 } };
      const inputs = { bufferInr: '120000', balanceMonths: [{ month: '2026-09', balance: '295000' }, { month: '2026-10', balance: '300000' }], savingsRatePct: 3 };
      ids.open = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'open', promise, measurement, inputsSnapshot: inputs } })).id;
      ids.gain = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'g', promise, measurement, inputsSnapshot: {}, status: 'DONE', confirmedBy: 'DATA', outcomeStatus: 'MEASURED', outcomeInr: '18900' } })).id;
      ids.user = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'u', promise, measurement, inputsSnapshot: {}, status: 'DONE', confirmedBy: 'USER', outcomeStatus: 'NOT_MEASURED' } })).id;
      ids.miss = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'm', promise, measurement, inputsSnapshot: {}, status: 'DISMISSED', outcomeStatus: 'MEASURED', outcomeInr: '-9400' } })).id;
      // Followed but lost money; skipped and the path would have lost (skipping saved).
      ids.lost = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'l', promise, measurement, inputsSnapshot: {}, status: 'DONE', confirmedBy: 'DATA', outcomeStatus: 'MEASURED', outcomeInr: '-1500' } })).id;
      ids.avoided = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'v', promise, measurement, inputsSnapshot: {}, status: 'EXPIRED', outcomeStatus: 'MEASURED', outcomeInr: '2000' } })).id;
      ids.old = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'o', promise, measurement, inputsSnapshot: {}, status: 'ACCEPTED', outcomeStatus: 'BEFORE_TRACKING' } })).id;
      ids.prompt = (await prisma.advicePrompt.create({ data: { userId: a.userId, recommendationId: ids.open, kind: 'NEW' } })).id;
    });
    const app = express();
    app.use(express.json());
    app.use('/api/act-on-it', actOnItRouter);
    app.use(errorHandler);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    for (const s of [a, b]) {
      await runAsSystem(async () => {
        await prisma.advicePrompt.deleteMany({ where: { userId: s.userId } });
        await prisma.advisorRecommendation.deleteMany({ where: { userId: s.userId } });
        await prisma.advisorRun.deleteMany({ where: { userId: s.userId } });
      });
      await s.cleanup();
    }
  });

  it('needs a login and a plan with advice', async () => {
    expect((await call('GET', '/api/act-on-it', null)).status).toBe(401);
    expect((await call('GET', '/api/act-on-it', tokenFree)).status).toBe(403);
  });

  it('shows the advice, and a track record that counts only what the data proves', async () => {
    const { status, body } = await call('GET', '/api/act-on-it');
    expect(status).toBe(200);
    const v = body.data;
    expect(v.current).toMatchObject({ id: ids.open, gainInr: '6300.00', riskBand: 'LOW', state: 'OPEN', whyNow: { kind: 'BALANCE', bufferInr: '120000.00' } });
    expect(v.current.twoPaths).toMatchObject({ amountInr: '180000.00', doNothingRatePct: 3, actRatePct: 6.5 });
    // The user's own claim and the before-tracking advice never add to the totals.
    // Followed advice counts at its real result (a loss included); only skips that would have earned count as missed.
    expect(v.record).toMatchObject({ given: 6, acted: 3, confirmed: 2, skipped: 2, totalInr: '17400.00', missedInr: '9400.00', measured: 4 });
    const state = (id: string) => v.history.find((h: { id: string }) => h.id === id);
    expect(state(ids.gain)).toMatchObject({ state: 'CONFIRMED', outcome: 'GAINED', outcomeInr: '18900.00' });
    expect(state(ids.miss)).toMatchObject({ state: 'SKIPPED', outcome: 'MISSED', outcomeInr: '-9400.00' });
    expect(state(ids.user)).toMatchObject({ state: 'CONFIRMED_BY_USER', outcome: 'NOT_MEASURED' });
    expect(state(ids.old)).toMatchObject({ state: 'BEFORE_TRACKING', outcome: 'BEFORE_TRACKING' });
    expect(state(ids.lost)).toMatchObject({ state: 'CONFIRMED', outcome: 'LOST', outcomeInr: '-1500.00' });
    expect(state(ids.avoided)).toMatchObject({ state: 'SKIPPED', outcome: 'AVOIDED', outcomeInr: '2000.00' });
    expect(v.compliance.line).toMatch(/Advice, not a guarantee of returns/);
  });

  it('why explains the facts and how it will be measured', async () => {
    const { body } = await call('GET', `/api/act-on-it/${ids.open}/why`);
    expect(body.data.facts).toEqual(expect.arrayContaining([{ label: '3 months of spending', value: '120000.00', kind: 'inr' }]));
    expect(body.data.measuredBy).toMatch(/savings account/);
    expect(body.data.tracked).toBe(true);
    expect(body.data.category).toBe('IDLE_CASH_PARKING');
  });

  it('the pop-up shows once', async () => {
    const p = await call('GET', '/api/act-on-it/popup');
    expect(p.body.data).toMatchObject({ promptId: ids.prompt, recommendationId: ids.open, gainInr: '6300.00' });
    await call('POST', `/api/act-on-it/popup/${ids.prompt}/seen`);
    expect((await call('GET', '/api/act-on-it/popup')).body.data).toBeNull();
  });

  it("accept moves it on; another user cannot touch it; a finished one can't be dismissed", async () => {
    expect((await call('POST', `/api/act-on-it/${ids.open}/accept`, tokenB)).status).toBe(404);
    const r = await call('POST', `/api/act-on-it/${ids.open}/accept`);
    expect(r.status).toBe(200);
    expect(r.body.data.current).toBeNull();
    expect(r.body.data.history.find((h: { id: string }) => h.id === ids.open)).toMatchObject({ state: 'ACCEPTED', outcome: 'WAITING' });
    expect((await call('POST', `/api/act-on-it/${ids.gain}/dismiss`)).status).toBe(400);
  });
});
