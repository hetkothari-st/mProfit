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

import { randomUUID } from 'node:crypto';
import { Prisma, type Document, DocumentOwnerType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  buildStorageKey,
  saveBuffer,
  fileSize,
  deleteFile,
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
