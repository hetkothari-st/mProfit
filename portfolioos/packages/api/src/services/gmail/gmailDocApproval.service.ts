import type { ImportType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { createImportJob } from '../imports/import.service.js';
import { findMatchingRule, setSenderRule, upsertRule } from './gmailAutoApproveRules.service.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { ensureLocalFile } from '../../lib/fileStore.js';

function inferImportType(fileName: string, classifiedDocType: string | null): ImportType {
  const lower = fileName.toLowerCase();
  switch (classifiedDocType) {
    case 'CAS':
      return lower.endsWith('.pdf') ? 'MF_CAS_PDF' : 'MF_CAS_EXCEL';
    case 'CONTRACT_NOTE':
      if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
      if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'CONTRACT_NOTE_HTML';
      return 'CONTRACT_NOTE_EXCEL';
    case 'BANK_STATEMENT':
      return lower.endsWith('.pdf') ? 'BANK_STATEMENT_PDF' : 'BANK_STATEMENT_CSV';
    case 'FD_CERTIFICATE':
    case 'MF_STATEMENT':
    case 'INSURANCE':
    case 'SALARY_SLIP':
    case 'CC_STATEMENT':
    case 'TAX_DOCUMENT':
      // These all route to the auto-detecting runner (canHandle dispatches
      // to the right parser by file content). Use a generic fallback type
      // that keeps the ImportJob displayable while the runner does the work.
      return lower.endsWith('.pdf') ? 'BANK_STATEMENT_PDF' : 'GENERIC_CSV';
    default:
      if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'GENERIC_EXCEL';
      return 'GENERIC_CSV';
  }
}

export async function approveDoc(
  userId: string,
  docId: string,
  options: { createAutoApproveRule?: boolean } = {},
) {
  const doc = await prisma.gmailDiscoveredDoc.findUnique({
    where: { id: docId },
    include: { scanJob: { select: { kind: true } } },
  });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  // Found by an insurance search: read and filed by the insurance pipeline,
  // never imported as a statement.
  if (doc.scanJob.kind === 'INSURANCE') throw new BadRequestError('Insurance documents are handled on the Insurance page');
  if (doc.status === 'APPROVED' || doc.status === 'IMPORTING' || doc.status === 'IMPORTED') {
    return doc;
  }
  if (doc.status !== 'PENDING_APPROVAL') {
    throw new BadRequestError(`Cannot approve a doc in status ${doc.status}`);
  }

  // The attachment's disk copy is dropped after classification.
  await ensureLocalFile(userId, doc.blobKey, doc.storagePath);
  const importJob = await createImportJob({
    userId,
    portfolioId: null,
    type: inferImportType(doc.fileName, doc.classifiedDocType),
    fileName: doc.fileName,
    filePath: doc.storagePath,
    contentHash: doc.contentHash,
    gmailDocId: doc.id,
  });

  const updated = await prisma.gmailDiscoveredDoc.update({
    where: { id: docId },
    data: {
      status: 'IMPORTING',
      importJobId: importJob.id,
      approvedAt: new Date(),
    },
  });

  if (options.createAutoApproveRule) {
    await upsertRule({
      userId,
      fromAddress: doc.fromAddress,
      docType: doc.classifiedDocType ?? null,
      enabled: true,
    });
  }

  logger.info({ docId, importJobId: importJob.id }, '[gmailApproval] approved + import queued');
  return updated;
}

export async function rejectDoc(
  userId: string,
  docId: string,
  options: { reason?: string; blocklist?: boolean } = {},
) {
  const doc = await prisma.gmailDiscoveredDoc.findUnique({ where: { id: docId } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  if (doc.status === 'REJECTED') return doc;

  const updated = await prisma.gmailDiscoveredDoc.update({
    where: { id: docId },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
      rejectedReason: options.reason ?? null,
    },
  });
  if (options.blocklist) {
    await upsertRule({
      userId,
      fromAddress: doc.fromAddress,
      docType: doc.classifiedDocType ?? null,
      enabled: false,
    });
  }
  return updated;
}

/** Pending statement documents from one sender (insurance finds are filed elsewhere). */
function pendingFromSender(userId: string, fromAddress: string) {
  return prisma.gmailDiscoveredDoc.findMany({
    where: { userId, fromAddress, status: 'PENDING_APPROVAL', scanJob: { kind: { not: 'INSURANCE' } } },
    select: { id: true },
    orderBy: { receivedAt: 'asc' },
  });
}

/**
 * "Approve everything from this sender": every pending document from it is
 * approved and queued for import, and its future documents are approved as
 * they arrive. One document failing does not stop the rest.
 */
export async function approveAllFromSender(userId: string, fromAddress: string) {
  const docs = await pendingFromSender(userId, fromAddress);
  const ids: string[] = [];
  let failed = 0;
  for (const { id } of docs) {
    try {
      await approveDoc(userId, id);
      ids.push(id);
    } catch (err) {
      failed++;
      logger.warn({ docId: id, err: (err as Error).message }, '[gmailApproval] approve-all: doc skipped');
    }
  }
  // After the loop, so a scan's sweep cannot approve the same doc twice meanwhile.
  await setSenderRule(userId, fromAddress, 'APPROVE');
  return { ids, failed };
}

/**
 * "Reject everything from this sender": every pending document from it is
 * rejected, and its future documents are rejected as they arrive.
 */
export async function rejectAllFromSender(userId: string, fromAddress: string) {
  const docs = await pendingFromSender(userId, fromAddress);
  const ids = docs.map((d) => d.id);
  if (ids.length > 0) {
    await prisma.gmailDiscoveredDoc.updateMany({
      // Status re-checked: a doc approved since the read is left alone.
      where: { userId, id: { in: ids }, status: 'PENDING_APPROVAL' },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectedReason: 'Sender rejected' },
    });
  }
  await setSenderRule(userId, fromAddress, 'REJECT');
  return { ids, failed: 0 };
}

/**
 * Used by the worker's PHASE-4 sweep. Walks PENDING_APPROVAL docs for
 * the scan: approves those matching an enabled rule, rejects those from a
 * sender the user rejected outright.
 */
export async function sweepAutoApprovals(userId: string, scanJobId: string) {
  const candidates = await prisma.gmailDiscoveredDoc.findMany({
    where: { userId, scanJobId, status: 'PENDING_APPROVAL' },
  });
  let approved = 0;
  for (const doc of candidates) {
    const rule = await findMatchingRule(userId, doc.fromAddress, doc.classifiedDocType);
    if (rule?.autoReject) {
      await rejectDoc(userId, doc.id, { reason: 'Sender rejected' });
      continue;
    }
    if (!rule || !rule.enabled) continue;
    await approveDoc(userId, doc.id, { createAutoApproveRule: false });
    await prisma.gmailAutoApproveRule.update({
      where: { id: rule.id },
      data: { approvedCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    approved++;
  }
  return approved;
}
