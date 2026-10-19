import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { istCalendarDate } from '@everypaisa/shared';
import { willRouter } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { FAKE_PDF, HTML_BYTES, makeGeneratedWill, wipeWills } from '../will/willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let willId = '';
/** The will is generated on 2026-10-12 (fixture TODAY); the route checks against the real date. */
const signedOn = '2026-10-12';

const auth = () => ({
  authorization: `Bearer ${signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token}`,
});

function upload(fieldsIn: Record<string, string>, file?: { bytes: Buffer; name: string; type: string }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fieldsIn)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  return fetch(`${base}/api/will/wills/${willId}/execution`, { method: 'POST', headers: auth(), body: fd });
}

const okFields = { executedOn: signedOn, witness1: 'Asha Rao', witness2: 'Vikram Shah' };
const pdfFile = { bytes: FAKE_PDF, name: 'scan.pdf', type: 'application/pdf' };

beforeAll(async () => {
  user = await createTestScope('will-exec-http');
  ({ willId } = await makeGeneratedWill(user));
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
});

describe('POST /api/will/wills/:id/execution', () => {
  it('runs on or after the fixture generation date', () => {
    expect(istCalendarDate(new Date()) >= signedOn).toBe(true);
  });

  it('422 lists paths and codes, never the names', async () => {
    const res = await upload({ executedOn: signedOn, witness1: 'Zzyzx Secretwitness', witness2: 'Q' }, pdfFile);
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain('Zzyzx');
    expect(JSON.parse(text).details.issues).toEqual([{ path: 'witnesses.1', code: 'too_small' }]);
  });

  it('refuses a disallowed extension', async () => {
    const res = await upload(okFields, { bytes: FAKE_PDF, name: 'scan.exe', type: 'application/octet-stream' });
    expect(res.status).toBe(400);
    expect((await res.json()).details.reason).toBe('WILL_UPLOAD_TYPE');
  });

  it('HTML bytes named .pdf are refused', async () => {
    const res = await upload(okFields, { bytes: HTML_BYTES, name: 'scan.pdf', type: 'application/pdf' });
    expect(res.status).toBe(400);
    expect((await res.json()).details.reason).toBe('WILL_UPLOAD_TYPE');
  });

  it('a file over 20 MB is a 413', async () => {
    const big = Buffer.concat([FAKE_PDF, Buffer.alloc(21 * 1024 * 1024)]);
    const res = await upload(okFields, { bytes: big, name: 'scan.pdf', type: 'application/pdf' });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { code: string }).code).toBe('WILL_UPLOAD_TOO_LARGE');
  });

  it('stores the signed copy and audits it without names', async () => {
    const res = await upload(okFields, pdfFile);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string; witnesses: string[]; signedCopy: { mimeType: string } } };
    expect(json.data).toMatchObject({ status: 'EXECUTED', witnesses: ['Asha Rao', 'Vikram Shah'] });
    expect(json.data.signedCopy.mimeType).toBe('application/pdf');
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_execute_upload' }, orderBy: { createdAt: 'desc' } }),
    );
    expect(audit?.resource).toBe(`Will:${willId}`);
    expect(audit?.metadata).toMatchObject({ versionNo: 1, newCopy: true, replacedCopy: false, mimeType: 'application/pdf' });
    expect(JSON.stringify(audit)).not.toMatch(/Asha|Vikram/);
  });
});

describe('reading it back', () => {
  it('returns the execution record', async () => {
    const res = await fetch(`${base}/api/will/wills/${willId}/execution`, { headers: auth() });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { executedOn: string } }).data.executedOn).toBe(signedOn);
  });

  it('downloads the signed copy, uncached, and audits it', async () => {
    const res = await fetch(`${base}/api/will/wills/${willId}/signed-copy`, { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(FAKE_PDF)).toBe(true);
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_downloaded', resource: `Will:${willId}` } }),
    );
    expect(audit?.metadata).toMatchObject({ kind: 'signed_copy', versionNo: 1 });
  });
});

describe('real-sized signed copies (over the 512 KB JSON cap)', () => {
  it('accepts a ~2 MB PDF', async () => {
    const twoMb = Buffer.concat([FAKE_PDF, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await upload(okFields, { bytes: twoMb, name: 'scan.pdf', type: 'application/pdf' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { signedCopy: { sizeBytes: number } } };
    expect(json.data.signedCopy.sizeBytes).toBe(twoMb.length);
  });
});
