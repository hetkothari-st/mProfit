import type { DocumentRequest, DocumentRequestStatus } from '@prisma/client';
import type { Request } from 'express';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { recordCaAudit } from './caAudit.service.js';
import { actsForClient } from './caAccess.service.js';
import { createDocument } from '../documents/document.service.js';

/**
 * Documents a CA asks a client for.
 *
 * The CA asks (title, financial year, due date, note). The client is told in
 * their inbox and answers from their own account: an upload lands in THEIR
 * vault — the CA reads it through the grant like any other client document —
 * or they say it does not apply. The CA then accepts or cancels.
 *
 * Both sides read a request (RLS). Who may change what is decided here: only
 * the CA on an active grant asks and closes; only the account holder answers.
 */

const TITLE_MAX = 200;
const NOTE_MAX = 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const FY = /^\d{4}-\d{2}$/;

/** Statuses the client can still act on, or is waiting on the CA for. */
const LIVE: DocumentRequestStatus[] = ['OPEN', 'UPLOADED', 'NOT_APPLICABLE'];

function text(v: unknown, max: number, what: string, required: boolean): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (required) throw new BadRequestError(`${what} is required.`);
    return null;
  }
  if (s.length > max) throw new BadRequestError(`${what} can be at most ${max} characters.`);
  return s;
}

const alertKey = (requestId: string) => `ca_document_request:${requestId}`;

async function retireAlert(requestId: string): Promise<void> {
  // The alert belongs to the client; either side's action ends it, so this
  // runs as the system rather than as whoever acted.
  await runAsSystem(() =>
    prisma.alert.updateMany({
      where: { isActive: true, metadata: { path: ['key'], equals: alertKey(requestId) } },
      data: { isActive: false },
    }),
  );
}

// ─── The CA's side ─────────────────────────────────────────────────────

async function advisorClient(callerId: string, clientId: string, write: boolean) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, advisorId: true, userId: true, status: true, kind: true },
  });
  if (!client) throw new NotFoundError('Client not found.');
  if (!(await actsForClient(callerId, client))) throw new ForbiddenError('That client is not yours.');
  if (write && client.status !== 'ACTIVE') throw new BadRequestError('This engagement is not active.');
  return client;
}

export async function requestDocument(
  callerId: string,
  clientId: string,
  input: { title: unknown; note?: unknown; financialYear?: unknown; dueDate?: unknown },
  req?: Request,
): Promise<DocumentRequest> {
  const client = await advisorClient(callerId, clientId, true);
  // A record the CA keeps has a placeholder user nobody signs in as: a request
  // to it would sit forever and alert no one.
  if (!client.userId || client.kind === 'SHADOW') {
    throw new BadRequestError('This client has no login, so there is nobody to send a request to. Add their documents to the books yourself, or invite them to the app.');
  }
  const title = text(input.title, TITLE_MAX, 'A title', true)!;
  const note = text(input.note, NOTE_MAX, 'The note', false);
  const fy = text(input.financialYear, 7, 'Financial year', false);
  if (fy && !FY.test(fy)) throw new BadRequestError('Financial year must look like 2025-26.');
  const due = text(input.dueDate, 10, 'Due date', false);
  if (due && !ISO_DAY.test(due)) throw new BadRequestError('Due date must be YYYY-MM-DD.');

  const row = await runInTransaction(async (tx) => {
    const created = await tx.documentRequest.create({
      data: {
        clientId,
        requestedByUserId: callerId,
        title,
        note,
        financialYear: fy,
        dueDate: due ? new Date(`${due}T00:00:00Z`) : null,
      },
    });
    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: client.userId!, clientId, req },
      {
        action: 'DOCUMENT_REQUESTED',
        resourceType: 'DocumentRequest',
        resourceId: created.id,
        summary: `Your CA asked you for: ${title}${fy ? ` (FY ${fy})` : ''}.`,
      },
    );
    return created;
  });

  // Tell the client where they will look anyway: their inbox.
  await runAsSystem(() =>
    prisma.alert.create({
      data: {
        userId: client.userId!,
        type: 'CUSTOM',
        title: `Your CA asked for: ${title}`,
        description: `${fy ? `For FY ${fy}. ` : ''}Upload it from Settings → Account access${due ? ` by ${due}` : ''}.`,
        triggerDate: row.dueDate ?? new Date(),
        metadata: {
          key: alertKey(row.id),
          documentRequestId: row.id,
          ...(due ? { dueDate: due } : {}),
          link: '/settings/professional-access',
        },
      },
    }),
  );
  return row;
}

export async function listClientRequests(callerId: string, clientId: string): Promise<DocumentRequest[]> {
  await advisorClient(callerId, clientId, false);
  return prisma.documentRequest.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
}

export async function closeRequest(
  callerId: string,
  clientId: string,
  requestId: string,
  outcome: 'ACCEPTED' | 'CANCELLED',
  req?: Request,
): Promise<void> {
  const client = await advisorClient(callerId, clientId, false);
  if (outcome !== 'ACCEPTED' && outcome !== 'CANCELLED') throw new BadRequestError('Close as ACCEPTED or CANCELLED.');
  const row = await prisma.documentRequest.findFirst({ where: { id: requestId, clientId } });
  if (!row) throw new NotFoundError('Request not found.');
  if (row.status === 'ACCEPTED' || row.status === 'CANCELLED') return;
  if (outcome === 'ACCEPTED' && row.status === 'OPEN') {
    throw new BadRequestError('Nothing has been sent yet. Cancel the request instead.');
  }

  await runInTransaction(async (tx) => {
    await tx.documentRequest.update({ where: { id: requestId }, data: { status: outcome, closedAt: new Date() } });
    await recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: client.userId ?? callerId, clientId, req },
      {
        action: 'DOCUMENT_REQUEST_CLOSED',
        resourceType: 'DocumentRequest',
        resourceId: requestId,
        summary:
          outcome === 'ACCEPTED'
            ? `Your CA accepted what you sent for: ${row.title}.`
            : `Your CA withdrew the request for: ${row.title}.`,
      },
    );
  });
  await retireAlert(requestId);
}

// ─── The account holder's side ─────────────────────────────────────────

export interface MyDocumentRequest {
  id: string;
  title: string;
  note: string | null;
  financialYear: string | null;
  dueDate: string | null;
  status: DocumentRequestStatus;
  clientNote: string | null;
  documentId: string | null;
  createdAt: string;
  /** Who asked: the professional on the grant. */
  askedBy: string;
}

/** Requests still in play (open, or answered and waiting on the CA), newest first. */
export async function listMyDocumentRequests(callerId: string): Promise<MyDocumentRequest[]> {
  const rows = await prisma.documentRequest.findMany({
    where: { status: { in: LIVE }, client: { userId: callerId } },
    include: { client: { select: { name: true, initiatedBy: true, advisorId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // Who asked. The professional is another user, invisible under the account
  // holder's own policies, so their name is a bounded privileged read — the
  // same one the Account Access page makes to name them.
  const advisorIds = [...new Set(rows.map((r) => r.client.advisorId).filter((x): x is string => !!x))];
  const advisors = advisorIds.length
    ? await runAsSystem(() =>
        prisma.user.findMany({ where: { id: { in: advisorIds } }, select: { id: true, name: true, email: true } }),
      )
    : [];
  const nameOf = new Map(advisors.map((a) => [a.id, a.name || a.email]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    note: r.note,
    financialYear: r.financialYear,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    status: r.status,
    clientNote: r.clientNote,
    documentId: r.documentId,
    createdAt: r.createdAt.toISOString(),
    askedBy:
      (r.client.advisorId && nameOf.get(r.client.advisorId)) ||
      (r.client.initiatedBy === 'CLIENT' ? r.client.name : 'Your CA'),
  }));
}

async function myRequest(callerId: string, requestId: string) {
  const row = await prisma.documentRequest.findUnique({
    where: { id: requestId },
    include: { client: { select: { userId: true } } },
  });
  if (!row || row.client.userId !== callerId) throw new NotFoundError('Request not found.');
  if (row.status === 'ACCEPTED' || row.status === 'CANCELLED') {
    throw new BadRequestError('This request is closed.');
  }
  return row;
}

export async function answerWithUpload(
  callerId: string,
  requestId: string,
  file: { buffer: Buffer; fileName: string; mimeType: string },
): Promise<void> {
  const row = await myRequest(callerId, requestId);
  const doc = await createDocument({
    userId: callerId,
    ownerType: 'OTHER',
    ownerId: requestId,
    category: 'Sent to your CA',
    fileName: file.fileName,
    mimeType: file.mimeType,
    buffer: file.buffer,
  });
  await prisma.documentRequest.update({
    where: { id: row.id },
    data: { status: 'UPLOADED', documentId: doc.id, respondedAt: new Date() },
  });
  await retireAlert(requestId);
}

export async function answerNotApplicable(callerId: string, requestId: string, reason: unknown): Promise<void> {
  const row = await myRequest(callerId, requestId);
  await prisma.documentRequest.update({
    where: { id: row.id },
    data: {
      status: 'NOT_APPLICABLE',
      clientNote: text(reason, NOTE_MAX, 'A reason', true),
      respondedAt: new Date(),
    },
  });
  await retireAlert(requestId);
}
