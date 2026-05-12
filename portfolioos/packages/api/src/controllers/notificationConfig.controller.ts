import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import {
  getNotificationConfig,
  upsertNotificationConfig,
  deleteNotificationConfig,
  sendTestEmail,
  getSenderStatus,
} from '../services/notifications/config.service.js';

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

// Only the app password ever crosses the wire from the form — host /
// port / user / from-name / from-email are derived server-side from
// the user's profile (see config.service.ts). Default payment
// instructions are managed from the rental reminders panel so they
// land on this route too.
const configSchema = z.object({
  smtpPass: z.string().max(500).optional(),
  paymentInstructions: z.string().max(2000).nullable().optional(),
});

const testSchema = z.object({
  to: z.string().email(),
});

export async function getConfigHandler(req: Request, res: Response): Promise<void> {
  const row = await getNotificationConfig(userId(req));
  ok(res, row);
}

export async function upsertConfigHandler(req: Request, res: Response): Promise<void> {
  const body = configSchema.parse(req.body ?? {});
  try {
    const row = await upsertNotificationConfig(userId(req), body);
    ok(res, row);
  } catch (err) {
    if (
      err instanceof Error
      && (err.message.includes('password is required') || err.message.includes("can't auto-detect"))
    ) {
      throw new BadRequestError(err.message);
    }
    throw err;
  }
}

export async function deleteConfigHandler(req: Request, res: Response): Promise<void> {
  await deleteNotificationConfig(userId(req));
  ok(res, { deleted: true });
}

export async function testConfigHandler(req: Request, res: Response): Promise<void> {
  const body = testSchema.parse(req.body ?? {});
  const result = await sendTestEmail(userId(req), body.to);
  ok(res, result);
}

export async function statusHandler(req: Request, res: Response): Promise<void> {
  const status = await getSenderStatus(userId(req));
  ok(res, status);
}
