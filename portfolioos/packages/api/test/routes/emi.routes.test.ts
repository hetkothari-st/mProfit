import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { emiRouter } from '../../src/routes/emi.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = () => signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token;
const input = { principal: '100000', annualRatePct: '12', tenureMonths: 12, firstEmiDate: '2026-11-05' };

function post(format: string, body: unknown, auth = true) {
  return fetch(`${base}/api/emi/export?format=${format}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${token()}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  user = await createTestScope('emi-http');
  const app = express();
  app.use(express.json());
  app.use('/api/emi', emiRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await user.cleanup();
});

describe('POST /api/emi/export', () => {
  it('requires auth', async () => expect((await post('pdf', { input }, false)).status).toBe(401));
  it('returns a PDF', async () => {
    const res = await post('pdf', { input, title: 'Car loan' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('emi-schedule.pdf');
  });
  it('returns an xlsx', async () => {
    const res = await post('xlsx', { input });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
  });
  it('rejects an unknown format', async () => expect((await post('csv', { input })).status).toBe(400));
  it('rejects invalid input with the field name', async () => {
    const res = await post('pdf', { input: { ...input, tenureMonths: 999 } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details.field).toBe('tenureMonths');
  });
  it('maps EMI_TOO_LOW to 400', async () => {
    const res = await post('pdf', { input: { ...input, emiOverride: '100' } });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/emi/export rate limit', () => {
  it('the 11th export in a minute from one user returns 429', async () => {
    // A fresh user so earlier tests' requests do not count toward this window.
    const limited = await createTestScope('emi-limit');
    try {
      const auth = signAccessToken({ sub: limited.userId, email: `${limited.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token;
      const send = () => fetch(`${base}/api/emi/export?format=xlsx`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
        body: JSON.stringify({ input }),
      });
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) statuses.push((await send()).status);
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.cleanup();
    }
  });
});
