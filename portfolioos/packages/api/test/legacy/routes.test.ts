/**
 * Drives the Legacy Transfer routers over real HTTP so authenticate,
 * requireFeature, the step-up grant and the nominee session middleware are
 * all part of what is tested.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { legacyRouter, legacyPublicRouter, legacyViewRouter } from '../../src/routes/legacy.routes.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runInTransaction } from '../../src/lib/prisma.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { createLinkToken, createNomineeSession, issueNomineeOtp } from '../../src/services/legacy/tokens.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let s: TestScope;
let nomineeId: string;
let planId: string;
const tok = (plan: string) => signAccessToken({ sub: s.userId, email: `${s.userId}@test.local`, role: 'INVESTOR', plan }).token;

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json: json as { data?: Record<string, unknown> } | null };
}

beforeAll(async () => {
  s = await createTestScope('legacy-http');
  planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId, status: 'RELEASED', releasedAt: new Date() } }))).id;
  nomineeId = (await runAsSystem(() => prisma.legacyNominee.create({ data: {
    planId, userId: s.userId, nameEnc: encryptSecret('N'), emailEnc: encryptSecret('n@test.local'),
    relationship: 'Spouse', priority: 1, categories: ['INSURANCE'],
  } }))).id;
  const app = express();
  app.use(express.json());
  app.use('/api/legacy', legacyRouter);
  app.use('/api/legacy-public', legacyPublicRouter);
  app.use('/api/legacy-view', legacyViewRouter);
  app.get('/api/probe', authenticate, (_req, res) => { res.json({ ok: true }); });
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await runAsSystem(async () => {
    await prisma.legacyCode.deleteMany({ where: { userId: s.userId } });
    await prisma.legacyPlan.deleteMany({ where: { userId: s.userId } });
  });
  await s.cleanup();
});

describe('legacy routes', () => {
  it('nominee session opens /api/legacy-view and nothing else', async () => {
    const sess = await createNomineeSession(nomineeId, s.userId);
    const v = await call('GET', '/api/legacy-view', { 'x-legacy-session': sess });
    expect(v.status).toBe(200);
    expect((v.json!.data!.sections as Array<{ category: string }>)[0]!.category).toBe('INSURANCE');
    expect((await call('GET', '/api/probe', { 'x-legacy-session': sess })).status).toBe(401);
    expect((await call('GET', '/api/probe', { authorization: `Bearer ${sess}` })).status).toBe(401);
    expect((await call('GET', '/api/legacy-view')).status).toBe(401);
  });

  it('wrong OTP is refused; right OTP yields a working session', async () => {
    const access = await runAsSystem(() => runInTransaction((tx) =>
      createLinkToken(tx, { planId, userId: s.userId, nomineeId, purpose: 'ACCESS', cycle: 1, now: new Date() })));
    const code = await issueNomineeOtp(nomineeId, s.userId);
    const bad = await call('POST', `/api/legacy-public/access/${access}/session`, {}, { code: code === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(401);
    const good = await call('POST', `/api/legacy-public/access/${access}/session`, {}, { code });
    expect(good.status).toBe(200);
    const v = await call('GET', '/api/legacy-view', { 'x-legacy-session': good.json!.data!.session as string });
    expect(v.status).toBe(200);
  });

  it('unknown public link is a 404', async () => {
    expect((await call('POST', '/api/legacy-public/ack/not-a-token')).status).toBe(404);
  });

  it('FREE user cannot add a nominee', async () => {
    const r = await call('POST', '/api/legacy/nominees', { authorization: `Bearer ${tok('FREE')}` }, {});
    expect(r.status).toBe(403);
  });

  it('mutations without a step-up grant are refused', async () => {
    const r = await call('POST', '/api/legacy/deactivate', { authorization: `Bearer ${tok('PLUS')}` });
    expect(r.status).toBe(403);
  });

  it('owner can read the overview', async () => {
    const r = await call('GET', '/api/legacy', { authorization: `Bearer ${tok('PLUS')}` });
    expect(r.status).toBe(200);
    expect(r.json!.data!.status).toBe('RELEASED');
    expect(r.json!.data!.entitled).toBe(true);
  });
});
