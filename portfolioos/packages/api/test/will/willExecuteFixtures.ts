import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { newWillId, sealWillPayload } from '../../src/services/will/willStore.js';
import { generateWill } from '../../src/services/will/willGenerate.service.js';
import type { TestScope } from '../helpers/db.js';
import { TODAY, validWillPayload } from './willFixtures.js';

export const FAKE_PDF = Buffer.from('%PDF-1.7\n% will execute test\n%%EOF\n');
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
export const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);
export const GIF_BYTES = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);
export const HTML_BYTES = Buffer.from('<html><body><script>alert(1)</script></body></html>');

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * A GENERATED will holding validWillPayload(), generated on TODAY through Part 1's real generate path
 * (the PDF renderer is replaced by FAKE_PDF). Generating supersedes the user's earlier live will.
 */
export async function makeGeneratedWill(scope: TestScope): Promise<{ willId: string; versionId: string; version: number }> {
  const last = await runAsSystem(() =>
    prisma.will.findFirst({ where: { userId: scope.userId }, orderBy: { version: 'desc' }, select: { version: true } }),
  );
  const version = (last?.version ?? 0) + 1;
  const id = newWillId();
  const payload = await scope.runAs(() => sealWillPayload(scope.userId, id, validWillPayload()));
  await scope.runAs(() => prisma.will.create({ data: { id, userId: scope.userId, version, payload } }));
  const r = await scope.runAs(() =>
    generateWill(scope.userId, id, { revision: 0, acknowledge: true, generatedOn: TODAY }, { renderPdf: async () => FAKE_PDF, today: () => TODAY }),
  );
  return { willId: id, versionId: r.version.id, version };
}

/** Mark a will EXECUTED with the given dates (review tests that do not need a signed copy). */
export function markExecuted(willId: string, executedOn: string, nextReviewAt: string) {
  return runAsSystem(() =>
    prisma.will.update({
      where: { id: willId },
      data: { status: 'EXECUTED', executedAt: day(executedOn), nextReviewAt: day(nextReviewAt) },
    }),
  );
}

export function wipeWills(userId: string) {
  return runAsSystem(async () => {
    await prisma.alert.deleteMany({ where: { userId, type: 'WILL_REVIEW_DUE' } });
    await prisma.willVersion.deleteMany({ where: { userId } });
    await prisma.will.deleteMany({ where: { userId } });
  });
}
