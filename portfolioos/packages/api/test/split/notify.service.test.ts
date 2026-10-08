import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { updateSettings } from '../../src/services/split/settings.service.js';
import { remind, sendActivityDigests, istDay } from '../../src/services/split/notify.service.js';

const sent = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notifications/email.service.js', () => ({ sendEmail: sent }));

describe('split reminders + digests', () => {
  let alice: TestScope; let bob: TestScope; let groupId: string; let a: string; let b: string;
  beforeAll(async () => {
    sent.mockResolvedValue({ sent: true, messageId: 'm' });
    alice = await createTestScope('split-ntf-a'); bob = await createTestScope('split-ntf-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Goa', myDisplayName: 'Alice', contactIds: [cb.id] }));
    groupId = g.id; a = g.members.find((m) => m.isMe)!.id; b = g.members.find((m) => !m.isMe)!.id;
    await alice.runAs(() => updateSettings(alice.userId, { upiId: 'alice@oksbi' }));
    await alice.runAs(() => createExpense(alice.userId, { groupId, description: 'Hotel', date: '2026-10-01', amount: '1000', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: a, amount: '1000' }], shares: [{ memberId: a }, { memberId: b }] }));
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.splitReminder.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } });
      await prisma.splitSettings.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } });
    });
    await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup();
  });

  it('istDay uses the IST calendar day', () => {
    expect(istDay(new Date('2026-10-08T20:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-09');
  });

  it('reminds the debtor once a day with amount and UPI', async () => {
    const now = new Date('2026-10-08T06:00:00Z');
    expect(await alice.runAs(() => remind(alice.userId, groupId, b, now))).toEqual({ sent: true });
    const mail = sent.mock.calls.at(-1)![0];
    expect(mail.subject).toBe('Reminder: you owe Alice ₹500.00');
    expect(mail.html).toContain('alice@oksbi');
    await expect(alice.runAs(() => remind(alice.userId, groupId, b, now))).rejects.toThrow(/Already reminded today/);
  });

  it("can't remind someone who doesn't owe you", async () => {
    await expect(bob.runAs(() => remind(bob.userId, groupId, a))).rejects.toThrow(/doesn't owe you/);
  });

  it('hourly digest emails Bob about Alice’s activity once, then nothing new', async () => {
    sent.mockClear();
    const r1 = await sendActivityDigests(new Date(Date.now() + 1000));
    const toBob = sent.mock.calls.filter((c) => c[0].to.startsWith('inv-split-ntf-b'));
    expect(toBob).toHaveLength(1);
    expect(toBob[0]![0].html).toContain('Hotel');
    expect(r1.emails).toBeGreaterThanOrEqual(1);
    sent.mockClear();
    await sendActivityDigests(new Date(Date.now() + 2000));
    expect(sent.mock.calls.filter((c) => c[0].to.startsWith('inv-split-ntf-b'))).toHaveLength(0);
  });
});
