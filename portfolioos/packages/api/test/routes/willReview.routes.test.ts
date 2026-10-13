import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { istCalendarDate, willNextReviewDate } from '@everypaisa/shared';
import { willRouter } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { makeGeneratedWill, markExecuted, wipeWills } from '../will/willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let other: TestScope;
let willId = '';
let otherWillId = '';
let draftId = '';

function call(method: string, path: string, body?: unknown, as: () => TestScope = () => user) {
  const token = signAccessToken({ sub: as().userId, email: `${as().userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token;
  return fetch(`${base}/api/will${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  user = await createTestScope('will-review-http');
  ({ willId } = await makeGeneratedWill(user));
  await markExecuted(willId, '2024-10-01', '2026-10-01');
  other = await createTestScope('will-review-http-b');
  ({ willId: otherWillId } = await makeGeneratedWill(other));
  await markExecuted(otherWillId, '2024-10-01', '2026-10-01');
  const app = express();
  app.use(express.json());
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await wipeWills(user.userId);
  await user.cleanup();
  await wipeWills(other.userId);
  await other.cleanup();
});

describe('review and circumstances', () => {
  it('marks a signed will reviewed and audits it', async () => {
    const res = await call('POST', `/wills/${willId}/reviewed`, {});
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { nextReviewAt: string } };
    expect(json.data.nextReviewAt).toBe(willNextReviewDate(istCalendarDate(new Date())));
    const audit = await runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_reviewed' } }));
    expect(audit?.resource).toBe(`Will:${willId}`);
  });

  it('refuses a reason without a will to start from', async () => {
    expect((await call('POST', '/drafts', { reason: 'CIRCUMSTANCES_CHANGED' })).status).toBe(422);
  });

  it('"my circumstances changed" starts a new version and says why in the audit', async () => {
    const res = await call('POST', '/drafts', { fromWillId: willId, reason: 'CIRCUMSTANCES_CHANGED' });
    expect(res.status).toBe(201);
    const draft = (await res.json()) as { data: { id: string; version: number } };
    expect(draft.data.version).toBe(2);
    draftId = draft.data.id;
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_created', resource: `Will:${draft.data.id}` } }),
    );
    expect(audit?.metadata).toMatchObject({ cloned: true, reason: 'CIRCUMSTANCES_CHANGED' });
  });
});

describe('refusals', () => {
  it('only a signed will can be marked reviewed (409)', async () => {
    const res = await call('POST', `/wills/${draftId}/reviewed`, {});
    expect(res.status).toBe(409);
    expect(((await res.json()) as { details: { reason: string } }).details.reason).toBe('WILL_NOT_EXECUTED');
  });

  it('a will of another user or a missing one is a 404', async () => {
    expect((await call('POST', `/wills/${otherWillId}/reviewed`, {})).status).toBe(404);
    expect((await call('POST', '/wills/no-such-will/reviewed', {})).status).toBe(404);
  });

  it('a clone reason other than CIRCUMSTANCES_CHANGED is a 422', async () => {
    expect((await call('POST', '/drafts', { fromWillId: willId, reason: 'BORED' })).status).toBe(422);
  });
});
