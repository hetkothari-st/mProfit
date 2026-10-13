import type { Request, Response } from 'express';
import { z } from 'zod';
import { isWillSection, WILL_RULESET_VERSION } from '@everypaisa/shared';
import { generateWill, getWillVersionPdf, previewWill } from '../services/will/willGenerate.service.js';
import { BadRequestError, UnauthorizedError, ValidationError } from '../lib/errors.js';
import { created, noContent, ok } from '../lib/response.js';
import { writeAuditLog } from '../lib/audit.js';
import { downloadHeaders } from '../lib/documentMime.js';
import { getSignedCopy, getWillExecution, recordWillExecution } from '../services/will/willExecute.service.js';
import { zodIssues } from '../services/will/willStore.js';
import {
  createWillDraft, discardWillDraft, getWillDraft, getWillOverview, listWillPeopleSuggestions,
  refreshWillEstate, saveWillSection,
} from '../services/will/will.service.js';

export function uid(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export function parseOr422<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new ValidationError('Some will details are not valid', { issues: zodIssues(r.error) });
  return r.data;
}

const id = z.string().min(1).max(64);
export function idOf(req: Request, name: string): string {
  return parseOr422(id, req.params[name]);
}

const createBody = z.object({ fromWillId: z.string().min(1).max(64).optional() });
const saveBody = z.object({ revision: z.number().int().min(0), currentStep: z.number().int().min(2).max(8), data: z.unknown() });
const revisionBody = z.object({ revision: z.number().int().min(0) });

export async function overview(req: Request, res: Response): Promise<void> {
  ok(res, await getWillOverview(uid(req)));
}

export async function createDraft(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const body = parseOr422(createBody, req.body ?? {});
  const draft = await createWillDraft(userId, body.fromWillId ?? null);
  await writeAuditLog({
    userId, action: 'will_created', resource: `Will:${draft.id}`,
    metadata: { version: draft.version, cloned: Boolean(body.fromWillId) }, req,
  });
  created(res, draft);
}

export async function getDraft(req: Request, res: Response): Promise<void> {
  ok(res, await getWillDraft(uid(req), idOf(req, 'id')));
}

export async function saveSection(req: Request, res: Response): Promise<void> {
  const section = String(req.params['section'] ?? '');
  if (!isWillSection(section)) throw new BadRequestError('Unknown will section', { field: 'section' });
  const body = parseOr422(saveBody, req.body);
  ok(res, await saveWillSection(uid(req), idOf(req, 'id'), section, { revision: body.revision, currentStep: body.currentStep, data: body.data }));
}

export async function refreshEstate(req: Request, res: Response): Promise<void> {
  const body = parseOr422(revisionBody, req.body);
  ok(res, await refreshWillEstate(uid(req), idOf(req, 'id'), body.revision));
}

export async function discardDraft(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  await discardWillDraft(userId, willId);
  await writeAuditLog({ userId, action: 'will_discarded', resource: `Will:${willId}`, req });
  noContent(res);
}

export async function suggestions(req: Request, res: Response): Promise<void> {
  ok(res, { suggestions: await listWillPeopleSuggestions(uid(req)) });
}

const generateBody = z.object({
  revision: z.number().int().min(0),
  acknowledge: z.boolean(),
  /** The date shown on the preview the user acknowledged (YYYY-MM-DD). */
  generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function preview(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const result = await previewWill(userId, willId);
  await writeAuditLog({ userId, action: 'will_viewed', resource: `Will:${willId}`, req });
  ok(res, result);
}

export async function generate(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const body = parseOr422(generateBody, req.body);
  const result = await generateWill(userId, willId, body);
  await writeAuditLog({
    userId, action: 'will_generated', resource: `Will:${willId}`, req,
    metadata: {
      versionId: result.version.id, versionNo: result.version.versionNo, templateId: result.version.templateId,
      templateVersion: result.version.templateVersion, rulesetVersion: WILL_RULESET_VERSION, acknowledged: true,
    },
  });
  created(res, result);
}

export async function downloadPdf(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const versionId = idOf(req, 'vid');
  const file = await getWillVersionPdf(userId, versionId);
  await writeAuditLog({ userId, action: 'will_downloaded', resource: `WillVersion:${versionId}`, metadata: { versionNo: file.versionNo }, req });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
}

function formField(body: unknown, name: string): unknown {
  return body !== null && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined;
}

export async function getExecution(req: Request, res: Response): Promise<void> {
  ok(res, await getWillExecution(uid(req), idOf(req, 'id')));
}

export async function recordExecution(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const fields = {
    executedOn: formField(req.body, 'executedOn'),
    witnesses: [formField(req.body, 'witness1'), formField(req.body, 'witness2')],
  };
  const result = await recordWillExecution(userId, willId, { fields, file: req.file ? { buffer: req.file.buffer } : null });
  await writeAuditLog({
    userId, action: 'will_execute_upload', resource: `Will:${willId}`, req,
    metadata: {
      versionNo: result.execution.version,
      newCopy: result.newCopy,
      replacedCopy: result.replacedCopy,
      mimeType: result.execution.signedCopy?.mimeType ?? null,
      sizeBytes: result.execution.signedCopy?.sizeBytes ?? null,
      warnings: result.execution.warnings,
    },
  });
  ok(res, result.execution);
}

export async function downloadSignedCopy(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const file = await getSignedCopy(userId, willId);
  await writeAuditLog({
    userId, action: 'will_downloaded', resource: `Will:${willId}`, metadata: { kind: 'signed_copy', versionNo: file.versionNo }, req,
  });
  res.set(downloadHeaders(file.mimeType, file.fileName));
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
}
