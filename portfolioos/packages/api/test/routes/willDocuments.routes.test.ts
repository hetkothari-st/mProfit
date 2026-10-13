import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { willRouter } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { recordWillExecution } from '../../src/services/will/willExecute.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { FAKE_PDF, PNG_BYTES, makeGeneratedWill, wipeWills } from '../will/willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/**
 * Ruling: a user always reaches their own existing will documents, whatever
 * their plan. A FREE (downgraded) user downloads the PDF and the signed copy
 * and lists the live will; everything else stays behind the WILL_MAKER gate.
 */
let server: Server;
let base: string;
let owner: TestScope;
let other: TestScope;
let empty: TestScope;
let willId = '';
let versionId = '';
let otherWillId = '';
let otherVersionId = '';

const auth = (s: TestScope, plan: 'FREE' | 'PLUS' = 'FREE') => ({
  authorization: `Bearer ${signAccessToken({ sub: s.userId, email: `${s.userId}@test.local`, role: 'INVESTOR', plan }).token}`,
});
const get = (s: TestScope, path: string) => fetch(`${base}/api/will${path}`, { headers: auth(s) });

beforeAll(async () => {
  owner = await createTestScope('will-docs-owner');
  other = await createTestScope('will-docs-other');
  empty = await createTestScope('will-docs-empty');
  ({ willId, versionId } = await makeGeneratedWill(owner));
  await owner.runAs(() =>
    recordWillExecution(owner.userId, willId, { fields: { executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'] }, file: { buffer: PNG_BYTES } }, { today: () => '2026-11-02' }),
  );
  ({ willId: otherWillId, versionId: otherVersionId } = await makeGeneratedWill(other));
  await other.runAs(() =>
    recordWillExecution(other.userId, otherWillId, { fields: { executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'] }, file: { buffer: PNG_BYTES } }, { today: () => '2026-11-02' }),
  );
  const app = express();
  app.use(express.json());
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  for (const s of [owner, other, empty]) {
    await wipeWills(s.userId);
    await s.cleanup();
  }
});

describe('a FREE user and their own will documents', () => {
  it('lists the live will without personal data', async () => {
    const res = await get(owner, '/documents');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({ willId, version: 1, status: 'EXECUTED', versionId, hasSignedCopy: true });
  });

  it('downloads the will PDF and audits it', async () => {
    const res = await get(owner, `/versions/${versionId}/pdf`);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(FAKE_PDF)).toBe(true);
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: owner.userId, action: 'will_downloaded', resource: `WillVersion:${versionId}` } }),
    );
    expect(audit).not.toBeNull();
  });

  it('downloads the signed copy and audits it', async () => {
    const res = await get(owner, `/wills/${willId}/signed-copy`);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: owner.userId, action: 'will_downloaded', resource: `Will:${willId}` } }),
    );
    expect(audit?.metadata).toMatchObject({ kind: 'signed_copy' });
  });

  it('cannot reach the rest of Will Maker', async () => {
    const res = await get(owner, '/');
    expect(res.status).toBe(403);
    expect((await get(owner, `/wills/${willId}/execution`)).status).toBe(403);
  });

  it('cannot download the files of another user', async () => {
    expect((await get(owner, `/versions/${otherVersionId}/pdf`)).status).toBe(404);
    expect((await get(owner, `/wills/${otherWillId}/signed-copy`)).status).toBe(404);
  });

  it('needs to be signed in', async () => {
    expect((await fetch(`${base}/api/will/documents`)).status).toBe(401);
    expect((await fetch(`${base}/api/will/wills/${willId}/signed-copy`)).status).toBe(401);
  });

  it('is null when there is no live will', async () => {
    const res = await get(empty, '/documents');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toBeNull();
  });
});
