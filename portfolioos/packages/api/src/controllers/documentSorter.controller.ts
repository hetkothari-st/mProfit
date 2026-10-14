import type { Request, Response } from 'express';
import { z } from 'zod';
import { DOC_TYPES } from '@everypaisa/shared';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import { created, ok } from '../lib/response.js';
import { acceptUploads, submitPassword } from '../services/docSorter/sorter.service.js';
import { buildFolderZip, createPerson, getTree, mergePeople, renamePerson, updateFile } from '../services/docSorter/sorterEdit.service.js';
import { isRealIsoDate } from '../services/docSorter/naming.js';

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

const docTypeSchema = z.enum(DOC_TYPES);

const patchFileSchema = z
  .object({
    personId: z.string().min(1).optional(),
    docType: docTypeSchema.optional(),
    docDate: z.string().refine(isRealIsoDate, 'Use a real date as YYYY-MM-DD').optional(),
  })
  .strict();

export async function upload(req: Request, res: Response) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new BadRequestError('Choose at least one file');
  const acks = await acceptUploads(
    userId(req),
    files.map((f) => ({ originalName: f.originalname, buffer: f.buffer })),
  );
  ok(res, acks);
}

export async function tree(req: Request, res: Response) {
  ok(res, await getTree(userId(req)));
}

export async function patchFile(req: Request, res: Response) {
  const patch = patchFileSchema.parse(req.body);
  ok(res, await updateFile(userId(req), req.params.id!, patch));
}

export async function submitFilePassword(req: Request, res: Response) {
  const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
  await submitPassword(userId(req), req.params.id!, password);
  res.status(202).json({ success: true, data: { accepted: true } });
}

export async function addPerson(req: Request, res: Response) {
  const { displayName } = z.object({ displayName: z.string().trim().min(1).max(80) }).parse(req.body);
  created(res, await createPerson(userId(req), displayName));
}

export async function patchPerson(req: Request, res: Response) {
  const { displayName } = z.object({ displayName: z.string().trim().min(1).max(80) }).parse(req.body);
  ok(res, await renamePerson(userId(req), req.params.id!, displayName));
}

export async function merge(req: Request, res: Response) {
  const { fromId, intoId } = z.object({ fromId: z.string().min(1), intoId: z.string().min(1) }).parse(req.body);
  await mergePeople(userId(req), fromId, intoId);
  ok(res, { merged: true });
}

export async function folderZip(req: Request, res: Response) {
  const q = z
    .object({ personId: z.string().min(1).optional(), docType: docTypeSchema.optional() })
    .parse(req.query);
  if (q.docType && !q.personId) throw new BadRequestError('docType needs a personId');
  const { buffer, stem } = await buildFolderZip(userId(req), q);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${stem}-documents.zip"`);
  res.send(buffer);
}
