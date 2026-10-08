// packages/api/src/services/split/activity.ts
import type { Prisma } from '@prisma/client';

export async function writeActivity(
  tx: Prisma.TransactionClient,
  groupId: string,
  actorUserId: string,
  kind: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await tx.splitActivity.create({ data: { groupId, actorUserId, kind, payload } });
}
