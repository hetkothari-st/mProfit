/**
 * `/api/spending` over real HTTP: authentication, validation, and a user's
 * payee tag sorting their payments. Uses a real Express app on a random port.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import { spendingRouter } from '../../src/routes/spending.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let scope: TestScope;
let token: string;

async function call(method: string, path: string, body?: unknown, auth = true) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as { success: boolean; data?: any } };
}

describe('/api/spending routes', () => {
  beforeAll(async () => {
    scope = await createTestScope('spend-routes');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } });
    token = signAccessToken({ sub: scope.userId, email: user.email, role: 'INVESTOR', plan: 'FREE' }).token;
    await runAsUser(scope.userId, () =>
      prisma.spendTxn.create({
        data: {
          userId: scope.userId, source: 'canonical_event', sourceAdapter: 'test', sourceRef: 'r1',
          txnDate: new Date(), amount: '1200', direction: 'DEBIT', mode: 'UPI',
          counterparty: 'RAMESH KUMAR', category: 'uncategorised', categorySrc: 'none',
        },
      }),
    );
    const app = express();
    app.use(express.json());
    app.use('/api/spending', spendingRouter);
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await scope.cleanup();
  });

  it('needs a login', async () => {
    expect((await call('GET', '/api/spending/payees/uncategorised', undefined, false)).status).toBe(401);
  });

  it('lists unsorted payees and sorts them when tagged', async () => {
    const list = await call('GET', '/api/spending/payees/uncategorised?limit=5');
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([{ payeeKey: 'ramesh kumar', label: 'RAMESH KUMAR', count: 1, total: '1200.00' }]);

    const tag = await call('PUT', '/api/spending/payees/category', { payeeKey: 'ramesh kumar', category: 'domestic_help' });
    expect(tag.status).toBe(200);
    expect(tag.body.data).toEqual({ changed: 1, uncategorised: [] });
  });

  it('rejects unknown categories and bad limits', async () => {
    expect((await call('PUT', '/api/spending/payees/category', { payeeKey: 'x', category: 'uncategorised' })).status).toBe(422);
    expect((await call('PUT', '/api/spending/payees/category', { payeeKey: 'x', category: 'nonsense' })).status).toBe(422);
    expect((await call('GET', '/api/spending/payees/uncategorised?limit=500')).status).toBe(422);
  });
});
