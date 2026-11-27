import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../lib/response.js';
import {
  addNote,
  addTask,
  deleteNote,
  deleteTask,
  listMyOpenTasks,
  listNotes,
  listTasks,
  updateNote,
  updateTask,
} from '../services/ca/caPractice.service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const noteBody = z.object({ body: z.string().max(5000) });
const notePatch = z.object({ body: z.string().max(5000).optional(), pinned: z.boolean().optional() });
const taskBody = z.object({ title: z.string().max(200), dueDate: day.nullable().optional() });
const taskPatch = z.object({
  title: z.string().max(200).optional(),
  dueDate: day.nullable().optional(),
  status: z.enum(['OPEN', 'DONE']).optional(),
});

const ids = (req: Request) => ({ clientId: String(req.params.clientId), id: String(req.params.id ?? '') });

export async function listNotesHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listNotes(req.user!.id, ids(req).clientId));
}
export async function addNoteHandler(req: Request, res: Response): Promise<void> {
  created(res, await addNote(req.user!.id, ids(req).clientId, noteBody.parse(req.body)));
}
export async function updateNoteHandler(req: Request, res: Response): Promise<void> {
  const { clientId, id } = ids(req);
  ok(res, await updateNote(req.user!.id, clientId, id, notePatch.parse(req.body)));
}
export async function deleteNoteHandler(req: Request, res: Response): Promise<void> {
  const { clientId, id } = ids(req);
  await deleteNote(req.user!.id, clientId, id);
  noContent(res);
}

export async function listTasksHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listTasks(req.user!.id, ids(req).clientId));
}
export async function addTaskHandler(req: Request, res: Response): Promise<void> {
  created(res, await addTask(req.user!.id, ids(req).clientId, taskBody.parse(req.body)));
}
export async function updateTaskHandler(req: Request, res: Response): Promise<void> {
  const { clientId, id } = ids(req);
  ok(res, await updateTask(req.user!.id, clientId, id, taskPatch.parse(req.body)));
}
export async function deleteTaskHandler(req: Request, res: Response): Promise<void> {
  const { clientId, id } = ids(req);
  await deleteTask(req.user!.id, clientId, id);
  noContent(res);
}

/** GET /api/ca/tasks — open to-dos across every active client, soonest first. */
export async function listMyOpenTasksHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listMyOpenTasks(req.user!.id));
}
