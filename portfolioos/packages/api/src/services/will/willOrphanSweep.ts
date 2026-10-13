/**
 * Removes will PDFs that no WillVersion points at. generateWill stores the PDF
 * before the transaction that records the version and deletes it again if that
 * transaction fails; a crash between the two would leave the PDF behind. The
 * hour of grace keeps a generate that is still in flight safe.
 * Runs under system context and logs document ids only.
 */
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { deleteDocument } from '../document.service.js';

export const ORPHAN_WILL_DOCUMENT_AGE_MS = 60 * 60 * 1000;
const PAGE = 200;

export async function sweepOrphanWillDocuments(now: Date = new Date()): Promise<{ deleted: number; failed: number }> {
  const cutoff = new Date(now.getTime() - ORPHAN_WILL_DOCUMENT_AGE_MS);
  return runAsSystem(async () => {
    const orphans: Array<{ id: string; userId: string }> = [];
    let cursor: string | undefined;
    for (;;) {
      const docs = await prisma.document.findMany({
        where: { ownerType: 'WILL', createdAt: { lt: cutoff } },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (docs.length === 0) break;
      const used = await prisma.willVersion.findMany({
        where: { documentId: { in: docs.map((d) => d.id) } },
        select: { documentId: true },
      });
      const referenced = new Set(used.map((v) => v.documentId));
      orphans.push(...docs.filter((d) => !referenced.has(d.id)));
      if (docs.length < PAGE) break;
      cursor = docs[docs.length - 1]!.id;
    }

    let deleted = 0;
    let failed = 0;
    for (const doc of orphans) {
      try {
        await deleteDocument(doc.userId, doc.id, { allowWill: true });
        deleted++;
        logger.info({ documentId: doc.id }, 'will.orphan_document_deleted');
      } catch (err) {
        // Best effort: the next sweep tries again.
        failed++;
        logger.error(
          { documentId: doc.id, errName: err instanceof Error ? err.name : 'unknown' },
          'will.orphan_document_delete_failed',
        );
      }
    }
    return { deleted, failed };
  });
}
