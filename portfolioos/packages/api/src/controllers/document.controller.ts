import type { Request, Response } from 'express';
import { z } from 'zod';
import { DocumentOwnerType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { Readable } from 'node:stream';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentForDownload,
  listDocuments,
  replaceDocumentBytes,
  updateDocumentMeta,
} from '../services/document.service.js';
import { readStream } from '../lib/documentStorage.js';
import { created, noContent, ok } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import {
  buildEditorConfig,
  convertToPdf,
  detectDocType,
  fileExtFromName,
  isSaveStatus,
  type CallbackPayload,
} from '../lib/onlyoffice.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const ownerTypeSchema = z.nativeEnum(DocumentOwnerType);

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

// ─── Upload + CRUD ───────────────────────────────────────────────

const uploadBodySchema = z.object({
  ownerType: ownerTypeSchema,
  ownerId: z.string().min(1),
  category: z.string().max(60).optional(),
});

export async function upload(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError('file required');
  const body = uploadBodySchema.parse(req.body);
  const doc = await createDocument({
    userId: userId(req),
    ownerType: body.ownerType,
    ownerId: body.ownerId,
    category: body.category ?? null,
    fileName: req.file.originalname,
    mimeType: req.file.mimetype,
    buffer: req.file.buffer,
  });
  created(res, doc);
}

const listQuerySchema = z.object({
  ownerType: ownerTypeSchema.optional(),
  ownerId: z.string().optional(),
});

export async function list(req: Request, res: Response) {
  const q = listQuerySchema.parse(req.query);
  const docs = await listDocuments(userId(req), q);
  ok(res, docs);
}

export async function detail(req: Request, res: Response) {
  ok(res, await getDocument(userId(req), req.params.id!));
}

const updateSchema = z
  .object({
    fileName: z.string().min(1).max(200).optional(),
    category: z.string().max(60).nullable().optional(),
  })
  .partial();

export async function update(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  ok(res, await updateDocumentMeta(userId(req), req.params.id!, body));
}

export async function remove(req: Request, res: Response) {
  await deleteDocument(userId(req), req.params.id!);
  noContent(res);
}

// ─── Authenticated download (browser) ────────────────────────────

export async function download(req: Request, res: Response) {
  const doc = await getDocumentForDownload(userId(req), req.params.id!);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(doc.sizeBytes));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
  );
  readStream(doc.userId, doc.storageKey).pipe(res);
}

// ─── OnlyOffice integration ──────────────────────────────────────
//
// The JWT-signed download URL lets DocumentServer fetch the file without
// needing our auth cookie/header. Short-lived. Single-use is impractical
// because DocServer may retry, so we accept any unexpired token.

interface DownloadTokenPayload {
  sub: 'oo-doc-download';
  documentId: string;
  userId: string;
}

interface CallbackTokenPayload {
  sub: 'oo-doc-callback';
  documentId: string;
  userId: string;
}

function signedDownloadToken(documentId: string, ownerUserId: string): string {
  const payload: DownloadTokenPayload = {
    sub: 'oo-doc-download',
    documentId,
    userId: ownerUserId,
  };
  return jwt.sign(payload, env.ONLYOFFICE_JWT_SECRET, {
    expiresIn: '24h',
    algorithm: 'HS256',
  });
}

function signedCallbackToken(documentId: string, ownerUserId: string): string {
  const payload: CallbackTokenPayload = {
    sub: 'oo-doc-callback',
    documentId,
    userId: ownerUserId,
  };
  return jwt.sign(payload, env.ONLYOFFICE_JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

export async function onlyofficeConfig(req: Request, res: Response) {
  const uid = userId(req);
  const doc = await getDocumentForDownload(uid, req.params.id!);
  const fileType = fileExtFromName(doc.fileName);
  if (!detectDocType(doc.fileName)) {
    throw new BadRequestError(
      `OnlyOffice does not support file type ".${fileType}". Use download instead.`,
    );
  }

  const downloadToken = signedDownloadToken(doc.id, uid);
  const callbackToken = signedCallbackToken(doc.id, uid);

  // DocumentServer fetches/saves over the network it can reach — for dev
  // (host.docker.internal) and prod (public API URL).
  const fileUrl = `${env.API_PUBLIC_URL_FOR_ONLYOFFICE}/api/documents/${doc.id}/oo-download?token=${downloadToken}`;
  const callbackUrl = `${env.API_PUBLIC_URL_FOR_ONLYOFFICE}/api/documents/${doc.id}/oo-callback?token=${callbackToken}`;

  const cfg = buildEditorConfig({
    documentId: doc.id,
    fileName: doc.fileName,
    fileType,
    externalEditKey: doc.externalEditKey,
    fileDownloadUrl: fileUrl,
    callbackUrl,
    userId: uid,
    userName: req.user?.email ?? 'User',
  });

  ok(res, {
    config: cfg,
    docServerUrl: env.ONLYOFFICE_PUBLIC_URL,
  });
}

// Token-authenticated download for OnlyOffice DocumentServer. The token
// embeds documentId + userId; we verify, then stream bytes.
export async function onlyofficeDownload(req: Request, res: Response) {
  const token = String(req.query.token ?? '');
  if (!token) throw new BadRequestError('token required');
  let payload: DownloadTokenPayload;
  try {
    payload = jwt.verify(token, env.ONLYOFFICE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as DownloadTokenPayload;
  } catch {
    throw new BadRequestError('invalid token');
  }
  if (payload.sub !== 'oo-doc-download' || payload.documentId !== req.params.id) {
    throw new BadRequestError('token mismatch');
  }
  const doc = await getDocumentForDownload(payload.userId, payload.documentId);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(doc.sizeBytes));
  readStream(doc.userId, doc.storageKey).pipe(res);
}

// OnlyOffice DocumentServer save callback. JWT in `Authorization: Bearer …`
// or `?token=` (we accept both). When status indicates the file is ready,
// we fetch the new bytes from the URL DocServer included in the body.
export async function onlyofficeCallback(req: Request, res: Response) {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const auth = req.headers.authorization;
  const headerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const incomingToken = queryToken ?? headerToken;
  if (!incomingToken) {
    return res.status(401).json({ error: 1, message: 'unauthorized' });
  }
  let payload: CallbackTokenPayload;
  try {
    payload = jwt.verify(incomingToken, env.ONLYOFFICE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as CallbackTokenPayload;
  } catch {
    return res.status(401).json({ error: 1, message: 'invalid token' });
  }
  if (payload.sub !== 'oo-doc-callback' || payload.documentId !== req.params.id) {
    return res.status(401).json({ error: 1, message: 'token mismatch' });
  }

  // OnlyOffice JWT-wraps the body when JWT_ENABLED=true
  let body = req.body as CallbackPayload;
  if (env.ONLYOFFICE_JWT_ENABLED === 'true' && body && typeof body === 'object') {
    const wrapped = (body as { token?: string }).token;
    if (wrapped) {
      try {
        const decoded = jwt.verify(wrapped, env.ONLYOFFICE_JWT_SECRET, {
          algorithms: ['HS256'],
        });
        body = (decoded as { payload?: CallbackPayload }).payload ?? (decoded as CallbackPayload);
      } catch (err) {
        logger.warn({ err }, '[oo] body token verification failed');
      }
    }
  }

  if (!body || typeof body.status !== 'number') {
    return res.json({ error: 0 });
  }

  if (isSaveStatus(body.status) && body.url) {
    try {
      const fetched = await fetch(body.url, { signal: AbortSignal.timeout(60_000) });
      if (!fetched.ok) {
        logger.warn(
          { documentId: payload.documentId, status: fetched.status },
          '[oo] failed to fetch saved file',
        );
        return res.json({ error: 1 });
      }
      const ab = await fetched.arrayBuffer();
      const buffer = Buffer.from(ab);
      await replaceDocumentBytes(payload.userId, payload.documentId, buffer);
    } catch (err) {
      logger.warn({ err }, '[oo] save processing failed');
      return res.json({ error: 1 });
    }
  }

  // OnlyOffice expects `{ error: 0 }` on success
  res.json({ error: 0 });
}

// ─── Convert to PDF via OnlyOffice ConvertService ───────────────
export async function convertDocToPdf(req: Request, res: Response) {
  const uid = userId(req);
  const doc = await getDocumentForDownload(uid, req.params.id!);
  const ext = fileExtFromName(doc.fileName);
  if (ext === 'pdf') throw new BadRequestError('Already a PDF');
  if (!detectDocType(doc.fileName)) throw new BadRequestError(`Cannot convert .${ext}`);

  // Build a signed download token so OnlyOffice can fetch the source file
  const downloadToken = signedDownloadToken(doc.id, uid);
  const fileUrl = `${env.API_PUBLIC_URL_FOR_ONLYOFFICE}/api/documents/${doc.id}/oo-download?token=${downloadToken}`;

  const pdfUrl = await convertToPdf({ fileUrl, fileType: ext, key: `${doc.externalEditKey}-topdf` });

  // Fetch converted PDF bytes from OnlyOffice
  const fetched = await fetch(pdfUrl, { signal: AbortSignal.timeout(60_000) });
  if (!fetched.ok) throw new BadRequestError('Failed to download converted PDF');
  const buffer = Buffer.from(await fetched.arrayBuffer());

  // Save as new Document (same owner, new fileName .pdf)
  const baseName = doc.fileName.replace(/\.[^.]+$/, '');
  const newDoc = await createDocument({
    userId: uid,
    ownerType: doc.ownerType,
    ownerId: doc.ownerId,
    fileName: `${baseName}.pdf`,
    mimeType: 'application/pdf',
    category: doc.category,
    buffer,
  });

  created(res, newDoc);
}

// Hint to TS that `Readable` is referenced (suppresses unused-import warn
// when fs streams are typed externally). Trivial guard — drop if linter
// stops flagging.
void Readable;
