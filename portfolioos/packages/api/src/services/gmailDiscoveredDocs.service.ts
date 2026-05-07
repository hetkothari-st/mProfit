import type { GmailDocStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export interface ListDiscoveredDocsParams {
  userId: string;
  status?: GmailDocStatus;
  fromAddress?: string;
  docType?: string;
  scanJobId?: string;
  cursor?: string;
  limit?: number;
}

export async function listDiscoveredDocs(p: ListDiscoveredDocsParams) {
  const limit = Math.min(Math.max(p.limit ?? 50, 1), 200);
  return prisma.gmailDiscoveredDoc.findMany({
    where: {
      userId: p.userId,
      status: p.status,
      fromAddress: p.fromAddress,
      classifiedDocType: p.docType,
      scanJobId: p.scanJobId,
    },
    orderBy: [{ status: 'asc' }, { receivedAt: 'desc' }],
    take: limit,
    skip: p.cursor ? 1 : 0,
    cursor: p.cursor ? { id: p.cursor } : undefined,
  });
}

export async function getDiscoveredDoc(userId: string, id: string) {
  const doc = await prisma.gmailDiscoveredDoc.findUnique({ where: { id } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  return doc;
}

export async function listDistinctSenders(userId: string): Promise<string[]> {
  const rows = await prisma.gmailDiscoveredDoc.findMany({
    where: { userId, isFinancial: true },
    distinct: ['fromAddress'],
    select: { fromAddress: true },
    orderBy: { fromAddress: 'asc' },
  });
  return rows.map((r) => r.fromAddress);
}
