import type { Request, Response } from 'express';
import { ok } from '../lib/response.js';
import { BadRequestError } from '../lib/errors.js';
import {
  listReminders,
  updateReminder,
  rejectReminder,
  approveAndSendReminder,
  enqueuePendingReminders,
  REMINDER_STATUS,
  type ReminderStatus,
} from '../services/rental.reminders.service.js';

function userId(req: Request): string {
  if (!req.user) throw new Error('auth middleware missing');
  return req.user.id;
}

const VALID_STATUSES = new Set(Object.values(REMINDER_STATUS));

export async function getReminders(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  if (status && !VALID_STATUSES.has(status as ReminderStatus)) {
    throw new BadRequestError(`Invalid status filter: ${status}`);
  }
  const tenancyId = req.query.tenancyId as string | undefined;
  const rows = await listReminders(userId(req), {
    status: status as ReminderStatus | undefined,
    tenancyId,
  });
  ok(res, rows);
}

export async function patchReminder(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const row = await updateReminder(userId(req), id, req.body ?? {});
  ok(res, row);
}

export async function rejectReminderHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const row = await rejectReminder(userId(req), id);
  ok(res, row);
}

export async function approveReminderHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const row = await approveAndSendReminder(userId(req), id);
  ok(res, row);
}

/**
 * Admin / debug endpoint — manually triggers the same scan the cron does.
 * Useful for testing before the 09:00 IST run and for one-off catch-ups
 * after a downtime.
 */
export async function runReminderScanHandler(req: Request, res: Response): Promise<void> {
  const count = await enqueuePendingReminders(userId(req));
  ok(res, { queued: count });
}
