/**
 * The client's acknowledgement of how the app uses AI in advice (SEBI IA
 * Regulations 15(14) and 18(9)). The text and its version live in
 * @everypaisa/shared; an acknowledgement is an AuditLog row naming the version,
 * so a new version asks everyone again and the record is kept with the rest of
 * the audit trail.
 */
import type { Request } from 'express';
import { AI_USE_DISCLOSURE } from '@everypaisa/shared';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { BadRequestError } from '../lib/errors.js';

const ACTION = 'ai_disclosure_acknowledged';
const resourceFor = (version: string) => `AiDisclosure:${version}`;

export interface AiDisclosureStatus {
  version: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

export async function aiDisclosureStatus(userId: string): Promise<AiDisclosureStatus> {
  const { version } = AI_USE_DISCLOSURE;
  const row = await runAsSystem(() =>
    prisma.auditLog.findFirst({
      where: { userId, action: ACTION, resource: resourceFor(version) },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  );
  return { version, acknowledged: row !== null, acknowledgedAt: row?.createdAt.toISOString() ?? null };
}

/**
 * Not best-effort like writeAuditLog: the chat gate reads this row back, so a
 * lost write would lock the client out. A failure is thrown to the caller.
 */
export async function acknowledgeAiDisclosure(userId: string, version: string, req?: Request): Promise<void> {
  if (version !== AI_USE_DISCLOSURE.version) {
    throw new BadRequestError('Please accept the current version of the AI-use notice.');
  }
  await runAsSystem(() =>
    prisma.auditLog.create({
      data: {
        userId,
        action: ACTION,
        resource: resourceFor(version),
        ip: req?.ip ?? null,
        userAgent: req?.header('user-agent') ?? null,
        metadata: { version },
      },
    }),
  );
}
