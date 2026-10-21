/**
 * Matched insurance documents → the Documents section.
 *
 * Each PDF linked to a policy (insuranceDocMatching) is filed once into the
 * policy holder's folder in Documents — the same person folders the
 * document sorter uses, found or created by name — as an INSURANCE document.
 * The policy page lists it too (document.service listDocuments follows
 * InsuranceDocument.documentId), so there is one copy of the file, shown in
 * both places. A PDF the user already has in Documents is linked, not copied.
 */

import { randomUUID } from 'node:crypto';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { buildStorageKey, deleteFile, readBuffer, saveBuffer } from '../../lib/documentStorage.js';
import { findOrCreatePerson, lockFiling } from '../documents/docSorter/sorter.service.js';
import { uniqueName } from '../documents/docSorter/naming.js';
import type { InsuranceDocExtract } from '../../ingestion/insurance/insuranceDocReader.js';
import { extractOf } from './insuranceDocExtract.js';

const KIND_NAME: Record<string, string> = {
  POLICY_DOCUMENT: 'Policy document',
  PREMIUM_RECEIPT: 'Premium receipt',
  RENEWAL_NOTICE: 'Renewal notice',
  CLAIM_LETTER: 'Claim letter',
  OTHER: 'Insurance document',
};

/** The date a document is about, for its name and the folder's date order. */
function docDateOf(x: InsuranceDocExtract | null, receivedAt: Date | null): string | null {
  const own =
    x?.doc_kind === 'PREMIUM_RECEIPT'
      ? x.premium_paid_on
      : x?.doc_kind === 'CLAIM_LETTER'
        ? (x.claim?.settled_on ?? x.claim?.claim_date)
        : x?.doc_kind === 'POLICY_DOCUMENT'
          ? x.start_date
          : null;
  return own ?? receivedAt?.toISOString().slice(0, 10) ?? null;
}

/** "Star Health Premium receipt 2025-04-02.pdf" — readable in a folder of many. */
function nameFor(insurer: string, kind: string | null, date: string | null): string {
  const clean = insurer.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return [clean, KIND_NAME[kind ?? 'OTHER'] ?? KIND_NAME.OTHER, date].filter(Boolean).join(' ') + '.pdf';
}

export interface InsuranceFilingSummary {
  filed: number;
  linkedExisting: number;
}

/** File every matched, not-yet-filed document of one user. Must run as that user. */
export async function fileMatchedInsuranceDocuments(userId: string): Promise<InsuranceFilingSummary> {
  const summary: InsuranceFilingSummary = { filed: 0, linkedExisting: 0 };
  const docs = await prisma.insuranceDocument.findMany({
    where: { userId, status: 'MATCHED', documentId: null, policyId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });

  for (const doc of docs) {
    const policy = await prisma.insurancePolicy.findFirst({
      where: { id: doc.policyId!, userId },
      select: { insurer: true, policyHolder: true },
    });
    if (!policy) continue;

    // The user may have dropped the same PDF into Documents already.
    const existing = await prisma.document.findFirst({
      where: { userId, contentHash: doc.contentHash },
      select: { id: true },
    });
    if (existing) {
      await prisma.insuranceDocument.update({
        where: { id: doc.id },
        data: { status: 'FILED', documentId: existing.id },
      });
      summary.linkedExisting++;
      continue;
    }
    if (!doc.blobKey) continue;

    const bytes = await readBuffer(userId, doc.blobKey);
    const x = await extractOf(doc);
    const docDate = docDateOf(x, doc.receivedAt);
    const storageKey = buildStorageKey('.pdf');
    await saveBuffer(userId, storageKey, bytes);
    try {
      await runInTransaction(async (tx) => {
        await lockFiling(tx, userId);
        const personId = await findOrCreatePerson(tx, userId, policy.policyHolder, null);
        const siblings = await tx.document.findMany({
          where: { userId, personId, docType: 'INSURANCE' },
          select: { fileName: true },
        });
        const created = await tx.document.create({
          data: {
            userId,
            ownerType: 'PERSON_DOCS',
            ownerId: userId,
            category: 'insurance',
            fileName: uniqueName(
              nameFor(policy.insurer, doc.docKind, docDate),
              new Set(siblings.map((s) => s.fileName)),
            ),
            mimeType: 'application/pdf',
            sizeBytes: bytes.length,
            storageKey,
            externalEditKey: randomUUID(),
            contentHash: doc.contentHash,
            personId,
            docType: 'INSURANCE',
            docDate: docDate ? new Date(`${docDate}T00:00:00Z`) : null,
            sortStatus: 'FILED',
          },
          select: { id: true },
        });
        await tx.insuranceDocument.update({
          where: { id: doc.id },
          data: { status: 'FILED', documentId: created.id },
        });
      });
      summary.filed++;
    } catch (err) {
      // Nothing points at the bytes saved above: remove them, then let the
      // run fail (the document stays MATCHED and is filed next run).
      await deleteFile(userId, storageKey);
      throw err;
    }
  }

  if (summary.filed > 0 || summary.linkedExisting > 0) {
    logger.info({ userId, ...summary }, '[insurance] documents filed');
  }
  return summary;
}
