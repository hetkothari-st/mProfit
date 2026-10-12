import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runInTransaction } from '../../src/lib/prisma.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { enqueue, flushOutbox } from '../../src/services/legacy/outbox.service.js';
import type { SendEmailInput } from '../../src/services/notifications/email.service.js';

describe('legacy outbox', () => {
  let s: TestScope; let planId: string; let nomineeId: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-ob');
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId, status: 'ARMED' } }))).id;
    nomineeId = (await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('Ravi'), emailEnc: encryptSecret('ravi@test.local'),
      relationship: 'Brother', priority: 1, categories: ['INSURANCE'],
    } }))).id;
  });
  afterAll(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  it('enqueue is send-once per (plan, kind, cycle, recipient)', async () => {
    await runAsSystem(() => runInTransaction(async (tx) => {
      await enqueue(tx, { planId, userId: s.userId, kind: 'INVITE', cycle: 1, recipientKey: nomineeId, token: 'tok' });
      await enqueue(tx, { planId, userId: s.userId, kind: 'INVITE', cycle: 1, recipientKey: nomineeId, token: 'tok2' });
    }));
    expect(await runAsSystem(() => prisma.legacyOutbox.count({ where: { planId } }))).toBe(1);
  });

  it('an enqueue inside a failed transaction is rolled back (state and mail commit together)', async () => {
    await expect(runAsSystem(() => runInTransaction(async (tx) => {
      await enqueue(tx, { planId, userId: s.userId, kind: 'RELEASED_OWNER', cycle: 9, recipientKey: 'owner' });
      throw new Error('boom');
    }))).rejects.toThrow('boom');
    expect(await runAsSystem(() => prisma.legacyOutbox.count({ where: { planId, kind: 'RELEASED_OWNER' } }))).toBe(0);
  });

  it('failed send is retried on next flush, then marked sent with the link token cleared', async () => {
    const sent: SendEmailInput[] = [];
    const fail = async () => ({ sent: false as const, reason: 'smtp down' });
    expect(await flushOutbox(fail)).toEqual({ sent: 0, failed: 1 });
    const ok = async (i: SendEmailInput) => { sent.push(i); return { sent: true as const, messageId: 'm' }; };
    expect(await flushOutbox(ok)).toEqual({ sent: 0, failed: 0 }); // backing off
    const later = new Date(Date.now() + 11 * 60_000);
    expect(await flushOutbox(ok, later)).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]!.to).toBe('ravi@test.local');
    expect(sent[0]!.html).toContain('/legacy/ack/tok');
    expect(await flushOutbox(ok, later)).toEqual({ sent: 0, failed: 0 });
    const row = await runAsSystem(() => prisma.legacyOutbox.findFirstOrThrow({ where: { planId } }));
    expect(row.tokenEnc).toBeNull();
  });
});
