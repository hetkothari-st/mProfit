import type { ClientNote, ClientTask, ClientTaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';

/**
 * The CA's own working notes and to-dos per client.
 *
 * Practice-private: the client's books are the client's to see in full, but a
 * firm's notes about a client are the firm's, as they would be on paper. RLS
 * limits both tables to the CA on the grant (Client.advisorId); these checks
 * say so in words before the policy would silently return nothing.
 */

const NOTE_MAX = 5000;
const TITLE_MAX = 200;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function assertAdvisor(callerId: string, clientId: string, write: boolean): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { advisorId: true, status: true },
  });
  if (!client) throw new NotFoundError('Client not found.');
  if (client.advisorId !== callerId) throw new ForbiddenError('That client is not yours.');
  // Past engagements stay readable so the history is not lost; new work needs a live grant.
  if (write && client.status !== 'ACTIVE') throw new BadRequestError('This engagement is not active.');
}

function cleanBody(body: unknown): string {
  const s = typeof body === 'string' ? body.trim() : '';
  if (!s) throw new BadRequestError('A note cannot be empty.');
  if (s.length > NOTE_MAX) throw new BadRequestError(`A note can be at most ${NOTE_MAX} characters.`);
  return s;
}

function cleanTitle(title: unknown): string {
  const s = typeof title === 'string' ? title.trim() : '';
  if (!s) throw new BadRequestError('A task needs a title.');
  if (s.length > TITLE_MAX) throw new BadRequestError(`A task title can be at most ${TITLE_MAX} characters.`);
  return s;
}

function dayOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !ISO_DAY.test(v)) throw new BadRequestError('Due date must be YYYY-MM-DD.');
  return new Date(`${v}T00:00:00Z`);
}

// ─── Notes ─────────────────────────────────────────────────────────────

export async function listNotes(callerId: string, clientId: string): Promise<ClientNote[]> {
  await assertAdvisor(callerId, clientId, false);
  return prisma.clientNote.findMany({
    where: { clientId },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function addNote(callerId: string, clientId: string, input: { body: unknown }): Promise<ClientNote> {
  await assertAdvisor(callerId, clientId, true);
  return prisma.clientNote.create({
    data: { clientId, authorUserId: callerId, body: cleanBody(input.body) },
  });
}

export async function updateNote(
  callerId: string,
  clientId: string,
  noteId: string,
  patch: { body?: unknown; pinned?: boolean },
): Promise<ClientNote> {
  await assertAdvisor(callerId, clientId, true);
  const note = await prisma.clientNote.findFirst({ where: { id: noteId, clientId } });
  if (!note) throw new NotFoundError('Note not found.');
  return prisma.clientNote.update({
    where: { id: noteId },
    data: {
      ...(patch.body !== undefined ? { body: cleanBody(patch.body) } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
    },
  });
}

export async function deleteNote(callerId: string, clientId: string, noteId: string): Promise<void> {
  await assertAdvisor(callerId, clientId, true);
  const { count } = await prisma.clientNote.deleteMany({ where: { id: noteId, clientId } });
  if (count === 0) throw new NotFoundError('Note not found.');
}

// ─── Tasks ─────────────────────────────────────────────────────────────

export async function listTasks(callerId: string, clientId: string): Promise<ClientTask[]> {
  await assertAdvisor(callerId, clientId, false);
  const rows = await prisma.clientTask.findMany({ where: { clientId } });
  return sortTasks(rows);
}

/** Open first, then by due date (undated last), then oldest first. */
function sortTasks<T extends { status: ClientTaskStatus; dueDate: Date | null; createdAt: Date }>(rows: T[]): T[] {
  const due = (t: T) => t.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...rows].sort(
    (a, b) =>
      (a.status === b.status ? 0 : a.status === 'OPEN' ? -1 : 1) ||
      due(a) - due(b) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export async function addTask(
  callerId: string,
  clientId: string,
  input: { title: unknown; dueDate?: unknown },
): Promise<ClientTask> {
  await assertAdvisor(callerId, clientId, true);
  return prisma.clientTask.create({
    data: {
      clientId,
      createdByUserId: callerId,
      title: cleanTitle(input.title),
      dueDate: dayOrNull(input.dueDate),
    },
  });
}

export async function updateTask(
  callerId: string,
  clientId: string,
  taskId: string,
  patch: { title?: unknown; dueDate?: unknown; status?: ClientTaskStatus },
): Promise<ClientTask> {
  await assertAdvisor(callerId, clientId, true);
  const task = await prisma.clientTask.findFirst({ where: { id: taskId, clientId } });
  if (!task) throw new NotFoundError('Task not found.');
  if (patch.status !== undefined && patch.status !== 'OPEN' && patch.status !== 'DONE') {
    throw new BadRequestError('Task status must be OPEN or DONE.');
  }
  return prisma.clientTask.update({
    where: { id: taskId },
    data: {
      ...(patch.title !== undefined ? { title: cleanTitle(patch.title) } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: dayOrNull(patch.dueDate) } : {}),
      ...(patch.status !== undefined
        ? { status: patch.status, doneAt: patch.status === 'DONE' ? (task.doneAt ?? new Date()) : null }
        : {}),
    },
  });
}

export async function deleteTask(callerId: string, clientId: string, taskId: string): Promise<void> {
  await assertAdvisor(callerId, clientId, true);
  const { count } = await prisma.clientTask.deleteMany({ where: { id: taskId, clientId } });
  if (count === 0) throw new NotFoundError('Task not found.');
}

export interface OpenTaskRow {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  dueDate: string | null;
}

/** Every open to-do across the caller's active clients, soonest first. */
export async function listMyOpenTasks(callerId: string, limit = 100): Promise<OpenTaskRow[]> {
  const rows = await prisma.clientTask.findMany({
    where: { status: 'OPEN', client: { advisorId: callerId, status: 'ACTIVE' } },
    include: {
      client: {
        select: { name: true, initiatedBy: true, clientUser: { select: { name: true, email: true } } },
      },
    },
  });
  return sortTasks(rows)
    .slice(0, Math.min(limit, 500))
    .map((t) => ({
      id: t.id,
      clientId: t.clientId,
      clientName:
        t.client.initiatedBy === 'CLIENT' && t.client.clientUser
          ? t.client.clientUser.name || t.client.clientUser.email
          : t.client.name,
      title: t.title,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    }));
}
