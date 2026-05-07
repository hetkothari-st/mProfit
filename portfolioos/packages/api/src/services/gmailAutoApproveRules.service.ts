import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export async function listRules(userId: string) {
  return prisma.gmailAutoApproveRule.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function upsertRule(input: {
  userId: string;
  fromAddress: string;
  docType?: string | null;
  enabled: boolean;
}) {
  // Prisma's compound unique where clauses don't accept null — use findFirst
  // for the lookup (treating null docType as "any" rule for this sender)
  // and create-or-update by id.
  const docType = input.docType ?? null;
  const existing = await prisma.gmailAutoApproveRule.findFirst({
    where: {
      userId: input.userId,
      fromAddress: input.fromAddress,
      docType,
    },
  });
  if (existing) {
    return prisma.gmailAutoApproveRule.update({
      where: { id: existing.id },
      data: { enabled: input.enabled },
    });
  }
  return prisma.gmailAutoApproveRule.create({
    data: {
      userId: input.userId,
      fromAddress: input.fromAddress,
      docType,
      enabled: input.enabled,
    },
  });
}

export async function deleteRule(userId: string, id: string) {
  const r = await prisma.gmailAutoApproveRule.findUnique({ where: { id } });
  if (!r || r.userId !== userId) throw new NotFoundError('Rule not found');
  await prisma.gmailAutoApproveRule.delete({ where: { id } });
}

/**
 * Returns the matching rule for (sender, docType). Falls back to
 * (sender, null) which means "all docs from this sender".
 */
export async function findMatchingRule(
  userId: string,
  fromAddress: string,
  docType: string | null,
) {
  if (docType) {
    const exact = await prisma.gmailAutoApproveRule.findFirst({
      where: { userId, fromAddress, docType },
    });
    if (exact) return exact;
  }
  return prisma.gmailAutoApproveRule.findFirst({
    where: { userId, fromAddress, docType: null },
  });
}
