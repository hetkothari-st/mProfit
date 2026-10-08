// packages/api/src/services/split/receipts.service.ts
/**
 * Receipt files. Bytes live in the uploader's sealed DocumentBlob (owner-only
 * RLS, per-user key). Any current group member may read them: membership is
 * checked under the caller's own RLS context, then the blob is opened as its
 * owner via documentStorage, which runs as that user internally.
 */
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { buildStorageKey, saveBuffer, readBuffer, deleteFile } from '../../lib/documentStorage.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';
import { detectReceiptKind, stripImageMetadata, type ReceiptKind } from './imageMeta.js';

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<ReceiptKind, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

async function load(userId: string, expenseId: string) {
  const e = await prisma.splitExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, groupId: true, description: true, deletedAt: true, receiptBlobId: true, receiptOwnerUserId: true, receiptMime: true },
  });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return e;
}

/** deleteFile is a no-op for a missing key, so an owner who already left needs no special case. */
async function dropBlob(ownerId: string | null, key: string | null): Promise<void> {
  if (!ownerId || !key) return;
  await deleteFile(ownerId, key);
}

export async function putReceipt(userId: string, expenseId: string, file: { buffer: Buffer; originalname: string }) {
  const e = await load(userId, expenseId);
  if (e.deletedAt) throw new BadRequestError('Restore the expense before changing its receipt');
  if (file.buffer.length === 0 || file.buffer.length > MAX_BYTES) throw new BadRequestError('Receipts must be under 10 MB');
  const kind = detectReceiptKind(file.buffer);
  if (!kind) throw new BadRequestError('Upload a JPEG, PNG, WebP or PDF receipt');
  const clean = stripImageMetadata(file.buffer, kind);
  const key = buildStorageKey(`receipt${EXT[kind]}`);
  await saveBuffer(userId, key, clean);
  await runInTransaction(async (tx) => {
    await tx.splitExpense.update({ where: { id: expenseId }, data: { receiptBlobId: key, receiptOwnerUserId: userId, receiptMime: kind } });
    await writeActivity(tx, e.groupId, userId, 'RECEIPT_ADDED', { expenseId, description: e.description });
  });
  await dropBlob(e.receiptOwnerUserId, e.receiptBlobId);
  return { hasReceipt: true as const, mime: kind };
}

export async function getReceipt(userId: string, expenseId: string): Promise<{ buffer: Buffer; mime: string }> {
  const e = await load(userId, expenseId);
  if (!e.receiptBlobId || !e.receiptOwnerUserId) throw new NotFoundError('No receipt attached');
  try {
    return { buffer: await readBuffer(e.receiptOwnerUserId, e.receiptBlobId), mime: e.receiptMime ?? 'application/octet-stream' };
  } catch (err) {
    if (err instanceof NotFoundError) throw new NotFoundError('Receipt no longer available');
    throw err;
  }
}

export async function deleteReceipt(userId: string, expenseId: string): Promise<void> {
  const e = await load(userId, expenseId);
  if (e.deletedAt) throw new BadRequestError('Restore the expense before changing its receipt');
  if (!e.receiptBlobId) return;
  await runInTransaction(async (tx) => {
    await tx.splitExpense.update({ where: { id: expenseId }, data: { receiptBlobId: null, receiptOwnerUserId: null, receiptMime: null } });
    await writeActivity(tx, e.groupId, userId, 'RECEIPT_REMOVED', { expenseId, description: e.description });
  });
  await dropBlob(e.receiptOwnerUserId, e.receiptBlobId);
}
