/**
 * Sealing and loading of will payloads. The payload holds every personal
 * detail of a will, so it is only ever stored sealed with the owner's data
 * key (slot "will:<id>") and never logged.
 */
import { randomUUID } from 'node:crypto';
import type { Will } from '@prisma/client';
import type { ZodError } from 'zod';
import { istCalendarDate, willPayloadSchema, type WillPayload } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { openForUser, sealForUser, userKeysAvailable } from '../../lib/userKeys.js';
import { logger } from '../../lib/logger.js';

export function newWillId(): string {
  return randomUUID();
}

export function requireWillKeys(): void {
  if (!userKeysAvailable()) {
    throw new AppError('Will Maker is not available right now', 503, 'WILL_KEYS_UNAVAILABLE');
  }
}

const slot = (willId: string) => `will:${willId}`;

export async function sealWillPayload(userId: string, willId: string, payload: WillPayload): Promise<Buffer> {
  requireWillKeys();
  return sealForUser(userId, slot(willId), Buffer.from(JSON.stringify(payload), 'utf8'));
}

export async function openWillPayload(userId: string, willId: string, sealed: Uint8Array): Promise<WillPayload> {
  requireWillKeys();
  const plain = await openForUser(userId, slot(willId), Buffer.from(sealed));
  const parsed = willPayloadSchema.safeParse(JSON.parse(plain.toString('utf8')));
  if (!parsed.success) {
    // Paths and codes only - the payload holds names and addresses.
    logger.error({ willId, issues: zodIssues(parsed.error) }, 'will.payload_unreadable');
    throw new AppError('This will could not be read. Please contact support.', 500, 'WILL_PAYLOAD_UNREADABLE');
  }
  return parsed.data;
}

export async function loadOwnedWill(userId: string, willId: string): Promise<Will> {
  const will = await prisma.will.findFirst({ where: { id: willId, userId } });
  if (!will) throw new NotFoundError('Will not found');
  return will;
}

export async function loadDraft(userId: string, willId: string): Promise<{ will: Will; payload: WillPayload }> {
  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'DRAFT') throw notDraft();
  return { will, payload: await openWillPayload(userId, will.id, will.payload) };
}

export function notDraft(): ConflictError {
  return new ConflictError('This will can no longer be edited. Start a new version instead.', { reason: 'WILL_NOT_DRAFT' });
}

export function revisionConflict(current: number): ConflictError {
  return new ConflictError('This will was changed in another tab or device. Reload to continue.', {
    reason: 'WILL_REVISION_CONFLICT',
    revision: current,
  });
}

/** Issue paths and codes only: zod messages and inputs never leave the server. */
export function zodIssues(err: ZodError): Array<{ path: string; code: string }> {
  return err.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), code: i.code }));
}

export function todayIst(): string {
  return istCalendarDate(new Date());
}
