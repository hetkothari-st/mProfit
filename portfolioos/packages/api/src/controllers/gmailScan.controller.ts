import type { Request, Response } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import type { GmailDocStatus } from '@prisma/client';
import { ok, created } from '../lib/response.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  createScanJob,
  listScanJobs,
  getScanJob,
  cancelScanJob,
  resumeScanJob,
} from '../services/gmailScanJobs.service.js';
import {
  listDiscoveredDocs,
  getDiscoveredDoc,
  listDistinctSenders,
} from '../services/gmailDiscoveredDocs.service.js';
import { approveDoc, rejectDoc } from '../services/gmailDocApproval.service.js';
import {
  listRules,
  upsertRule,
  deleteRule,
} from '../services/gmailAutoApproveRules.service.js';

const CreateScanSchema = z.object({
  lookbackFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lookbackTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function postScanJob(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = CreateScanSchema.parse(req.body);
  const mb = await prisma.mailboxAccount.findFirst({
    where: { userId: req.user.id, provider: 'GMAIL_OAUTH', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!mb) throw new BadRequestError('Connect Gmail before starting a scan');
  const job = await createScanJob({
    userId: req.user.id,
    mailboxId: mb.id,
    lookbackFrom: new Date(body.lookbackFrom),
    lookbackTo: new Date(body.lookbackTo),
  });
  created(res, job);
}

export async function listScans(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listScanJobs(req.user.id));
}

export async function getScan(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getScanJob(req.user.id, req.params.id!));
}

export async function postCancelScan(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await cancelScanJob(req.user.id, req.params.id!));
}

export async function postResumeScan(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await resumeScanJob(req.user.id, req.params.id!));
}

const ListDocsQuery = z.object({
  status: z.string().optional(),
  fromAddress: z.string().optional(),
  docType: z.string().optional(),
  scanJobId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function listDocs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = ListDocsQuery.parse(req.query);
  ok(
    res,
    await listDiscoveredDocs({
      userId: req.user.id,
      status: q.status as GmailDocStatus | undefined,
      fromAddress: q.fromAddress,
      docType: q.docType,
      scanJobId: q.scanJobId,
      cursor: q.cursor,
      limit: q.limit,
    }),
  );
}

export async function getDoc(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getDiscoveredDoc(req.user.id, req.params.id!));
}

export async function getDocPreviewUrl(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const doc = await getDiscoveredDoc(req.user.id, req.params.id!);
  // Frontend iframe loads /raw with the access token in cookie / Authorization
  // (when bearer-aware). For now this URL is auth-required and frontend
  // should fetch via authenticated client. JWT-signed unauth URLs deferred.
  const previewUrl = `/api/gmail/discovered-docs/${doc.id}/raw`;
  ok(res, { url: previewUrl, fileName: doc.fileName, mimeType: doc.mimeType });
}

export async function getDocRaw(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const doc = await getDiscoveredDoc(req.user.id, req.params.id!);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(doc.fileName)}"`,
  );
  fs.createReadStream(doc.storagePath).pipe(res);
}

export async function listSenders(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listDistinctSenders(req.user.id));
}

const ApproveBody = z
  .object({ createAutoApproveRule: z.boolean().optional() })
  .default({});
export async function postApproveDoc(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = ApproveBody.parse(req.body ?? {});
  ok(res, await approveDoc(req.user.id, req.params.id!, body));
}

const RejectBody = z
  .object({ reason: z.string().max(200).optional(), blocklist: z.boolean().optional() })
  .default({});
export async function postRejectDoc(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = RejectBody.parse(req.body ?? {});
  ok(res, await rejectDoc(req.user.id, req.params.id!, body));
}

const BulkApproveSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  createAutoApproveRule: z.boolean().optional(),
});
export async function postBulkApprove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = BulkApproveSchema.parse(req.body);
  const results = [];
  for (const id of body.ids) {
    try {
      results.push({ id, ok: true, doc: await approveDoc(req.user.id, id, body) });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  ok(res, results);
}

const BulkRejectSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  reason: z.string().max(200).optional(),
  blocklist: z.boolean().optional(),
});
export async function postBulkReject(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = BulkRejectSchema.parse(req.body);
  const results = [];
  for (const id of body.ids) {
    try {
      results.push({ id, ok: true, doc: await rejectDoc(req.user.id, id, body) });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  ok(res, results);
}

export async function listAutoApproveRules(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listRules(req.user.id));
}

const RuleSchema = z.object({
  fromAddress: z.string().min(3),
  docType: z.string().nullable().optional(),
  enabled: z.boolean(),
});
export async function postAutoApproveRule(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = RuleSchema.parse(req.body);
  ok(res, await upsertRule({ userId: req.user.id, ...body }));
}

export async function deleteAutoApproveRule(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteRule(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}
