import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { willRouter, rejectActAs } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { ForbiddenError } from '../../src/lib/errors.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = (plan: 'FREE' | 'PLUS' = 'PLUS') =>
  signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan }).token;

function call(method: string, path: string, body?: unknown, plan: 'FREE' | 'PLUS' | null = 'PLUS') {
  return fetch(`${base}/api/will${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(plan ? { authorization: `Bearer ${token(plan)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  user = await createTestScope('will-http');
  const app = express();
  // Same body limit as src/index.ts, so the will router's own size guard is what answers.
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await runAsSystem(() => prisma.will.deleteMany({ where: { userId: user.userId } }));
  await user.cleanup();
});

describe('/api/will gating', () => {
  it('requires auth', async () => expect((await call('GET', '/', undefined, null)).status).toBe(401));
  it('requires the PLUS plan', async () => expect((await call('GET', '/', undefined, 'FREE')).status).toBe(403));
  it('refuses a manager acting for a family profile', () => {
    const next = vi.fn();
    rejectActAs({ actor: { id: 'manager' } } as unknown as Request, {} as Response, next);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ForbiddenError);
    const next2 = vi.fn();
    rejectActAs({} as Request, {} as Response, next2);
    expect(next2).toHaveBeenCalledWith();
  });
});

describe('/api/will drafts', () => {
  let id = '';

  it('creates a draft (201) and audits it', async () => {
    const res = await call('POST', '/drafts', {});
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: string; version: number } };
    id = json.data.id;
    expect(json.data.version).toBe(1);
    const audit = await runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_created' } }));
    expect(audit?.resource).toBe(`Will:${id}`);
  });

  it('shows the draft on the overview', async () => {
    const res = await call('GET', '/');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string; draft: { id: string } } };
    expect(json.data.status).toBe('DRAFT');
    expect(json.data.draft.id).toBe(id);
  });

  it('saves a section, then refuses the old revision with 409', async () => {
    const ok = await call('PUT', `/drafts/${id}/sections/instructions`, { revision: 0, currentStep: 6, data: { text: 'Hello' } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { revision: number } }).data.revision).toBe(1);
    const stale = await call('PUT', `/drafts/${id}/sections/instructions`, { revision: 0, currentStep: 6, data: { text: 'Again' } });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { details: { reason: string } }).details.reason).toBe('WILL_REVISION_CONFLICT');
  });

  it('422 does not echo submitted values', async () => {
    const res = await call('PUT', `/drafts/${id}/sections/details`, {
      revision: 1, currentStep: 2, data: { legalName: `Zzyzx Secretname ${'x'.repeat(200)}`, address: 'Flat 9, Hidden Lane' },
    });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain('Zzyzx');
    expect(text).not.toContain('Hidden Lane');
  });

  it('refuses a body over 512 KB with 413', async () => {
    const big = { revision: 1, currentStep: 6, data: { text: 'x'.repeat(600 * 1024) } };
    const res = await call('PUT', `/drafts/${id}/sections/instructions`, big);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { code: string }).code).toBe('WILL_BODY_TOO_LARGE');
    expect((await call('POST', '/drafts', { fromWillId: 'x'.repeat(600 * 1024) })).status).toBe(413);
  });

  it('rejects an unknown section', async () => {
    expect((await call('PUT', `/drafts/${id}/sections/roles`, { revision: 1, currentStep: 3, data: {} })).status).toBe(400);
  });

  it('lists family suggestions (none here)', async () => {
    const res = await call('GET', '/people/suggestions');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { suggestions: unknown[] } }).data.suggestions).toEqual([]);
  });

  it('discards the draft (204) and audits it', async () => {
    expect((await call('DELETE', `/drafts/${id}`)).status).toBe(204);
    const audit = await runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_discarded' } }));
    expect(audit).not.toBeNull();
  });
});
