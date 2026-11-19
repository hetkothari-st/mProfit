import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  SUPPORT_STATUSES,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_SUBJECT_MIN,
  SUPPORT_TOPICS,
} from '@everypaisa/shared';
import { created, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import {
  adminListTickets,
  adminUpdateTicket,
  createTicket,
  listMyTickets,
} from '../services/support/support.service.js';

const createBody = z.object({
  topic: z.enum(SUPPORT_TOPICS),
  subject: z.string().trim().min(SUPPORT_SUBJECT_MIN, 'Add a short subject').max(SUPPORT_SUBJECT_MAX),
  message: z
    .string()
    .trim()
    .min(SUPPORT_MESSAGE_MIN, 'Tell us a little more so we can help')
    .max(SUPPORT_MESSAGE_MAX),
  pagePath: z.string().max(200).optional(),
});

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

/** POST /api/support/tickets */
export async function createTicketHandler(req: Request, res: Response): Promise<void> {
  const body = createBody.parse(req.body);
  created(res, await createTicket(userId(req), body));
}

/** GET /api/support/tickets: the caller's own requests, newest first. */
export async function listMyTicketsHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listMyTickets(userId(req)));
}

const adminListQuery = z.object({ status: z.enum(SUPPORT_STATUSES).optional() });
const adminPatchBody = z
  .object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    adminNote: z.string().max(2000).nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.adminNote !== undefined, 'Nothing to update');

/** GET /api/admin/support/tickets */
export async function adminListHandler(req: Request, res: Response): Promise<void> {
  const q = adminListQuery.parse(req.query);
  ok(res, await adminListTickets(q));
}

/** PATCH /api/admin/support/tickets/:id */
export async function adminPatchHandler(req: Request, res: Response): Promise<void> {
  const patch = adminPatchBody.parse(req.body);
  ok(res, await adminUpdateTicket(req.params.id!, patch));
}
