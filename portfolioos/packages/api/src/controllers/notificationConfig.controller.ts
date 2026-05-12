import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import {
  getNotificationConfig,
  upsertNotificationConfig,
  deleteNotificationConfig,
  sendTestEmail,
} from '../services/notifications/config.service.js';

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

const configSchema = z.object({
  smtpHost: z.string().min(1).max(200),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().min(1).max(200),
  // Empty string means "keep existing password". Required only on first save.
  smtpPass: z.string().max(500).optional(),
  fromName: z.string().min(1).max(200),
  fromEmail: z.string().email().max(200),
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
    if (err instanceof Error && err.message.includes('password is required')) {
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
