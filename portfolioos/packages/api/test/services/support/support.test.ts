import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const mail = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ sent: true, messageId: 'm1' })) }));
vi.mock('../../../src/services/notifications/email.service.js', () => mail);

import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { env } from '../../../src/config/env.js';
import {
  adminListTickets,
  adminUpdateTicket,
  cleanPagePath,
  createTicket,
  listMyTickets,
} from '../../../src/services/support/support.service.js';
import { buildSupportEmail, ticketRef } from '../../../src/services/support/supportEmail.template.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

const body = { topic: 'BUG' as const, subject: 'Chart is blank', message: 'The net worth chart shows nothing for 1M.' };

describe('cleanPagePath', () => {
  it('keeps a path, drops query and fragment, rejects anything that is not an in-app path', () => {
    expect(cleanPagePath('/loans')).toBe('/loans');
    expect(cleanPagePath('/loans/abc123?token=secret#x')).toBe('/loans/abc123');
    expect(cleanPagePath('https://evil.example/x')).toBeNull();
    expect(cleanPagePath('//evil.example')).toBeNull();
    expect(cleanPagePath('')).toBeNull();
    expect(cleanPagePath(undefined)).toBeNull();
  });
});

describe('buildSupportEmail', () => {
  const base = {
    ticketId: 'cmabcdefghij123456',
    topic: 'BUG' as const,
    subject: 'Hello',
    message: 'line one\nline two',
    pagePath: '/loans',
    from: { name: 'Asha', email: 'asha@example.com' },
  };

  it('escapes everything the user typed and keeps line breaks', () => {
    const m = buildSupportEmail({
      ...base,
      subject: '<script>alert(1)</script>',
      message: '<img src=x onerror=alert(1)>\nsecond',
      from: { name: '"><b>x</b>', email: 'a@b.co' },
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img');
    expect(m.html).not.toContain('<b>x</b>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('<br>');
  });

  it('keeps the subject on one line and tags it with the ticket reference', () => {
    const m = buildSupportEmail({ ...base, subject: 'Hi\r\nBcc: attacker@example.com' });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject.startsWith(`[Support ${ticketRef(base.ticketId)}]`)).toBe(true);
    expect(ticketRef('cmabcdefghij123456')).toBe('123456');
  });
});

describe('support tickets (DB)', () => {
  let a: TestScope;
  let b: TestScope;

  beforeAll(async () => {
    a = await createTestScope('support-a');
    b = await createTestScope('support-b');
  });

  afterAll(async () => {
    await runAsSystem(() => prisma.supportTicket.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } }));
    await a.cleanup();
    await b.cleanup();
  });

  it('saves the request, emails the team with Reply-To set to the user, and hides the private note', async () => {
    mail.sendEmail.mockClear();
    const t = await a.runAs(() => createTicket(a.userId, { ...body, pagePath: '/net-worth?x=1' }));
    expect(t).toMatchObject({ topic: 'BUG', subject: 'Chart is blank', status: 'OPEN', pagePath: '/net-worth' });
    expect(t).not.toHaveProperty('adminNote');

    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    const sent = mail.sendEmail.mock.calls[0]![0] as { to: string; replyTo: string; subject: string };
    expect(sent.to).toBe(env.SUPPORT_EMAIL);
    expect(sent.replyTo).toContain('@test.local');
    expect(sent.subject).toContain('Chart is blank');

    const row = await runAsSystem(() => prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row.emailDelivered).toBe(true);
  });

  it('still saves the request when the email cannot be sent', async () => {
    mail.sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    const t = await a.runAs(() => createTicket(a.userId, { ...body, subject: 'Second one' }));
    const row = await runAsSystem(() => prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row.emailDelivered).toBe(false);
  });

  it('limits how many requests one user can send in an hour', async () => {
    const c = await createTestScope('support-c');
    try {
      for (let i = 0; i < 5; i++) await c.runAs(() => createTicket(c.userId, { ...body, subject: `Request ${i}` }));
      await expect(c.runAs(() => createTicket(c.userId, { ...body, subject: 'One too many' }))).rejects.toMatchObject({
        statusCode: 429,
      });
    } finally {
      await runAsSystem(() => prisma.supportTicket.deleteMany({ where: { userId: c.userId } }));
      await c.cleanup();
    }
  });

  it('shows a user only their own requests', async () => {
    await b.runAs(() => createTicket(b.userId, { ...body, subject: 'From B' }));
    const mineA = await a.runAs(() => listMyTickets(a.userId));
    const mineB = await b.runAs(() => listMyTickets(b.userId));
    expect(mineA.length).toBeGreaterThanOrEqual(2);
    expect(mineA.every((t) => t.subject !== 'From B')).toBe(true);
    expect(mineB.map((t) => t.subject)).toEqual(['From B']);
  });

  it('lets the team see across users, mark one resolved, and keep a private note', async () => {
    const all = await adminListTickets();
    const fromB = all.find((t) => t.subject === 'From B')!;
    expect(fromB.user.email).toContain('@test.local');
    expect(all.some((t) => t.user.id === a.userId)).toBe(true);

    const done = await adminUpdateTicket(fromB.id, { status: 'RESOLVED', adminNote: '  Told them to hard-refresh.  ' });
    expect(done.status).toBe('RESOLVED');
    expect(done.resolvedAt).not.toBeNull();
    expect(done.adminNote).toBe('Told them to hard-refresh.');

    // The owner sees the new status but never the note.
    const mine = await b.runAs(() => listMyTickets(b.userId));
    expect(mine[0]).toMatchObject({ status: 'RESOLVED' });
    expect(mine[0]).not.toHaveProperty('adminNote');

    const reopened = await adminUpdateTicket(fromB.id, { status: 'IN_PROGRESS' });
    expect(reopened.resolvedAt).toBeNull();
    expect((await adminListTickets({ status: 'IN_PROGRESS' })).map((t) => t.id)).toContain(fromB.id);
  });

  it('says so for a request that does not exist', async () => {
    await expect(adminUpdateTicket('nope', { status: 'RESOLVED' })).rejects.toMatchObject({ statusCode: 404 });
  });
});
