/**
 * Document vault service.
 *
 * Owns DB lifecycle for `Document` rows and the matching files on disk.
 * Polymorphic over (ownerType, ownerId): the caller is responsible for
 * verifying the owner row belongs to the user before creating a document.
 *
 * `externalEditKey` is bumped on every save-from-OnlyOffice so the
 * DocumentServer's internal cache invalidates and clients refetch bytes.
 */

import {
  randomUUID } from 'node:crypto';
import { Prisma,
  type Document,
  DocumentOwnerType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  buildStorageKey,
  saveBuffer,
  fileSize,
  deleteFile,
  readBuffer,
} from '../lib/documentStorage.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';

export interface CreateDocumentInput {
  userId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  category?: string | null;
  buffer: Buffer;
}

async function assertOwnerAccessible(
  userId: string,
  ownerType: DocumentOwnerType,
  ownerId: string,
): Promise<void> {
  switch (ownerType) {
    case 'RENTAL_PROPERTY': {
      const row = await prisma.rentalProperty.findFirst({
        where: { id: ownerId, userId },
        select: { id: true },
      });
      if (!row) throw new ForbiddenError('Rental property not owned by user');
      return;
    }
    case 'TENANCY': {
      const row = await prisma.tenancy.findFirst({
        where: { id: ownerId, property: { userId } },
        select: { id: true },
      });
      if (!row) throw new ForbiddenError('Tenancy not owned by user');
      return;
    }
    case 'VEHICLE': {
      const row = await prisma.vehicle.findFirst({
        where: { id: ownerId, userId },
        select: { id: true },
      });
      if (!row) throw new ForbiddenError('Vehicle not owned by user');
      return;
    }
    case 'INSURANCE_POLICY': {
      const row = await prisma.insurancePolicy.findFirst({
        where: { id: ownerId, userId },
        select: { id: true },
      });
      if (!row) throw new ForbiddenError('Insurance policy not owned by user');
      return;
    }
    case 'PORTFOLIO': {
      const row = await prisma.portfolio.findFirst({
        where: { id: ownerId, userId },
        select: { id: true },
      });
      if (!row) throw new ForbiddenError('Portfolio not owned by user');
      return;
    }
    case 'OWNED_PROPERTY': {
      const row = await prisma.ownedProperty.findFirst({
        where: { id: ownerId, userId },
        select: { id: true },
      });
      if (!row) throw new ForbiddenError('Owned property not owned by user');
      return;
    }
    case 'OTHER':
      // free-form; userId on Document is the only guard
      return;
  }
}

function toDocumentDTO(d: Document) {
  return {
    id: d.id,
    ownerType: d.ownerType,
    ownerId: d.ownerId,
    category: d.category,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    externalEditKey: d.externalEditKey,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function createDocument(input: CreateDocumentInput) {
  await assertOwnerAccessible(input.userId, input.ownerType, input.ownerId);

  const storageKey = buildStorageKey(input.fileName);
  await saveBuffer(input.userId, storageKey, input.buffer);

  const created = await prisma.document.create({
    data: {
      userId: input.userId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      category: input.category ?? null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      storageKey,
      externalEditKey: randomUUID(),
    },
  });
  return toDocumentDTO(created);
}

export async function listDocuments(
  userId: string,
  filter?: { ownerType?: DocumentOwnerType; ownerId?: string },
) {
  const where: Prisma.DocumentWhereInput = { userId };
  if (filter?.ownerType) where.ownerType = filter.ownerType;
  if (filter?.ownerId) where.ownerId = filter.ownerId;
  const rows = await prisma.document.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDocumentDTO);
}

async function loadOwnedDocument(userId: string, id: string): Promise<Document> {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new NotFoundError('Document not found');
  if (doc.userId !== userId) throw new ForbiddenError();
  return doc;
}

export async function getDocument(userId: string, id: string) {
  const doc = await loadOwnedDocument(userId, id);
  return toDocumentDTO(doc);
}

export async function getDocumentForDownload(userId: string, id: string) {
  return loadOwnedDocument(userId, id);
}

export async function updateDocumentMeta(
  userId: string,
  id: string,
  patch: { fileName?: string; category?: string | null },
) {
  await loadOwnedDocument(userId, id);
  const data: Prisma.DocumentUpdateInput = {};
  if (patch.fileName !== undefined) data.fileName = patch.fileName.trim().slice(0, 200);
  if (patch.category !== undefined) data.category = patch.category;
  const updated = await prisma.document.update({ where: { id }, data });
  return toDocumentDTO(updated);
}

export async function replaceDocumentBytes(
  userId: string,
  id: string,
  buffer: Buffer,
  mimeType?: string,
) {
  const doc = await loadOwnedDocument(userId, id);
  // Overwrite same storageKey so we don't leak a stale file
  await saveBuffer(userId, doc.storageKey, buffer);
  const sz = await fileSize(userId, doc.storageKey);
  const updated = await prisma.document.update({
    where: { id },
    data: {
      sizeBytes: sz,
      mimeType: mimeType ?? doc.mimeType,
      externalEditKey: randomUUID(), // invalidate OnlyOffice cache
    },
  });
  return toDocumentDTO(updated);
}

export async function deleteDocument(userId: string, id: string): Promise<void> {
  const doc = await loadOwnedDocument(userId, id);
  await prisma.document.delete({ where: { id } });
  await deleteFile(userId, doc.storageKey);
}

/**
 * Every document a person holds, across every owner type.
 *
 * `listDocuments` has always supported this — both filters are optional — but
 * nothing ever called it unfiltered, so the vault was only ever reachable one
 * record at a time. For anyone assembling a year's paperwork that is the wrong
 * shape: they want the client's documents, not this rental agreement.
 */
export async function listAllDocuments(
  userId: string,
  filter?: { from?: Date; to?: Date },
) {
  const where: Prisma.DocumentWhereInput = { userId };
  if (filter?.from || filter?.to) {
    where.createdAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }
  const rows = await prisma.document.findMany({ where, orderBy: { createdAt: 'desc' } });
  return rows.map(toDocumentDTO);
}

/**
 * Bundle the named documents into a zip.
 *
 * Every id is re-checked against `userId` rather than trusted from the
 * request: a caller could otherwise mix one id of their own with somebody
 * else's and receive both. Ids that do not belong are silently absent rather
 * than reported, so this cannot be used to probe which document ids exist.
 *
 * File names are made unique by prefixing the row id, because two rental
 * agreements called "agreement.pdf" would otherwise overwrite each other
 * inside the archive and the zip would quietly contain less than it claims.
 */
export async function zipDocuments(userId: string, ids: string[]): Promise<Buffer> {
  const rows = await prisma.document.findMany({
    where: { userId, id: { in: ids } },
    orderBy: { createdAt: 'asc' },
  });

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const doc of rows) {
    const bytes = await readBuffer(userId, doc.storageKey);
    zip.file(`${doc.id.slice(-6)}-${doc.fileName}`, bytes);
  }

  // A manifest, because a zip of opaque files is hard to reconcile against
  // anything. It also records what was asked for but could not be included.
  const missing = ids.filter((id) => !rows.some((r) => r.id === id));
  const manifest = [
    `Documents exported ${new Date().toISOString()}`,
    `Included: ${rows.length}`,
    ...rows.map((r) => `  ${r.id.slice(-6)}-${r.fileName}  (${r.ownerType}, ${r.sizeBytes} bytes)`),
    ...(missing.length > 0
      ? ['', `Not included: ${missing.length} document(s) not found or not accessible.`]
      : []),
  ].join('\n');
  zip.file('manifest.txt', manifest);

  return zip.generateAsync({ type: 'nodebuffer' });
}
