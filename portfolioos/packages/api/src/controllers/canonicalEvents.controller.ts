import type { Request, Response } from 'express';
import { z } from 'zod';
import { CanonicalEventStatus, CanonicalEventType } from '@prisma/client';
import {
  listCanonicalEvents,
  getCanonicalEvent,
  updateCanonicalEvent,
  approveCanonicalEvent,
  rejectCanonicalEvent,
  bulkApproveFromSender,
} from '../services/canonicalEvents.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const statusValues = Object.values(CanonicalEventStatus) as [
  CanonicalEventStatus,
  ...CanonicalEventStatus[],
];
const typeValues = Object.values(CanonicalEventType) as [
  CanonicalEventType,
  ...CanonicalEventType[],
];

const listQuerySchema = z.object({
  status: z.enum(statusValues).optional(),
  senderAddress: z.string().email().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Money/quantity patches arrive as strings (§3.2 — never JS `number` on
 * the wire). Dates arrive as ISO strings and coerce to Date. `null`
 * explicitly clears; `undefined` (missing key) leaves the field alone.
 */
const patchBodySchema = z.object({
  eventType: z.enum(typeValues).optional(),
  eventDate: z.coerce.date().optional(),
  amount: z.string().nullable().optional(),
  quantity: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  instrumentIsin: z.string().nullable().optional(),
  instrumentSymbol: z.string().nullable().optional(),
  instrumentName: z.string().nullable().optional(),
  portfolioId: z.string().nullable().optional(),
});

const rejectBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

const bulkApproveBodySchema = z.object({
  senderAddress: z.string().email(),
});

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = listQuerySchema.parse(req.query);
  const rows = await listCanonicalEvents(req.user.id, q);
  ok(res, rows);
}

export async function get(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await getCanonicalEvent(req.user.id, req.params.id!);
  ok(res, row);
}

export async function patch(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = patchBodySchema.parse(req.body ?? {});
  const row = await updateCanonicalEvent(req.user.id, req.params.id!, body);
  ok(res, row);
}

export async function approve(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const outcome = await approveCanonicalEvent(req.user.id, req.params.id!);
  ok(res, outcome);
}

export async function reject(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = rejectBodySchema.parse(req.body ?? {});
  const row = await rejectCanonicalEvent(req.user.id, req.params.id!, body.reason);
  ok(res, row);
}

export async function bulkApprove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = bulkApproveBodySchema.parse(req.body ?? {});
  const outcome = await bulkApproveFromSender(req.user.id, body.senderAddress);
  ok(res, outcome);
}
