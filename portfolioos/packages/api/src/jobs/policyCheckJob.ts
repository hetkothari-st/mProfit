/**
 * Bull worker for the Policy Health Check pipeline.
 *
 * Two phases:
 *  'extraction' — text extraction + OCR for all documents associated with
 *                  the check. Transitions status from EXTRACTING → EXTRACTED.
 *  'analysis'   — full analysis (rules → score → verdict). Transitions
 *                  status from VERIFIED/EXTRACTED → ANALYZING → COMPLETED | PARTIAL.
 *
 * Rate-limit: USER_REFRESH trigger is limited to once per COOLDOWN_MS per check.
 *
 * Shape of each job body:
 *  1. Read all inputs (no DB transaction held during compute).
 *  2. Perform the work.
 *  3. Commit via runInTransaction.
 */

import { logger } from '../lib/logger.js';
import { runAsUser } from '../lib/requestContext.js';
import { getPolicyCheckQueue, type PolicyCheckJobPayload } from '../lib/queue.js';
import { processTextExtractionJob } from '../services/policyCheck/textExtraction.service.js';
import { runPolicyAnalysis } from '../services/policyCheck/analysisEngine.service.js';
import { enqueuePolicyProse } from './policyCheckProseJob.js';
import { TooManyRequestsError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

const USER_REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function checkRateLimit(checkId: string, userId: string): Promise<void> {
  // Cooldown applies to RE-analysis only: a check that already completed
  // within the window AND whose extraction has not been edited since. The
  // first analysis (and any run after the user corrected a field) is never
  // throttled.
  const since = new Date(Date.now() - USER_REFRESH_COOLDOWN_MS);
  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId, completedAt: { gte: since } },
    select: { completedAt: true },
  });
  if (!check?.completedAt) return;

  const data = await prisma.extractedPolicyData.findUnique({
    where: { checkId },
    select: { verifiedAt: true },
  });
  const editedAfter = data?.verifiedAt && data.verifiedAt > check.completedAt;
  if (editedAfter) return;

  const elapsed = Date.now() - check.completedAt.getTime();
  throw new TooManyRequestsError(
    `Analysis completed ${Math.round(elapsed / 60000)} minutes ago and nothing has changed. ` +
      `Wait ${Math.ceil((USER_REFRESH_COOLDOWN_MS - elapsed) / 60000)} more minute(s) or edit the extracted data.`,
  );
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function startPolicyCheckJobWorker(): void {
  if (env.ENABLE_POLICY_CHECK_JOB === 'false') {
    logger.info('[policyCheckJob] ENABLE_POLICY_CHECK_JOB=false — worker not started');
    return;
  }

  const queue = getPolicyCheckQueue();

  queue.process(async (job) => {
    const { checkId, userId, phase } = job.data as PolicyCheckJobPayload;

    logger.info({ checkId, userId, phase }, '[policyCheckJob] starting');

    await runAsUser(userId, async () => {
      if (phase === 'extraction') {
        await processTextExtractionJob({ checkId, userId });
      } else if (phase === 'analysis') {
        await checkRateLimit(checkId, userId);
        const result = await runPolicyAnalysis(checkId, userId);
        logger.info(
          { checkId, userId, status: result.status, findings: result.findings.length },
          '[policyCheckJob] analysis complete',
        );
        // Enqueue prose AFTER the commit — mirrors mfAnalysisEngine pattern
        try {
          enqueuePolicyProse(userId, checkId);
        } catch (err) {
          logger.error({ err, checkId }, '[policyCheckJob] failed to enqueue prose');
        }
      } else {
        logger.warn({ checkId, phase }, '[policyCheckJob] unknown phase');
      }
    });

    logger.info({ checkId, userId, phase }, '[policyCheckJob] complete');
  });

  logger.info('[policyCheckJob] worker started');
}
