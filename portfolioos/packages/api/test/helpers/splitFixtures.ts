// packages/api/test/helpers/splitFixtures.ts
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/** A contact owned by `ownerUserId`, optionally already linked to `linkedUserId`. */
export async function seedContact(ownerUserId: string, name: string, linkedUserId: string | null = null) {
  return runAsSystem(() => prisma.splitContact.create({ data: { ownerUserId, name, linkedUserId } }));
}

/** Remove every split row a test created for these users. */
export async function cleanupSplit(userIds: string[]) {
  await runAsSystem(async () => {
    const groups = await prisma.splitGroup.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
    await prisma.splitGroup.deleteMany({ where: { id: { in: groups.map((g) => g.id) } } });
    await prisma.splitContact.deleteMany({ where: { ownerUserId: { in: userIds } } });
  });
}
