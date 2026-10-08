/**
 * Drives /api/split over real HTTP so authenticate, asyncHandler and
 * errorHandler are part of what is tested. Uses real users (RLS needs
 * them) created via createTestScope.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { splitRouter } from '../../src/routes/split.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { offendingNumbers } from '../helpers/wireNumerics.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let alice: TestScope;
let bob: TestScope;
let eve: TestScope;
const tok = (s: TestScope) => signAccessToken({ sub: s.userId, email: `${s.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token;

async function call(who: TestScope | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/split${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok(who)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  alice = await createTestScope('split-http-a');
  bob = await createTestScope('split-http-b');
  eve = await createTestScope('split-http-e');
  const app = express();
  app.use(express.json());
  app.use('/api/split', splitRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await cleanupSplit([alice.userId, bob.userId, eve.userId]);
  await alice.cleanup();
  await bob.cleanup();
  await eve.cleanup();
});

describe('/api/split', () => {
  it('requires auth', async () => {
    expect((await call(null, 'GET', '/groups')).status).toBe(401);
  });

  it('full flow: group → expense → balances → settle; money on the wire is strings', async () => {
    const contact = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await call(alice, 'POST', '/groups', { name: 'Goa', type: 'TRIP', myDisplayName: 'Alice', contactIds: [contact.id] });
    expect(g.status).toBe(201);
    const groupId = g.json.data.id as string;
    const a = g.json.data.members.find((m: { isMe: boolean }) => m.isMe).id as string;
    const b = g.json.data.members.find((m: { isMe: boolean }) => !m.isMe).id as string;

    const e = await call(alice, 'POST', '/expenses', {
      groupId, description: 'Hotel', date: '2026-10-01', amount: '1000', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '1000' }], shares: [{ memberId: a }, { memberId: b }],
    });
    expect(e.status).toBe(201);
    expect(offendingNumbers(e.json)).toEqual([]);

    const bal = await call(bob, 'GET', `/groups/${groupId}/balances`);
    expect(bal.status).toBe(200);
    expect(bal.json.data.transfers).toEqual([{ fromMemberId: b, toMemberId: a, amount: '500.0000' }]);
    expect(offendingNumbers(bal.json)).toEqual([]);

    const s = await call(bob, 'POST', '/settlements', { groupId, fromMemberId: b, toMemberId: a, amount: '500', method: 'UPI', date: '2026-10-02' });
    expect(s.status).toBe(201);
    const after = await call(alice, 'GET', `/groups/${groupId}/balances`);
    expect(after.json.data.transfers).toEqual([]);

    // Outsider: 404, never 200 or 403-with-data.
    expect((await call(eve, 'GET', `/groups/${groupId}`)).status).toBe(404);
    expect((await call(eve, 'GET', `/expenses/${e.json.data.id}`)).status).toBe(404);
    expect((await call(eve, 'GET', `/groups/${groupId}/balances`)).status).toBe(404);
  });

  it('validation errors are 400 with a message', async () => {
    const g = await call(alice, 'POST', '/groups', { name: 'V', myDisplayName: 'Alice' });
    const a = g.json.data.members[0].id as string;
    const r = await call(alice, 'POST', '/expenses', {
      groupId: g.json.data.id, description: 'x', date: '2026-10-01', amount: '10', currency: 'INR', splitMode: 'EXACT',
      payers: [{ memberId: a, amount: '10' }], shares: [{ memberId: a, value: '9' }],
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toMatch(/SPLIT_SUM_MISMATCH/);
    expect((await call(alice, 'POST', '/expenses', { groupId: g.json.data.id })).status).toBe(400);
  });

  it('direct group route is not shadowed by /groups/:id', async () => {
    const c = await seedContact(alice.userId, 'Bob Direct', bob.userId);
    const d = await call(alice, 'POST', '/groups/direct', { contactId: c.id, myDisplayName: 'Alice' });
    expect(d.status).toBe(200);
    expect(d.json.data.type).toBe('DIRECT');
  });

  it('outsider writes are 404 and change nothing', async () => {
    const contact = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await call(alice, 'POST', '/groups', { name: 'Private', myDisplayName: 'Alice', contactIds: [contact.id] });
    const groupId = g.json.data.id as string;
    const a = g.json.data.members.find((m: { isMe: boolean }) => m.isMe).id as string;
    const b = g.json.data.members.find((m: { isMe: boolean }) => !m.isMe).id as string;
    const body = {
      description: 'Hotel', date: '2026-10-01', amount: '1000', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '1000' }], shares: [{ memberId: a }, { memberId: b }],
    };
    const e = await call(alice, 'POST', '/expenses', { groupId, ...body });
    const id = e.json.data.id as string;
    const eveContact = await seedContact(eve.userId, 'Zed');

    expect((await call(eve, 'POST', '/expenses', { groupId, ...body })).status).toBe(404);
    expect((await call(eve, 'PATCH', `/expenses/${id}`, { ...body, amount: '1' })).status).toBe(404);
    expect((await call(eve, 'DELETE', `/expenses/${id}`)).status).toBe(404);
    expect((await call(eve, 'POST', '/settlements', { groupId, fromMemberId: b, toMemberId: a, amount: '10', method: 'CASH', date: '2026-10-02' })).status).toBe(404);
    expect((await call(eve, 'POST', `/groups/${groupId}/members`, { contactId: eveContact.id })).status).toBe(404);
    expect((await call(eve, 'GET', `/groups/${groupId}/activity`)).status).toBe(404);

    const after = await call(alice, 'GET', `/expenses/${id}`);
    expect(after.status).toBe(200);
    expect(after.json.data.amount).toBe('1000.0000');
    expect(after.json.data.deletedAt).toBeNull();
    expect((await call(alice, 'GET', `/groups/${groupId}`)).json.data.members).toHaveLength(2);
  });

  it('receipt: member uploads, other member views, outsider 404', async () => {
    const contact = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await call(alice, 'POST', '/groups', { name: 'Rcpt', type: 'TRIP', myDisplayName: 'Alice', contactIds: [contact.id] });
    const a = g.json.data.members.find((m: { isMe: boolean }) => m.isMe).id as string;
    const b = g.json.data.members.find((m: { isMe: boolean }) => !m.isMe).id as string;
    const e = await call(alice, 'POST', '/expenses', {
      groupId: g.json.data.id, description: 'Lunch', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '100' }], shares: [{ memberId: a }, { memberId: b }],
    });
    const id = e.json.data.id as string;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.alloc(4)]);
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'r.png');
    const up = await fetch(`${base}/api/split/expenses/${id}/receipt`, { method: 'PUT', headers: { authorization: `Bearer ${tok(alice)}` }, body: fd });
    expect(up.status).toBe(200);
    const view = await fetch(`${base}/api/split/expenses/${id}/receipt`, { headers: { authorization: `Bearer ${tok(bob)}` } });
    expect(view.status).toBe(200);
    expect(view.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await view.arrayBuffer()).equals(png)).toBe(true);
    const out = await fetch(`${base}/api/split/expenses/${id}/receipt`, { headers: { authorization: `Bearer ${tok(eve)}` } });
    expect(out.status).toBe(404);
  });

  it('receipt: a ~2 MB upload keeps its user context and round-trips', async () => {
    const contact = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await call(alice, 'POST', '/groups', { name: 'Big', type: 'TRIP', myDisplayName: 'Alice', contactIds: [contact.id] });
    const a = g.json.data.members.find((m: { isMe: boolean }) => m.isMe).id as string;
    const b = g.json.data.members.find((m: { isMe: boolean }) => !m.isMe).id as string;
    const e = await call(alice, 'POST', '/expenses', {
      groupId: g.json.data.id, description: 'Big', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '100' }], shares: [{ memberId: a }, { memberId: b }],
    });
    const id = e.json.data.id as string;
    const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); };
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)), chunk('IDAT', Buffer.alloc(2 * 1024 * 1024, 7)), chunk('IEND', Buffer.alloc(0))]);
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'big.png');
    const up = await fetch(`${base}/api/split/expenses/${id}/receipt`, { method: 'PUT', headers: { authorization: `Bearer ${tok(alice)}` }, body: fd });
    expect(up.status).toBe(200);
    const view = await fetch(`${base}/api/split/expenses/${id}/receipt`, { headers: { authorization: `Bearer ${tok(bob)}` } });
    expect(view.status).toBe(200);
    expect((await view.arrayBuffer()).byteLength).toBe(png.length);
  });
});
