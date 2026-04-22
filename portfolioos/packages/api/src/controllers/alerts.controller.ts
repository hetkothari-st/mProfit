import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listAlerts,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteAlert,
  createCustomAlert,
  runAllAlertScans,
} from '../services/alerts.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import type { AlertType } from '@prisma/client';

const ALERT_TYPES = [
  'FD_MATURITY', 'BOND_MATURITY', 'MF_LOCK_IN_EXPIRY', 'SIP_DUE',
  'INSURANCE_PREMIUM', 'DIVIDEND_RECEIVED', 'CORPORATE_ACTION', 'PRICE_TARGET', 'CUSTOM',
] as const;

const createCustomSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  triggerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  portfolioId: z.string().optional(),
});

export async function listAlertsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { unreadOnly, type, page, limit } = req.query as Record<string, string>;
  const result = await listAlerts(req.user.id, {
    unreadOnly: unreadOnly === 'true',
    type: type as AlertType | undefined,
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  ok(res, result);
}

export async function getUnreadCountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const count = await getUnreadCount(req.user.id);
  ok(res, { count });
}

export async function markReadHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await markRead(req.user.id, req.params['id']!);
  ok(res, null);
}

export async function markAllReadHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const count = await markAllRead(req.user.id);
  ok(res, { marked: count });
}

export async function deleteAlertHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteAlert(req.user.id, req.params['id']!);
  ok(res, null);
}

export async function createCustomAlertHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createCustomSchema.parse(req.body);
  const alert = await createCustomAlert(req.user.id, body);
  res.status(201);
  ok(res, alert);
}

export async function triggerScansHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const result = await runAllAlertScans(req.user.id);
  ok(res, result);
}
