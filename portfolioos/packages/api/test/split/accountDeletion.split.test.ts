import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup, getGroup } from '../../src/services/split/groups.service.js';
import { purgeUser } from '../../src/services/accountDeletion.service.js';

describe('account purge and split groups', () => {
  let alice: TestScope;
  let bob: TestScope;
  let soloGroup: string;
  let sharedGroup: string;

  beforeAll(async () => {
    alice = await createTestScope('split-del-a');
    bob = await createTestScope('split-del-b');
    const placeholder = await seedContact(alice.userId, 'Ravi');
    const linked = await seedContact(alice.userId, 'Bob', bob.userId);
    soloGroup = (await alice.runAs(() => createGroup(alice.userId, { name: 'Solo', myDisplayName: 'Alice', contactIds: [placeholder.id] }))).id;
    sharedGroup = (await alice.runAs(() => createGroup(alice.userId, { name: 'Shared', myDisplayName: 'Alice', contactIds: [linked.id] }))).id;
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId, bob.userId]);
    await bob.cleanup();
  });

  it('deletes groups nobody else is linked to, keeps shared ones readable', async () => {
    await runAsSystem(() => purgeUser(alice.userId));
    const left = await runAsSystem(() => prisma.splitGroup.findMany({ where: { id: { in: [soloGroup, sharedGroup] } }, select: { id: true } }));
    expect(left.map((g) => g.id)).toEqual([sharedGroup]);
    const g = await bob.runAs(() => getGroup(bob.userId, sharedGroup));
    expect(g.members.some((m) => m.isMe)).toBe(true);
  });
});
