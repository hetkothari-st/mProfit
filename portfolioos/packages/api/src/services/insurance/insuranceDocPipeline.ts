/**
 * Insurance documents found in Gmail → read → InsuranceDocument rows.
 *
 * Runs after every insurance scan (jobs/gmailScanWorker) and nightly, as the
 * owning user. Each insurance PDF the scan kept becomes one InsuranceDocument
 * and is read (ingestion/insurance/insuranceDocReader); its status says what
 * happened:
 *
 *   READ            every field checked out against the document
 *   NEEDS_REVIEW    the reader returned something the PDF does not contain
 *   NEEDS_PASSWORD  locked, and none of the user's saved passwords opened it
 *   FAILED          unreadable (no text, or the reader's output was invalid)
 *   PENDING         not read yet, or a temporary failure — retried next run
 *
 * The reading is stored encrypted (it holds the policy number). Once read,
 * documents are matched to policies (insuranceDocMatching).
 */

import { Prisma, type InsuranceDocStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { readBuffer } from '../../lib/documentStorage.js';
import { decryptIfNeeded } from '../../lib/decryptIfNeeded.js';
import {
  readInsuranceDocument,
  type CallModel,
} from '../../ingestion/insurance/insuranceDocReader.js';
import { matchInsuranceDocuments, sealedExtractColumns } from './insuranceDocMatching.js';

export interface InsuranceDocRunSummary {
  created: number;
  read: number;
  needsReview: number;
  needsPassword: number;
  failed: number;
  stillPending: number;
}

/** Create rows for insurance PDFs the scans kept that have none yet. */
async function enqueueNewDocuments(userId: string): Promise<number> {
  const found = await prisma.gmailDiscoveredDoc.findMany({
    where: {
      userId,
      classifiedDocType: 'INSURANCE',
      scanJob: { kind: 'INSURANCE' },
    },
    select: { id: true, fileName: true, blobKey: true, contentHash: true, fromAddress: true, receivedAt: true },
  });
  if (found.length === 0) return 0;
  const existing = await prisma.insuranceDocument.findMany({
    where: { userId, OR: [{ gmailDocId: { in: found.map((d) => d.id) } }, { contentHash: { in: found.map((d) => d.contentHash) } }] },
    select: { gmailDocId: true, contentHash: true },
  });
  const seenDoc = new Set(existing.map((e) => e.gmailDocId));
  const seenHash = new Set(existing.map((e) => e.contentHash));
  let created = 0;
  for (const d of found) {
    // The same PDF mailed twice (a reminder, a forward) is one document.
    if (seenDoc.has(d.id) || seenHash.has(d.contentHash)) continue;
    seenHash.add(d.contentHash);
    await prisma.insuranceDocument.create({
      data: {
        userId,
        gmailDocId: d.id,
        fileName: d.fileName,
        blobKey: d.blobKey,
        contentHash: d.contentHash,
        fromAddress: d.fromAddress,
        receivedAt: d.receivedAt,
      },
    });
    created++;
  }
  return created;
}

async function setOutcome(
  id: string,
  status: InsuranceDocStatus,
  data: Partial<Prisma.InsuranceDocumentUpdateInput> = {},
): Promise<void> {
  await prisma.insuranceDocument.update({ where: { id }, data: { status, ...data } });
}

/**
 * Read every pending (or still-locked) insurance document of one user.
 * Must run as that user. `callModel` is for tests.
 */
export async function processInsuranceDocuments(
  userId: string,
  deps: { callModel?: CallModel } = {},
): Promise<InsuranceDocRunSummary> {
  const summary: InsuranceDocRunSummary = { created: 0, read: 0, needsReview: 0, needsPassword: 0, failed: 0, stillPending: 0 };
  summary.created = await enqueueNewDocuments(userId);

  // NEEDS_PASSWORD is retried: the user may have saved a password since.
  const todo = await prisma.insuranceDocument.findMany({
    where: { userId, status: { in: ['PENDING', 'NEEDS_PASSWORD'] } },
    orderBy: { createdAt: 'asc' },
  });

  for (const doc of todo) {
    if (!doc.blobKey) {
      await setOutcome(doc.id, 'FAILED', { errorMessage: 'The file was not stored, so it cannot be read.' });
      summary.failed++;
      continue;
    }
    const bytes = await readBuffer(userId, doc.blobKey);
    const opened = await decryptIfNeeded(bytes, { fileName: doc.fileName, userId, allowedKinds: ['pdf'] });
    if (!opened.ok) {
      if (opened.requiresPassword) {
        await setOutcome(doc.id, 'NEEDS_PASSWORD', { errorMessage: 'This PDF is password protected.' });
        summary.needsPassword++;
      } else {
        await setOutcome(doc.id, 'FAILED', { errorMessage: 'This file is not a readable PDF.' });
        summary.failed++;
      }
      continue;
    }

    const result = await readInsuranceDocument(opened.text ?? '', { userId, sourceRef: doc.id }, deps);
    if (!result.ok) {
      const transient = result.reason === 'llm_unavailable' || result.reason === 'over_budget' || result.reason === 'model_error';
      await setOutcome(doc.id, transient ? 'PENDING' : 'FAILED', { errorMessage: result.message });
      if (transient) summary.stillPending++;
      else summary.failed++;
      continue;
    }
    const review = result.problems.length > 0;
    await setOutcome(doc.id, review ? 'NEEDS_REVIEW' : 'READ', {
      docKind: result.extract.doc_kind,
      ...(await sealedExtractColumns(result.extract)),
      problems: review ? (result.problems as Prisma.InputJsonValue) : Prisma.DbNull,
      errorMessage: null,
    });
    if (review) summary.needsReview++;
    else summary.read++;
  }

  if (todo.length > 0 || summary.created > 0) {
    logger.info({ userId, ...summary }, '[insurance] documents read');
  }
  await matchInsuranceDocuments(userId);
  return summary;
}
