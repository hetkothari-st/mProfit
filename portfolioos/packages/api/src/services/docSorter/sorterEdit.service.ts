import type { Document } from '@prisma/client';
import type { SorterFileDTO, SorterPersonDTO, SorterTreeDTO, SortDocType } from '@everypaisa/shared';
import { DOC_TYPE_LABEL } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsUser } from '../../lib/requestContext.js';
import { readBuffer } from '../../lib/documentStorage.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { nameKey } from './personMatch.js';
import { buildSortedName, safeExt, uniqueName } from './naming.js';
import { sanitizePersonName } from './rules.js';

/** Reading and hand-editing the sorted vault: tree, move/re-type a file, rename/merge people, zip a folder. */

const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

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
  /** YYYY-MM-DD */
  docDate?: string;
}

export function updateFile(userId: string, id: string, patch: FilePatch): Promise<SorterFileDTO> {
  return runAsUser(userId, () =>
    runInTransaction(async (tx) => {
      const doc = await tx.document.findFirst({ where: { id, userId, ownerType: 'PERSON_DOCS' } });
      if (!doc) throw new NotFoundError('Document not found');
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

export function renamePerson(userId: string, id: string, displayName: string): Promise<SorterPersonDTO> {
  const clean = sanitizePersonName(displayName);
  if (!clean) throw new BadRequestError('Enter a name using letters only', { field: 'displayName' });
  return runAsUser(userId, async () => {
    const person = await prisma.documentPerson.findFirst({ where: { id, userId }, select: { id: true } });
    if (!person) throw new NotFoundError('Person not found');
    const key = nameKey(clean);
    const clash = await prisma.documentPerson.findFirst({ where: { userId, nameKey: key, id: { not: id } }, select: { id: true } });
    if (clash) throw new ConflictError('A folder with that name already exists. Merge the two folders instead.');
    const updated = await prisma.documentPerson.update({
      where: { id },
      data: { displayName: clean, nameKey: key, autoCreated: false },
    });
    return toPersonDTO(updated);
  });
}

export function mergePeople(userId: string, fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) throw new BadRequestError('Pick two different folders to merge');
  return runAsUser(userId, () =>
    runInTransaction(async (tx) => {
      const found = await tx.documentPerson.findMany({ where: { userId, id: { in: [fromId, intoId] } }, select: { id: true } });
      if (found.length !== 2) throw new NotFoundError('Person not found');
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
      await tx.documentPerson.delete({ where: { id: fromId } });
    }),
  );
}

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
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const d of docs) {
      const folder = `${d.person?.displayName ?? 'Unassigned'}/${d.docType ? DOC_TYPE_LABEL[d.docType] : 'Other'}`;
      zip.file(`${folder}/${d.fileName}`, await readBuffer(userId, d.storageKey));
    }
    const stem = (filter.personId ? (docs[0]?.person?.displayName ?? 'documents') : 'all-documents')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return { buffer: await zip.generateAsync({ type: 'nodebuffer' }), stem: stem || 'documents' };
  });
}
