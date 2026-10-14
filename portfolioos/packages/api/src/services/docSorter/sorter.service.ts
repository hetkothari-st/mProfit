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

export async function acceptUploads(userId: string, files: UploadInput[]): Promise<UploadAck[]> {
  const out: UploadAck[] = [];
  for (const f of files) {
    const contentHash = createHash('sha256').update(f.buffer).digest('hex');
    const existing = await runAsUser(userId, () =>
      prisma.document.findFirst({ where: { userId, contentHash }, select: { id: true, sortStatus: true } }),
    );
    if (existing) {
      out.push({ id: existing.id, duplicateOf: existing.id, status: existing.sortStatus ?? 'FILED' });
      continue;
    }

    const sniffed = sniff(f.buffer, f.originalName);
    const readable = sniffed.kind === 'pdf' || sniffed.kind === 'image';
    const storageKey = buildStorageKey(f.originalName);
    await saveBuffer(userId, storageKey, f.buffer);
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
      if (readable) {
        await enqueueBounded(getDocSortQueue().add({ documentId: created.id, userId }), 'doc-sort');
      }
      out.push({ id: created.id, status: created.sortStatus ?? 'PROCESSING' });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      // Lost the race to an identical concurrent upload: drop our copy of the bytes, report the winner.
      const winner = await runAsUser(userId, () =>
        prisma.document.findFirstOrThrow({ where: { userId, contentHash }, select: { id: true, sortStatus: true } }),
      );
      await deleteFile(userId, storageKey);
      out.push({ id: winner.id, duplicateOf: winner.id, status: winner.sortStatus ?? 'PROCESSING' });
    }
  }
  return out;
}

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
    const extracted = await extractText({ buffer, fileName: doc.fileName, passwords });

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
    logger.error({ err: e, documentId }, '[docSorter] processing failed');
    await setOutcome(userId, documentId, { status: 'FAILED', reason: 'Processing error.' });
    await recordFailure(userId, documentId, e.message, e.stack);
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
      const cands = await tx.documentPerson.findMany({
        where: { userId: a.userId },
        select: { id: true, nameKey: true, panLast4: true },
      });
      let personId = matchPerson(cands, key, a.panLast4);
      if (!personId) {
        const created = await tx.documentPerson.upsert({
          where: { userId_nameKey: { userId: a.userId, nameKey: key } },
          create: { userId: a.userId, displayName: a.personName, nameKey: key, panLast4: a.panLast4, autoCreated: true },
          update: {},
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

/** Retry a password-protected PDF. The password rides the queue job only; it is never stored. */
export async function submitPassword(userId: string, documentId: string, password: string): Promise<void> {
  const doc = await runAsUser(userId, () =>
    prisma.document.findFirst({ where: { id: documentId, userId, ownerType: 'PERSON_DOCS' }, select: { id: true, sortStatus: true } }),
  );
  if (!doc) throw new NotFoundError('Document not found');
  if (doc.sortStatus !== 'NEEDS_PASSWORD') throw new BadRequestError('This document is not waiting for a password');
  await setOutcome(userId, documentId, { status: 'PROCESSING', reason: null });
  await enqueueBounded(getDocSortQueue().add({ documentId, userId, password }), 'doc-sort');
}
