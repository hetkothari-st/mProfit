import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { istCalendarDate, WILL_SECTIONS, willSectionData } from '@everypaisa/shared';
import { willRouter } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createWillDraft, saveWillSection } from '../../src/services/will/will.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { validWillPayload } from '../will/willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let other: TestScope;
const auth = (s: TestScope) => ({
  authorization: `Bearer ${signAccessToken({ sub: s.userId, email: `${s.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token}`,
});
const audit = (action: string) =>
  runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action }, orderBy: { createdAt: 'desc' } }));

beforeAll(async () => {
  user = await createTestScope('will-gen-http');
  other = await createTestScope('will-gen-http-b');
  const app = express();
  app.use(express.json());
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId: user.userId } });
    await prisma.will.deleteMany({ where: { userId: { in: [user.userId, other.userId] } } });
  });
  await user.cleanup();
  await other.cleanup();
});

const today = () => istCalendarDate(new Date());

describe('preview, generate, download over HTTP', () => {
  let willId = '';
  let revision = 0;
  let versionId = '';

  it('preview is refused with rule ids while blockers remain, without echoing the draft', async () => {
    const d = await user.runAs(() => createWillDraft(user.userId, null));
    willId = d.id;
    await user.runAs(() => saveWillSection(user.userId, willId, 'details', { revision: 0, currentStep: 2, data: { ...validWillPayload().details, address: '' } }));
    revision = 1;
    const res = await fetch(`${base}/api/will/drafts/${willId}/preview`, { headers: auth(user) });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(JSON.parse(text).details.reason).toBe('WILL_BLOCKED');
    expect(text).not.toContain('Ramesh');
  });

  it('preview works once the will is complete, and is audited', async () => {
    const p = validWillPayload();
    for (const section of WILL_SECTIONS) {
      revision = (await user.runAs(() => saveWillSection(user.userId, willId, section, { revision, currentStep: 8, data: willSectionData(p, section) }))).revision;
    }
    const res = await fetch(`${base}/api/will/drafts/${willId}/preview`, { headers: auth(user) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { templateId: string; document: unknown[] } };
    expect(json.data.templateId).toBe('isa-hindu');
    expect(json.data.document.length).toBeGreaterThan(5);
    expect((await audit('will_viewed'))?.resource).toBe(`Will:${willId}`);
  });

  it('generate answers 409 to a stale revision and 503 when the keys are missing', async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/will/drafts/${willId}/generate`, { method: 'POST', headers: { ...auth(user), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const stale = await post({ revision: revision - 1, acknowledge: true, generatedOn: today() });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { details: { reason: string } }).details.reason).toBe('WILL_REVISION_CONFLICT');

    const key = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    try {
      const res = await post({ revision, acknowledge: true, generatedOn: today() });
      expect(res.status).toBe(503);
      expect(((await res.json()) as { code: string }).code).toBe('WILL_KEYS_UNAVAILABLE');
    } finally {
      process.env.APP_ENCRYPTION_KEY = key;
    }
  });

  it('generate needs the acknowledgement, then returns 201 and audits it', async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/will/drafts/${willId}/generate`, { method: 'POST', headers: { ...auth(user), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ revision, acknowledge: false, generatedOn: today() })).status).toBe(400);
    expect((await post({ revision, acknowledge: true })).status).toBe(422);
    const outdated = await post({ revision, acknowledge: true, generatedOn: '2000-01-01' });
    expect(outdated.status).toBe(409);
    expect(((await outdated.json()) as { details: { reason: string } }).details.reason).toBe('WILL_PREVIEW_OUTDATED');
    const res = await post({ revision, acknowledge: true, generatedOn: today() });
    expect(res.status).toBe(201);
    versionId = ((await res.json()) as { data: { version: { id: string } } }).data.version.id;
    const row = await audit('will_generated');
    expect(row?.metadata).toMatchObject({ versionId, versionNo: 1, acknowledged: true });
  });

  it('downloads the PDF, audited; another user gets 404', async () => {
    const res = await fetch(`${base}/api/will/versions/${versionId}/pdf`, { headers: auth(user) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('will-v1.pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await audit('will_downloaded'))?.resource).toBe(`WillVersion:${versionId}`);
    expect((await fetch(`${base}/api/will/versions/${versionId}/pdf`, { headers: auth(other) })).status).toBe(404);
  });
});
