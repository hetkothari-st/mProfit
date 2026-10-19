import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { notificationsRouter } from '../../src/routes/notifications.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = () => signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'FREE' }).token;
const url = () => `${base}/api/notifications/preferences`;
const get = (auth = true) => fetch(url(), { headers: auth ? { authorization: `Bearer ${token()}` } : {} });
const put = (body: unknown) =>
  fetch(url(), { method: 'PUT', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  user = await createTestScope('loan-alert-prefs');
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await user.cleanup();
});

describe('/api/notifications/preferences', () => {
  it('requires auth', async () => expect((await get(false)).status).toBe(401));

  it('loan rate alerts are on by default', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ loanRateAlerts: true });
  });

  it('turning them off is saved on the user', async () => {
    const res = await put({ loanRateAlerts: false });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ loanRateAlerts: false });
    expect((await (await get()).json()).data).toEqual({ loanRateAlerts: false });
    const row = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { loanRateAlerts: true } }));
    expect(row.loanRateAlerts).toBe(false);
    await put({ loanRateAlerts: true });
  });

  it('rejects anything but a boolean flag', async () => {
    expect((await put({ loanRateAlerts: 'no' })).status).toBe(422);
    expect((await put({})).status).toBe(422);
    expect((await put({ loanRateAlerts: true, role: 'ADMIN' })).status).toBe(422);
  });
});
