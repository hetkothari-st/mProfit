import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { SortDocType, SortStatus } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem, runAsUser } from '../../lib/requestContext.js';
import { buildStorageKey, readBuffer, saveBuffer, deleteFile } from '../../lib/documentStorage.js';
import { sniff } from '../../lib/decryptIfNeeded.js';
import { storedMimeFor } from '../../lib/documentMime.js';
import { getUserPdfPasswords } from '../../lib/pdf.js';
import { enqueueBounded, getDocSortQueue } from '../../lib/queue.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { runRules, RULES_CONFIDENCE_THRESHOLD } from './rules.js';
import { classifyForSortWithLlm } from './llmFallback.js';
import { extractText } from './textExtract.js';
import { matchPerson, nameKey } from './personMatch.js';
import { buildSortedName, safeExt, uniqueName } from './naming.js';

/**
 * Documents sorter: accept uploads, then read each file, find its person and
 * type, file it and rename it (docs/superpowers/specs/2026-10-14-document-sorter-design.md).
 *
 * processDocument reads and computes with no DB transaction open, then commits
 * the filing in one short transaction. It records every outcome on the
 * document and never throws for bad input: a file is never lost.
 */

const ADAPTER = 'docsorter';
const ADAPTER_VER = '1';
const LLM_MIN_CONFIDENCE = 0.5;
/** Stop starting OCR pages this long into a job (the queue's own timeout is 5 minutes). */
const JOB_BUDGET_MS = 4.5 * 60_000;
/** A document still PROCESSING after this long lost its job; dropping the file again re-queues it. */
const STALE_PROCESSING_MS = 10 * 60_000;
const NOT_STARTED = 'Could not start reading this file. Drop it again to retry.';

export interface UploadInput {
  originalName: string;
  buffer: Buffer;
}
export interface UploadAck {
  id: string;
  duplicateOf?: string;
  status: SortStatus;
}

const displayFileName = (originalName: string): string => (originalName.split(/[\\/]/).pop() ?? 'file').slice(0, 200);

interface Outcome {
  status: SortStatus;
  reason: string | null;
  docType?: SortDocType | null;
  docDate?: string | null;
}

async function setOutcome(userId: string, documentId: string, o: Outcome): Promise<void> {
  await runAsUser(userId, () =>
    prisma.document.update({
      where: { id: documentId },
      data: {
        sortStatus: o.status,
        sortReason: o.reason,
        ...(o.docType !== undefined && { docType: o.docType }),
        ...(o.docDate !== undefined && { docDate: o.docDate ? new Date(`${o.docDate}T00:00:00Z`) : null }),
      },
    }),
  );
}

/** Hands the document to the worker. If the queue cannot take it, say so on the document instead of leaving it "reading" forever. */
async function enqueueOrReview(userId: string, documentId: string, password?: string): Promise<boolean> {
  const queued = await enqueueBounded(
    getDocSortQueue().add({ documentId, userId, ...(password ? { password } : {}) }),
    'doc-sort',
  );
  if (!queued) await setOutcome(userId, documentId, { status: 'NEEDS_REVIEW', reason: NOT_STARTED });
  return queued;
}

async function restart(userId: string, documentId: string): Promise<SortStatus> {
  await setOutcome(userId, documentId, { status: 'PROCESSING', reason: null });
  return (await enqueueOrReview(userId, documentId)) ? 'PROCESSING' : 'NEEDS_REVIEW';
}

export async function acceptUploads(userId: string, files: UploadInput[]): Promise<UploadAck[]> {
  const out: UploadAck[] = [];
  for (const f of files) {
    const contentHash = createHash('sha256').update(f.buffer).digest('hex');
    const sniffed = sniff(f.buffer, f.originalName);
    const readable = sniffed.kind === 'pdf' || sniffed.kind === 'image';

    const existing = await runAsUser(userId, () =>
      prisma.document.findFirst({ where: { userId, contentHash }, select: { id: true, sortStatus: true, createdAt: true } }),
    );
    if (existing) {
      // Dropping a file again retries one that failed, needed review, or lost its job.
      const stale = existing.sortStatus === 'PROCESSING' && Date.now() - existing.createdAt.getTime() > STALE_PROCESSING_MS;
      const retry = readable && (existing.sortStatus === 'FAILED' || existing.sortStatus === 'NEEDS_REVIEW' || stale);
      const status = retry ? await restart(userId, existing.id) : (existing.sortStatus ?? 'FILED');
      out.push({ id: existing.id, duplicateOf: existing.id, status });
      continue;
    }

    const storageKey = buildStorageKey(f.originalName);
    await saveBuffer(userId, storageKey, f.buffer);
    let rowCreated = false;
    try {
      const created = await runAsUser(userId, () =>
        prisma.document.create({
          data: {
            userId,
            ownerType: 'PERSON_DOCS',
            ownerId: userId,
            fileName: displayFileName(f.originalName),
            mimeType: storedMimeFor(sniffed.kind, sniffed.mime),
            sizeBytes: f.buffer.length,
            storageKey,
            externalEditKey: randomUUID(),
            contentHash,
            sortStatus: readable ? 'PROCESSING' : 'NEEDS_REVIEW',
            sortReason: readable ? null : 'This file type is stored but not read automatically yet.',
          },
        }),
      );
      rowCreated = true;
      const queued = readable ? await enqueueOrReview(userId, created.id) : true;
      out.push({ id: created.id, status: readable && !queued ? 'NEEDS_REVIEW' : (created.sortStatus ?? 'PROCESSING') });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      // Lost the race to an identical concurrent upload: report the winner (our bytes are removed below).
      const winner = await runAsUser(userId, () =>
        prisma.document.findFirstOrThrow({ where: { userId, contentHash }, select: { id: true, sortStatus: true } }),
      );
      out.push({ id: winner.id, duplicateOf: winner.id, status: winner.sortStatus ?? 'PROCESSING' });
    } finally {
      // Every path where our row was not created must not leave the sealed bytes behind.
      if (!rowCreated) await deleteFile(userId, storageKey);
    }
  }
  return out;
}

/** Error text that is safe to store and log: the class and code, never Prisma's echo of the arguments (file and person names). */
function safeErrorName(err: Error): string {
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? `${err.name}:${code}` : err.name;
}

async function recordFailure(userId: string, documentId: string, message: string, stack?: string): Promise<void> {
  // No rawPayload: a failure row must never carry document text.
  await runAsUser(userId, () =>
    prisma.ingestionFailure.create({
      data: {
        userId,
        sourceAdapter: ADAPTER,
        adapterVersion: ADAPTER_VER,
        sourceRef: documentId,
        errorMessage: message,
        errorStack: stack ?? null,
      },
    }),
  );
}

const llmHint = (reason: string): string =>
  reason === 'budget_capped' ? 'AI reading is over budget this month.' : 'AI reading was not available.';

export async function processDocument(documentId: string, opts?: { password?: string }): Promise<void> {
  const doc = await runAsSystem(() =>
    prisma.document.findUnique({
      where: { id: documentId },
      select: { userId: true, storageKey: true, fileName: true, sortStatus: true, createdAt: true },
    }),
  );
  if (!doc || (doc.sortStatus !== 'PROCESSING' && doc.sortStatus !== 'NEEDS_PASSWORD')) return;
  const { userId } = doc;

  try {
    const buffer = await readBuffer(userId, doc.storageKey);
    const passwords = [...(opts?.password ? [opts.password] : []), ...(await getUserPdfPasswords(userId))];
    const extracted = await extractText({ buffer, fileName: doc.fileName, passwords, deadline: Date.now() + JOB_BUDGET_MS });

    if (!extracted.ok) {
      if (extracted.reason === 'password') {
        await setOutcome(userId, documentId, { status: 'NEEDS_PASSWORD', reason: 'This PDF is password protected.' });
      } else if (extracted.reason === 'unsupported') {
        await setOutcome(userId, documentId, { status: 'NEEDS_REVIEW', reason: 'This file type is stored but not read automatically yet.' });
      } else {
        await setOutcome(userId, documentId, { status: 'NEEDS_REVIEW', reason: 'Could not read this file.' });
        await recordFailure(userId, documentId, 'EXTRACT_UNREADABLE');
      }
      return;
    }

    const rules = runRules(extracted.text);
    let docType = rules.docType;
    let personName = rules.personName;
    let docDate = rules.docDate;
    let hint: string | null = null;

    if (rules.confidence < RULES_CONFIDENCE_THRESHOLD || !rules.personName) {
      const llm = await classifyForSortWithLlm({ userId, sourceRef: documentId, text: extracted.text });
      if (llm.ok && llm.confidence >= LLM_MIN_CONFIDENCE) {
        if (rules.confidence < RULES_CONFIDENCE_THRESHOLD) docType = llm.docType;
        personName = rules.personName ?? llm.personName;
        docDate = rules.docDate ?? llm.docDate;
      } else if (!llm.ok) {
        hint = llmHint(llm.reason);
      }
    }

    if (!personName) {
      await setOutcome(userId, documentId, {
        status: 'NEEDS_REVIEW',
        reason: hint ?? 'Could not find a name on this document.',
        docType,
        docDate,
      });
      return;
    }

    await fileDocument({ userId, documentId, fileName: doc.fileName, uploadedAt: doc.createdAt, personName, panLast4: rules.panLast4, docType, docDate });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    const label = safeErrorName(e);
    logger.error({ errorName: label, documentId }, '[docSorter] processing failed');
    await setOutcome(userId, documentId, { status: 'FAILED', reason: 'Processing error.' });
    // Frames only: the first stack line repeats the message, which can echo file or person names.
    await recordFailure(userId, documentId, label, e.stack?.split('\n').slice(1).join('\n'));
  }
}

async function fileDocument(a: {
  userId: string;
  documentId: string;
  fileName: string;
  uploadedAt: Date;
  personName: string;
  panLast4: string | null;
  docType: SortDocType;
  docDate: string | null;
}): Promise<void> {
  const key = nameKey(a.personName);
  await runAsUser(a.userId, () =>
    runInTransaction(async (tx) => {
      // One filing at a time per user: person lookup-or-create and file-name choice both read what
      // another worker may be writing, and nothing in the schema stops two equal results.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`docsort:${a.userId}`}))`);

      // Filed by hand (or failed) while this job was reading: the person's choice stands.
      const stillOurs = await tx.document.findFirst({
        where: { id: a.documentId, userId: a.userId, sortStatus: { in: ['PROCESSING', 'NEEDS_PASSWORD'] } },
        select: { id: true },
      });
      if (!stillOurs) return;

      const cands = await tx.documentPerson.findMany({
        where: { userId: a.userId },
        select: { id: true, nameKey: true, panLast4: true, aliasKeys: true },
      });
      let personId = matchPerson(cands, key, a.panLast4);
      if (!personId) {
        const created = await tx.documentPerson.create({
          data: { userId: a.userId, displayName: a.personName, nameKey: key, panLast4: a.panLast4, autoCreated: true },
          select: { id: true },
        });
        personId = created.id;
      } else if (a.panLast4) {
        await tx.documentPerson.updateMany({ where: { id: personId, panLast4: null }, data: { panLast4: a.panLast4 } });
      }

      const siblings = await tx.document.findMany({
        where: { userId: a.userId, personId, docType: a.docType, id: { not: a.documentId } },
        select: { fileName: true },
      });
      const fileName = uniqueName(
        buildSortedName(a.docType, a.docDate, a.uploadedAt, safeExt(a.fileName)),
        new Set(siblings.map((s) => s.fileName)),
      );
      await tx.document.update({
        where: { id: a.documentId },
        data: {
          personId,
          docType: a.docType,
          docDate: a.docDate ? new Date(`${a.docDate}T00:00:00Z`) : null,
          fileName,
          sortStatus: 'FILED',
          sortReason: null,
        },
      });
    }),
  );
}

/**
 * The queue gave up on this document's job (timeout or crash). Mark it FAILED and record it, but
 * only if it is still PROCESSING: a document filed or moved meanwhile is left alone, and calling
 * this twice records one failure.
 */
export async function failStuckDocument(documentId: string): Promise<void> {
  const doc = await runAsSystem(() =>
    prisma.document.findUnique({ where: { id: documentId }, select: { userId: true } }),
  );
  if (!doc) return;
  const { count } = await runAsUser(doc.userId, () =>
    prisma.document.updateMany({
      where: { id: documentId, sortStatus: 'PROCESSING' },
      data: { sortStatus: 'FAILED', sortReason: 'Reading took too long. Drop the file again to retry.' },
    }),
  );
  if (count > 0) await recordFailure(doc.userId, documentId, 'PROCESS_TIMEOUT');
}

/** Retry a password-protected PDF. The password rides the queue job only; it is never stored. */
export async function submitPassword(userId: string, documentId: string, password: string): Promise<void> {
  const doc = await runAsUser(userId, () =>
    prisma.document.findFirst({ where: { id: documentId, userId, ownerType: 'PERSON_DOCS' }, select: { id: true, sortStatus: true } }),
  );
  if (!doc) throw new NotFoundError('Document not found');
  if (doc.sortStatus !== 'NEEDS_PASSWORD') throw new BadRequestError('This document is not waiting for a password');
  await setOutcome(userId, documentId, { status: 'PROCESSING', reason: null });
  await enqueueOrReview(userId, documentId, password);
}
