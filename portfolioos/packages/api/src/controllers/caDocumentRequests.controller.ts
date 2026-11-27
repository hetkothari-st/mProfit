import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../lib/response.js';
import { BadRequestError } from '../lib/errors.js';
import { decryptIfNeeded } from '../lib/decryptIfNeeded.js';
import { storedMimeFor } from '../lib/documentMime.js';
import {
  answerNotApplicable,
  answerWithUpload,
  closeRequest,
  listClientRequests,
  listMyDocumentRequests,
  requestDocument,
} from '../services/ca/caDocumentRequests.service.js';

const askBody = z.object({
  title: z.string().max(200),
  note: z.string().max(1000).nullable().optional(),
  financialYear: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// ─── The CA ────────────────────────────────────────────────────────────

export async function listClientRequestsHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listClientRequests(req.user!.id, String(req.params.clientId)));
}

export async function requestDocumentHandler(req: Request, res: Response): Promise<void> {
  created(res, await requestDocument(req.user!.id, String(req.params.clientId), askBody.parse(req.body), req));
}

export async function closeRequestHandler(req: Request, res: Response): Promise<void> {
  const { outcome } = z.object({ outcome: z.enum(['ACCEPTED', 'CANCELLED']) }).parse(req.body);
  await closeRequest(req.user!.id, String(req.params.clientId), String(req.params.id), outcome, req);
  noContent(res);
}

// ─── The account holder ────────────────────────────────────────────────

export async function listMyDocumentRequestsHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listMyDocumentRequests(req.user!.id));
}

/** Multipart `file`. Checked by its bytes, as the vault's own upload is. */
export async function answerWithUploadHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new BadRequestError('file required');
  const probe = await decryptIfNeeded(req.file.buffer, {
    fileName: req.file.originalname,
    allowedKinds: ['pdf', 'xlsx_ooxml', 'xlsx_encrypted', 'xls', 'csv', 'image', 'office_doc', 'other'],
  });
  if (!probe.ok && !probe.requiresPassword && probe.reason === 'junk_type') {
    throw new BadRequestError(probe.detail);
  }
  await answerWithUpload(req.user!.id, String(req.params.id), {
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    // From the bytes, never from req.file.mimetype (see lib/documentMime.ts).
    mimeType: storedMimeFor(probe.kind, probe.mime),
  });
  noContent(res);
}

export async function answerNotApplicableHandler(req: Request, res: Response): Promise<void> {
  const { reason } = z.object({ reason: z.string().max(1000) }).parse(req.body);
  await answerNotApplicable(req.user!.id, String(req.params.id), reason);
  noContent(res);
}
