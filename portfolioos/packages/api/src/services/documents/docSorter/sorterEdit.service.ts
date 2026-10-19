import { Prisma, type Document } from '@prisma/client';
import type { SorterFileDTO, SorterPersonDTO, SorterTreeDTO, SortDocType } from '@everypaisa/shared';
import { DOC_TYPE_LABEL } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../../lib/prisma.js';
import { runAsUser } from '../../../lib/requestContext.js';
import { readBuffer } from '../../../lib/documentStorage.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../../lib/errors.js';
import { nameKey } from './personMatch.js';
import { buildSortedName, isRealIsoDate, safeExt, uniqueName } from './naming.js';
import { sanitizePersonName } from './rules.js';

/** Reading and hand-editing the sorted vault: tree, move/re-type a file, people, zip a folder. */

/** Largest total a single zip may hold (it is built in memory). */
export const MAX_ZIP_BYTES = 300 * 1024 * 1024;

const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const isUniqueViolation = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Same per-user lock the worker takes before it files, so hand edits and workers never choose the same name. */
function lockFiling(tx: Prisma.TransactionClient, userId: string) {
  return tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`docsort:${userId}`}))`);
}

export function toFileDTO(d: Document): SorterFileDTO {
  return {
    id: d.id,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    docType: d.docType,
    docDate: isoDate(d.docDate),
    sortStatus: d.sortStatus ?? 'FILED',
    sortReason: d.sortReason,
    personId: d.personId,
    createdAt: d.createdAt.toISOString(),
  };
}

const toPersonDTO = (p: { id: string; displayName: string; autoCreated: boolean; linkedUserId: string | null }): SorterPersonDTO => ({
  id: p.id,
  displayName: p.displayName,
  autoCreated: p.autoCreated,
  linkedUserId: p.linkedUserId,
});

export function getTree(userId: string): Promise<SorterTreeDTO> {
  return runAsUser(userId, async () => {
    const [people, docs] = await Promise.all([
      prisma.documentPerson.findMany({ where: { userId }, orderBy: { displayName: 'asc' } }),
      prisma.document.findMany({ where: { userId, ownerType: 'PERSON_DOCS' }, orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }] }),
    ]);
    const filed = docs.filter((d) => d.sortStatus === 'FILED' && d.personId && d.docType);
    return {
      people: people.map((p) => {
        const mine = filed.filter((d) => d.personId === p.id);
        const types = [...new Set(mine.map((d) => d.docType as SortDocType))].sort();
        return {
          ...toPersonDTO(p),
          types: types.map((docType) => ({ docType, files: mine.filter((d) => d.docType === docType).map(toFileDTO) })),
        };
      }),
      unassigned: docs.filter((d) => !filed.includes(d)).map(toFileDTO),
    };
  });
}

export interface FilePatch {
  personId?: string;
  docType?: SortDocType;
  /** YYYY-MM-DD, a real calendar date */
  docDate?: string;
}

export function updateFile(userId: string, id: string, patch: FilePatch): Promise<SorterFileDTO> {
  if (patch.docDate !== undefined && !isRealIsoDate(patch.docDate)) {
    throw new BadRequestError('That is not a real date', { field: 'docDate' });
  }
  return runAsUser(userId, () =>
    runInTransaction(async (tx) => {
      await lockFiling(tx, userId);
      const doc = await tx.document.findFirst({ where: { id, userId, ownerType: 'PERSON_DOCS' } });
      if (!doc) throw new NotFoundError('Document not found');
      // The worker owns a document while it is being read; moving it now would be overwritten.
      if (doc.sortStatus === 'PROCESSING') throw new ConflictError('This document is still being read. Try again in a moment.');
      if (patch.personId) {
        const person = await tx.documentPerson.findFirst({ where: { id: patch.personId, userId }, select: { id: true } });
        if (!person) throw new NotFoundError('Person not found');
      }
      const personId = patch.personId ?? doc.personId;
      const docType = patch.docType ?? doc.docType;
      const docDate = patch.docDate !== undefined ? new Date(`${patch.docDate}T00:00:00Z`) : doc.docDate;

      let fileName = doc.fileName;
      let status = doc.sortStatus;
      let reason = doc.sortReason;
      if (personId && docType) {
        const siblings = await tx.document.findMany({
          where: { userId, personId, docType, id: { not: id } },
          select: { fileName: true },
        });
        fileName = uniqueName(
          buildSortedName(docType, isoDate(docDate), doc.createdAt, safeExt(doc.fileName)),
          new Set(siblings.map((s) => s.fileName)),
        );
        status = 'FILED';
        reason = null;
      }
      const updated = await tx.document.update({
        where: { id },
        data: { personId, docType, docDate, fileName, sortStatus: status, sortReason: reason },
      });
      return toFileDTO(updated);
    }),
  );
}

const NAME_ERROR = 'Enter a name using letters only';

/** A folder made by hand: for documents that carry no readable name, and so could never be filed otherwise. */
export function createPerson(userId: string, displayName: string): Promise<SorterPersonDTO> {
  const clean = sanitizePersonName(displayName);
  if (!clean) throw new BadRequestError(NAME_ERROR, { field: 'displayName' });
  const key = nameKey(clean);
  return runAsUser(userId, () =>
    runInTransaction(async (tx) => {
      await lockFiling(tx, userId);
      const existing = (await tx.documentPerson.findMany({ where: { userId } })).find((p) => p.nameKey === key || p.aliasKeys.includes(key));
      if (existing) return toPersonDTO(existing);
      const created = await tx.documentPerson.create({ data: { userId, displayName: clean, nameKey: key, autoCreated: false } });
      return toPersonDTO(created);
    }),
  );
}

export function renamePerson(userId: string, id: string, displayName: string): Promise<SorterPersonDTO> {
  const clean = sanitizePersonName(displayName);
  if (!clean) throw new BadRequestError(NAME_ERROR, { field: 'displayName' });
  const key = nameKey(clean);
  return runAsUser(userId, () =>
    runInTransaction(async (tx) => {
      await lockFiling(tx, userId);
      const person = await tx.documentPerson.findFirst({ where: { id, userId } });
      if (!person) throw new NotFoundError('Person not found');
      const clash = await tx.documentPerson.findFirst({ where: { userId, id: { not: id }, OR: [{ nameKey: key }, { aliasKeys: { has: key } }] }, select: { id: true } });
      if (clash) throw new ConflictError('A folder with that name already exists. Merge the two folders instead.');
      // The name it had stays an alias, so a document that still carries it files here.
      const aliasKeys = [...new Set([...person.aliasKeys, person.nameKey])].filter((k) => k !== key);
      const updated = await tx.documentPerson.update({ where: { id }, data: { displayName: clean, nameKey: key, aliasKeys, autoCreated: false } });
      return toPersonDTO(updated);
    }).catch((err: unknown) => {
      if (isUniqueViolation(err)) throw new ConflictError('A folder with that name already exists. Merge the two folders instead.');
      throw err;
    }),
  );
}

export function mergePeople(userId: string, fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) throw new BadRequestError('Pick two different folders to merge');
  return runAsUser(userId, () =>
    runInTransaction(async (tx) => {
      await lockFiling(tx, userId);
      const found = await tx.documentPerson.findMany({ where: { userId, id: { in: [fromId, intoId] } } });
      const from = found.find((p) => p.id === fromId);
      const into = found.find((p) => p.id === intoId);
      if (!from || !into) throw new NotFoundError('Person not found');
      const moving = await tx.document.findMany({ where: { userId, personId: fromId }, orderBy: { createdAt: 'asc' } });
      for (const doc of moving) {
        let fileName = doc.fileName;
        if (doc.docType) {
          const siblings = await tx.document.findMany({
            where: { userId, personId: intoId, docType: doc.docType },
            select: { fileName: true },
          });
          fileName = uniqueName(doc.fileName, new Set(siblings.map((s) => s.fileName)));
        }
        await tx.document.update({ where: { id: doc.id }, data: { personId: intoId, fileName } });
      }
      // The merged-away names keep routing here, so a misspelling that was merged does not come back.
      const aliasKeys = [...new Set([...into.aliasKeys, from.nameKey, ...from.aliasKeys])].filter((k) => k !== into.nameKey);
      await tx.documentPerson.update({ where: { id: intoId }, data: { aliasKeys, panLast4: into.panLast4 ?? from.panLast4 } });
      await tx.documentPerson.delete({ where: { id: fromId } });
    }),
  );
}

/** A zip entry segment that every OS can extract: no reserved characters, no trailing dots or spaces. */
const zipSegment = (name: string, fallback: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '-').replace(/[. ]+$/, '').trim() || fallback;

/**
 * A zip that mirrors the folder tree: `Person/Type label/<file>`. With no
 * filter it is everything filed; with personId (and optionally docType) just
 * that folder.
 */
export function buildFolderZip(
  userId: string,
  filter: { personId?: string; docType?: SortDocType },
): Promise<{ buffer: Buffer; stem: string }> {
  return runAsUser(userId, async () => {
    const docs = await prisma.document.findMany({
      where: {
        userId,
        ownerType: 'PERSON_DOCS',
        sortStatus: 'FILED',
        personId: filter.personId ?? { not: null },
        ...(filter.docType && { docType: filter.docType }),
      },
      include: { person: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (docs.length === 0) throw new NotFoundError('There are no files in that folder');
    // The zip is built in memory: refuse before reading any file rather than after.
    if (docs.reduce((n, d) => n + d.sizeBytes, 0) > MAX_ZIP_BYTES) {
      throw new BadRequestError('That is too much to zip in one go. Download one person or one type at a time.');
    }
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const taken = new Map<string, Set<string>>(); // folder → names used, so two files never share an entry
    for (const d of docs) {
      const folder = `${zipSegment(d.person?.displayName ?? '', 'Unassigned')}/${zipSegment(d.docType ? DOC_TYPE_LABEL[d.docType] : '', 'Other')}`;
      const used = taken.get(folder) ?? new Set<string>();
      taken.set(folder, used);
      const name = uniqueName(d.fileName, used);
      used.add(name);
      zip.file(`${folder}/${name}`, await readBuffer(userId, d.storageKey));
    }
    const stem = (filter.personId ? (docs[0]?.person?.displayName ?? 'documents') : 'all-documents')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return { buffer: await zip.generateAsync({ type: 'nodebuffer' }), stem: stem || 'documents' };
  });
}

