import { createHash, randomUUID } from 'node:crypto';
import {
  hasWillBlockers, renderWillSummary, renderWillText, runWillRules, selectWillTemplate,
  WILL_PDF_FOOTER, WILL_RULESET_VERSION,
  type WillFinding, type WillGenerateResultWire, type WillPayload, type WillPreviewWire,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { AppError, BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sealForUser } from '../../lib/userKeys.js';
import { readBuffer } from '../../lib/documentStorage.js';
import { createDocument, deleteDocument } from '../document.service.js';
import { renderWillPdf, type WillPdfInput } from './willPdf.js';
import { loadDraft, requireWillKeys, revisionConflict, todayIst } from './willStore.js';
import { toVersionWire } from './will.service.js';

export interface WillGenerateDeps {
  renderPdf: (input: WillPdfInput) => Promise<Buffer>;
  today: () => string;
}

const defaultDeps: WillGenerateDeps = { renderPdf: renderWillPdf, today: todayIst };

/** JSON with sorted keys: the same will always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(v: string | Buffer): string {
  return createHash('sha256').update(v).digest('hex');
}

function assertNoBlockers(payload: WillPayload, today: string): WillFinding[] {
  const findings = runWillRules(payload, { today });
  if (hasWillBlockers(findings)) {
    throw new ValidationError('Fix the checks on the Review step first', {
      reason: 'WILL_BLOCKED',
      ruleIds: findings.filter((f) => f.severity === 'BLOCKER').map((f) => f.ruleId),
    });
  }
  return findings;
}

export async function previewWill(
  userId: string,
  willId: string,
  deps: Pick<WillGenerateDeps, 'today'> = defaultDeps,
): Promise<WillPreviewWire> {
  const today = deps.today();
  const { payload } = await loadDraft(userId, willId);
  assertNoBlockers(payload, today);
  const template = selectWillTemplate(payload);
  const ctx = { generatedOn: today };
  return {
    templateId: template.id,
    templateVersion: template.version,
    generatedOn: today,
    summary: renderWillSummary(payload, ctx),
    document: template.render(payload, ctx),
  };
}

export async function generateWill(
  userId: string,
  willId: string,
  input: { revision: number; acknowledge: boolean; generatedOn: string },
  deps: WillGenerateDeps = defaultDeps,
): Promise<WillGenerateResultWire> {
  if (input.acknowledge !== true) {
    throw new BadRequestError('Please confirm you have read the note about legal review', { field: 'acknowledge' });
  }
  requireWillKeys();
  const today = deps.today();
  // The user acknowledged a preview dated `generatedOn`; the PDF must carry
  // that same date, so a preview from before midnight IST is reloaded first.
  if (input.generatedOn !== today) {
    throw new ConflictError('Your preview is from an earlier day. Reload it before generating.', {
      reason: 'WILL_PREVIEW_OUTDATED',
    });
  }
  const { will, payload } = await loadDraft(userId, willId);
  if (will.revision !== input.revision) throw revisionConflict(will.revision);
  const findings = assertNoBlockers(payload, today);
  const template = selectWillTemplate(payload);
  const blocks = template.render(payload, { generatedOn: today });
  const canonical = canonicalJson(payload);
  const pdf = await deps.renderPdf({ blocks, generatedOn: today, footer: WILL_PDF_FOOTER });
  const versionId = randomUUID();
  const snapshotSealed = await sealForUser(userId, `willversion:${versionId}`, Buffer.from(canonical, 'utf8'));
  const doc = await createDocument({
    userId, ownerType: 'WILL', ownerId: will.id, fileName: `will-v${will.version}.pdf`,
    mimeType: 'application/pdf', category: 'will', buffer: pdf,
  });

  try {
    const version = await runInTransaction(async (tx) => {
      const claimed = await tx.will.updateMany({
        where: { id: will.id, userId, status: 'DRAFT', revision: will.revision },
        data: { status: 'GENERATED', generatedAt: new Date(), revision: { increment: 1 } },
      });
      if (claimed.count === 0) throw revisionConflict(will.revision + 1);
      await tx.will.updateMany({
        where: { userId, id: { not: will.id }, status: { in: ['GENERATED', 'EXECUTED'] } },
        data: { status: 'SUPERSEDED', supersededById: will.id },
      });
      return tx.willVersion.create({
        data: {
          id: versionId,
          willId: will.id,
          userId,
          versionNo: will.version,
          regime: template.regime,
          templateId: template.id,
          templateVersion: template.version,
          rulesetVersion: WILL_RULESET_VERSION,
          inputHash: sha256Hex(canonical),
          textHash: sha256Hex(renderWillText(blocks)),
          snapshotSealed,
          documentId: doc.id,
          pdfSha256: sha256Hex(pdf),
          findingsJson: findings.map((f) => ({ ruleId: f.ruleId, severity: f.severity })),
          generatedOn: new Date(`${today}T00:00:00Z`),
        },
      });
    });
    return { version: toVersionWire('GENERATED', version) };
  } catch (err) {
    // Leave no orphan PDF behind. The original error still decides the response.
    await deleteDocument(userId, doc.id, { allowWill: true }).catch((cleanupErr: unknown) => {
      logger.error(
        { documentId: doc.id, errName: cleanupErr instanceof Error ? cleanupErr.name : 'unknown' },
        'will.generate.document_cleanup_failed',
      );
    });
    throw err;
  }
}

export async function getWillVersionPdf(
  userId: string,
  versionId: string,
): Promise<{ fileName: string; buffer: Buffer; versionNo: number }> {
  const v = await prisma.willVersion.findFirst({ where: { id: versionId, userId } });
  if (!v) throw new NotFoundError('Will version not found');
  const doc = await prisma.document.findFirst({ where: { id: v.documentId, userId, ownerType: 'WILL' } });
  if (!doc) throw new NotFoundError('The PDF for this version is no longer stored');
  const buffer = await readBuffer(userId, doc.storageKey);
  if (sha256Hex(buffer) !== v.pdfSha256) {
    throw new AppError('The stored will PDF failed its integrity check', 500, 'WILL_PDF_INTEGRITY');
  }
  return { fileName: `will-v${v.versionNo}.pdf`, buffer, versionNo: v.versionNo };
}
