import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup, addMember } from '../../src/services/split/groups.service.js';
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
    expect(mail.html).toContain('upi://pay?pa=alice%40oksbi');
    expect(mail.html).toContain('Pay with any UPI app');
    expect(mail.text).toContain('UPI ID: alice@oksbi');
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

  it('a newly added member does not get activity from before they joined', async () => {
    const carol = await createTestScope('split-ntf-c');
    try {
      const cc = await seedContact(alice.userId, 'Carol', carol.userId);
      const g2 = await alice.runAs(() => createGroup(alice.userId, { name: 'Old', myDisplayName: 'Alice', contactIds: [] }));
      const a2 = g2.members.find((m) => m.isMe)!.id;
      await alice.runAs(() => createExpense(alice.userId, { groupId: g2.id, description: 'OldThing', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: a2, amount: '100' }], shares: [{ memberId: a2 }] }));
      await new Promise((r) => setTimeout(r, 50));
      const m = await alice.runAs(() => addMember(alice.userId, g2.id, cc.id));
      await new Promise((r) => setTimeout(r, 50));
      await alice.runAs(() => createExpense(alice.userId, { groupId: g2.id, description: 'NewThing', date: '2026-10-02', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: a2, amount: '100' }], shares: [{ memberId: a2 }, { memberId: m.id }] }));
      sent.mockClear();
      await sendActivityDigests(new Date(Date.now() + 1000));
      const toCarol = sent.mock.calls.filter((c) => c[0].to.startsWith('inv-split-ntf-c'));
      expect(toCarol).toHaveLength(1);
      expect(toCarol[0]![0].html).toContain('NewThing');
      expect(toCarol[0]![0].html).not.toContain('OldThing');
      expect(toCarol[0]![0].html).toContain('Alice added');
    } finally {
      await cleanupSplit([carol.userId]); await carol.cleanup();
    }
  });

  it('caps reminders at 30 a day per user', async () => {
    const eve = await createTestScope('split-ntf-cap');
    try {
      await runAsSystem(() => prisma.splitReminder.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ userId: eve.userId, groupId: 'g', memberId: `m${i}`, sentOn: new Date('2026-09-01') })) }));
      const cb = await seedContact(eve.userId, 'Bob', bob.userId);
      const g = await eve.runAs(() => createGroup(eve.userId, { name: 'Cap', myDisplayName: 'Eve', contactIds: [cb.id] }));
      const e1 = g.members.find((m) => m.isMe)!.id; const b1 = g.members.find((m) => !m.isMe)!.id;
      await eve.runAs(() => createExpense(eve.userId, { groupId: g.id, description: 'Y', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: e1, amount: '100' }], shares: [{ memberId: e1 }, { memberId: b1 }] }));
      sent.mockClear();
      await expect(eve.runAs(() => remind(eve.userId, g.id, b1))).rejects.toThrow(/Daily reminder limit reached/);
      expect(sent).not.toHaveBeenCalled();
    } finally {
      await runAsSystem(() => prisma.splitReminder.deleteMany({ where: { userId: eve.userId } }));
      await cleanupSplit([eve.userId]); await eve.cleanup();
    }
  });

  it('remind needs an email on file', async () => {
    const dave = await seedContact(alice.userId, 'Dave');
    const g3 = await alice.runAs(() => createGroup(alice.userId, { name: 'NoMail', myDisplayName: 'Alice', contactIds: [dave.id] }));
    const a3 = g3.members.find((m) => m.isMe)!.id; const d3 = g3.members.find((m) => !m.isMe)!.id;
    await alice.runAs(() => createExpense(alice.userId, { groupId: g3.id, description: 'X', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: a3, amount: '100' }], shares: [{ memberId: a3 }, { memberId: d3 }] }));
    await expect(alice.runAs(() => remind(alice.userId, g3.id, d3))).rejects.toThrow(/SPLIT_NO_EMAIL/);
  });

  it('emailOnActivity=false gets no digest', async () => {
    await bob.runAs(() => updateSettings(bob.userId, { emailOnActivity: false }));
    const a4 = a;
    await alice.runAs(() => createExpense(alice.userId, { groupId, description: 'Quiet', date: '2026-10-03', amount: '10', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: a4, amount: '10' }], shares: [{ memberId: a4 }, { memberId: b }] }));
    sent.mockClear();
    await sendActivityDigests(new Date(Date.now() + 3000));
    expect(sent.mock.calls.filter((c) => c[0].to.startsWith('inv-split-ntf-b'))).toHaveLength(0);
  });
});
