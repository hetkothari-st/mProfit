/**
 * Step 9: record that a generated will was signed, keep the signed copy in the
 * vault, and read both back. The signing date and witness names are sealed with
 * the owner's key (slot "willexec:<willId>") and never logged; the stored file
 * name is fixed, never the uploaded one.
 */
import type { Will } from '@prisma/client';
import {
  willExecutionInputSchema, willExecutionRecordSchema, willNextReviewDate, willWitnessIssues, willWitnessWarnings,
  WILL_SIGNED_COPY_MIME_TYPES,
  type WillExecutionRecord, type WillExecutionWire, type WillSignedCopyMime,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { openForUser, sealForUser } from '../../lib/userKeys.js';
import { sniff } from '../../lib/decryptIfNeeded.js';
import { readBuffer } from '../../lib/documentStorage.js';
import { createDocument, deleteDocument } from '../document.service.js';
import { dayOf, isoDay, loadOwnedWill, openWillPayload, requireWillKeys, todayIst, zodIssues } from './willStore.js';

export interface WillExecuteDeps {
  today?: () => string;
  /** Test seam: runs after the new copy is stored and before the commit. */
  beforeCommit?: () => Promise<void>;
}

export interface RecordExecutionResult {
  execution: WillExecutionWire;
  newCopy: boolean;
  replacedCopy: boolean;
}

const execSlot = (willId: string) => `willexec:${willId}`;

const EXT: Record<WillSignedCopyMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const NOT_EXECUTABLE =
  'Only your current will can be signed and stored. This one is a draft, was discarded or has been replaced.';
const BAD_TYPE = 'Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).';

/** The bytes decide the type. Anything but a PDF or a JPEG/PNG/WebP photo is refused. */
export function signedCopyMime(buffer: Buffer): WillSignedCopyMime | null {
  const s = sniff(buffer);
  if (s.kind === 'pdf') return 'application/pdf';
  if (s.kind === 'image' && s.mime !== null && (WILL_SIGNED_COPY_MIME_TYPES as readonly string[]).includes(s.mime)) {
    return s.mime as WillSignedCopyMime;
  }
  return null;
}

function notExecutable(status: string): ConflictError {
  return new ConflictError(NOT_EXECUTABLE, { reason: 'WILL_NOT_EXECUTABLE', status });
}

async function latestVersion(userId: string, willId: string) {
  const v = await prisma.willVersion.findFirst({ where: { willId, userId }, orderBy: { versionNo: 'desc' } });
  if (!v) throw new NotFoundError('Will version not found');
  return v;
}

async function openExecution(userId: string, will: Will): Promise<WillExecutionRecord | null> {
  if (!will.executionSealed) return null;
  const plain = await openForUser(userId, execSlot(will.id), Buffer.from(will.executionSealed));
  return willExecutionRecordSchema.parse(JSON.parse(plain.toString('utf8')));
}

export async function getWillExecution(userId: string, willId: string): Promise<WillExecutionWire> {
  requireWillKeys();
  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'GENERATED' && will.status !== 'EXECUTED' && will.status !== 'SUPERSEDED') {
    throw notExecutable(will.status);
  }
  const version = await latestVersion(userId, will.id);
  const record = await openExecution(userId, will);
  const doc = will.executedDocumentId
    ? await prisma.document.findFirst({
        where: { id: will.executedDocumentId, userId, ownerType: 'WILL' },
        select: { fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      })
    : null;
  const warnings = record ? willWitnessWarnings(await openWillPayload(userId, will.id, will.payload), record.witnesses) : [];
  return {
    willId: will.id,
    version: will.version,
    status: will.status,
    versionId: version.id,
    generatedOn: isoDay(version.generatedOn),
    executedOn: record?.executedOn ?? (will.executedAt ? isoDay(will.executedAt) : null),
    witnesses: record ? [...record.witnesses] : [],
    nextReviewAt: will.status === 'EXECUTED' && will.nextReviewAt ? isoDay(will.nextReviewAt) : null,
    signedCopy: doc
      ? { fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, uploadedAt: doc.createdAt.toISOString() }
      : null,
    warnings,
  };
}

/** Deleting a file must never change the response: the save already succeeded or already failed. */
async function removeDocument(userId: string, documentId: string, event: string): Promise<void> {
  try {
    await deleteDocument(userId, documentId, { allowWill: true });
  } catch (err) {
    logger.error({ documentId, errName: err instanceof Error ? err.name : 'unknown' }, event);
  }
}

export async function recordWillExecution(
  userId: string,
  willId: string,
  input: { fields: unknown; file: { buffer: Buffer } | null },
  deps: WillExecuteDeps = {},
): Promise<RecordExecutionResult> {
  requireWillKeys();
  const today = (deps.today ?? todayIst)();
  const parsed = willExecutionInputSchema.safeParse(input.fields);
  if (!parsed.success) {
    throw new ValidationError('Some signing details are not valid', { issues: zodIssues(parsed.error) });
  }
  const { executedOn, witnesses } = parsed.data;

  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'GENERATED' && will.status !== 'EXECUTED') throw notExecutable(will.status);
  const version = await latestVersion(userId, will.id);
  const generatedOn = isoDay(version.generatedOn);
  const payload = await openWillPayload(userId, will.id, will.payload);
  const issues = [
    ...(executedOn > today ? [{ path: 'executedOn', code: 'in_future' }] : []),
    ...(executedOn < generatedOn ? [{ path: 'executedOn', code: 'before_generated' }] : []),
    ...willWitnessIssues(payload, witnesses),
  ];
  if (issues.length > 0) throw new ValidationError('Some signing details are not valid', { issues });

  if (!input.file && !will.executedDocumentId) {
    throw new BadRequestError('Attach the signed copy of your will', { field: 'file' });
  }
  const mime = input.file ? signedCopyMime(input.file.buffer) : null;
  if (input.file && !mime) throw new BadRequestError(BAD_TYPE, { field: 'file', reason: 'WILL_UPLOAD_TYPE' });

  const record: WillExecutionRecord = { executedOn, witnesses, recordedAt: new Date().toISOString() };
  const sealed = await sealForUser(userId, execSlot(will.id), Buffer.from(JSON.stringify(record), 'utf8'));
  const previousDocId = will.executedDocumentId;
  const newDoc =
    input.file && mime
      ? await createDocument({
          userId, ownerType: 'WILL', ownerId: will.id, category: 'executed',
          fileName: `will-v${will.version}-signed.${EXT[mime]}`, mimeType: mime, buffer: input.file.buffer,
        })
      : null;

  try {
    if (deps.beforeCommit) await deps.beforeCommit();
    await runInTransaction(async (tx) => {
      const res = await tx.will.updateMany({
        where: { id: will.id, userId, status: { in: ['GENERATED', 'EXECUTED'] }, executedDocumentId: previousDocId },
        data: {
          status: 'EXECUTED',
          executedAt: dayOf(executedOn),
          nextReviewAt: dayOf(willNextReviewDate(executedOn)),
          executionSealed: sealed,
          executedDocumentId: newDoc?.id ?? previousDocId,
        },
      });
      if (res.count === 0) {
        throw new ConflictError('This will changed while you were saving. Reload and try again.', {
          reason: 'WILL_EXECUTION_CONFLICT',
        });
      }
      if (newDoc && previousDocId) {
        // Succession nominees share files by id: hand them the new copy, not a deleted one.
        const holders = await tx.legacyNominee.findMany({
          where: { userId, documentIds: { has: previousDocId } },
          select: { id: true, documentIds: true },
        });
        for (const n of holders) {
          await tx.legacyNominee.update({
            where: { id: n.id },
            data: { documentIds: [...new Set(n.documentIds.map((d) => (d === previousDocId ? newDoc.id : d)))] },
          });
        }
      }
      // A new signing date means a new review date: close any reminder for the old one.
      await tx.alert.updateMany({
        where: { userId, type: 'WILL_REVIEW_DUE', isActive: true, metadata: { path: ['willId'], equals: will.id } },
        data: { isActive: false },
      });
    });
  } catch (err) {
    if (newDoc) await removeDocument(userId, newDoc.id, 'will.execute.new_copy_cleanup_failed');
    throw err;
  }
  if (newDoc && previousDocId) await removeDocument(userId, previousDocId, 'will.execute.old_copy_cleanup_failed');

  return {
    execution: await getWillExecution(userId, will.id),
    newCopy: newDoc !== null,
    replacedCopy: newDoc !== null && previousDocId !== null,
  };
}

export async function getSignedCopy(
  userId: string,
  willId: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; versionNo: number }> {
  requireWillKeys();
  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'GENERATED' && will.status !== 'EXECUTED' && will.status !== 'SUPERSEDED') {
    throw notExecutable(will.status);
  }
  const doc = will.executedDocumentId
    ? await prisma.document.findFirst({ where: { id: will.executedDocumentId, userId, ownerType: 'WILL' } })
    : null;
  if (!doc) throw new NotFoundError('No signed copy is stored for this will');
  return { buffer: await readBuffer(userId, doc.storageKey), mimeType: doc.mimeType, fileName: doc.fileName, versionNo: will.version };
}
