import type { ImportType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { createImportJob } from './imports/import.service.js';
import { findMatchingRule, upsertRule } from './gmailAutoApproveRules.service.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';

function inferImportType(fileName: string, classifiedDocType: string | null): ImportType {
  const lower = fileName.toLowerCase();
  if (classifiedDocType === 'CAS') return lower.endsWith('.pdf') ? 'MF_CAS_PDF' : 'MF_CAS_EXCEL';
  if (classifiedDocType === 'CONTRACT_NOTE') {
    if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'CONTRACT_NOTE_HTML';
    return 'CONTRACT_NOTE_EXCEL';
  }
  if (classifiedDocType === 'BANK_STATEMENT') {
    return lower.endsWith('.pdf') ? 'BANK_STATEMENT_PDF' : 'BANK_STATEMENT_CSV';
  }
  if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'GENERIC_EXCEL';
  return 'GENERIC_CSV';
}

export async function approveDoc(
  userId: string,
  docId: string,
  options: { createAutoApproveRule?: boolean } = {},
) {
  const doc = await prisma.gmailDiscoveredDoc.findUnique({ where: { id: docId } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  if (doc.status === 'APPROVED' || doc.status === 'IMPORTING' || doc.status === 'IMPORTED') {
    return doc;
  }
  if (doc.status !== 'PENDING_APPROVAL') {
    throw new BadRequestError(`Cannot approve a doc in status ${doc.status}`);
  }

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

/**
 * Used by the worker's PHASE-4 sweep. Walks PENDING_APPROVAL docs for
 * the scan and auto-approves any that match an enabled rule.
 */
export async function sweepAutoApprovals(userId: string, scanJobId: string) {
  const candidates = await prisma.gmailDiscoveredDoc.findMany({
    where: { userId, scanJobId, status: 'PENDING_APPROVAL' },
  });
  let approved = 0;
  for (const doc of candidates) {
    const rule = await findMatchingRule(userId, doc.fromAddress, doc.classifiedDocType);
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
