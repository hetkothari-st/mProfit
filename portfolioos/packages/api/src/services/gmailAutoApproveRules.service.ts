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
  return prisma.gmailAutoApproveRule.upsert({
    where: {
      userId_fromAddress_docType: {
        userId: input.userId,
        fromAddress: input.fromAddress,
        docType: input.docType ?? null,
      },
    },
    create: {
      userId: input.userId,
      fromAddress: input.fromAddress,
      docType: input.docType ?? null,
      enabled: input.enabled,
    },
    update: {
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
    const exact = await prisma.gmailAutoApproveRule.findUnique({
      where: { userId_fromAddress_docType: { userId, fromAddress, docType } },
    });
    if (exact) return exact;
  }
  return prisma.gmailAutoApproveRule.findUnique({
    where: { userId_fromAddress_docType: { userId, fromAddress, docType: null } },
  });
}
