/**
 * pfFetchWorker.ts
 *
 * Bull worker for server-headless EPFO passbook fetch.
 * Queue name: 'pf-headless-fetch'
 *
 * Job flow:
 *   1. Load ProvidentFundAccount from DB
 *   2. Resolve credentials (override → stored blob → none)
 *   3. Decrypt identifier
 *   4. Build ScrapeContext and run the PF adapter chain
 *   5. On failure → write IngestionFailure + fail session
 *   6. On success → upsert CanonicalEvents, recompute holdings, complete session
 */

import Bull from 'bull';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { sseHub } from '../lib/sseHub.js';
import { runAsUser } from '../lib/requestContext.js';
import { decryptCredentialBlob, decryptIdentifier } from '../services/pfCredentials.service.js';
import { getPfAccountById } from '../services/pfAccounts.service.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import { startSession, transition, complete, fail } from '../services/pfFetchSessions.service.js';
import { buildCanonicalEvents } from '../services/pfCanonicalize.service.js';
import { runPfChain } from '../adapters/pf/chain.js';
import { recomputeForAsset } from '../services/holdingsProjection.js';
import { randomUUID } from 'node:crypto';
import type { ScrapeContext } from '../adapters/pf/types.js';
import type { PfFetchStatus } from '@prisma/client';

const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 min — Playwright scrape can be slow
const LOCK_DURATION_MS = 10 * 60 * 1000;

export interface PfFetchJobPayload {
  sessionId: string;
  accountId: string;
  userId: string;
  credentialOverride?: { username: string; password: string; mpin?: string };
}

let _pfFetchQueue: Bull.Queue<PfFetchJobPayload> | null = null;

export function getPfFetchQueue(): Bull.Queue<PfFetchJobPayload> {
  if (!_pfFetchQueue) {
    _pfFetchQueue = new Bull<PfFetchJobPayload>('pf-headless-fetch', env.REDIS_URL, {
      defaultJobOptions: {
        attempts: 1, // no automatic retry — each attempt needs fresh credentials/CAPTCHA
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
        timeout: JOB_TIMEOUT_MS,
      },
      settings: {
        lockDuration: LOCK_DURATION_MS,
        lockRenewTime: LOCK_DURATION_MS / 2,
        stalledInterval: 60_000,
        maxStalledCount: 1,
      },
    });

    _pfFetchQueue.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.id, sessionId: job?.data?.sessionId, err },
        '[pf-worker] job failed',
      );
    });
    _pfFetchQueue.on('completed', (job) => {
      logger.info(
        { jobId: job.id, sessionId: job.data.sessionId },
        '[pf-worker] job completed',
      );
    });
  }
  return _pfFetchQueue;
}

// Exported as `pfFetchQueue` for the controller to enqueue jobs
export const pfFetchQueue = {
  add: async (name: string, payload: PfFetchJobPayload) => {
    return getPfFetchQueue().add(name, payload);
  },
};

export function startPfFetchWorker(): void {
  if (process.env.ENABLE_PF_WORKER === 'false') {
    logger.info('[pf-worker] disabled via ENABLE_PF_WORKER=false');
    return;
  }

  const q = getPfFetchQueue();

  q.process(2, async (job) => {
    const { sessionId, accountId, userId, credentialOverride } = job.data;
    const t0 = Date.now();
    logger.info({ bullJobId: job.id, sessionId, accountId }, '[pf-worker] processing');

    await runAsUser(userId, async () => {
      try {
        // 1. Load account
        const account = await getPfAccountById(userId, accountId);
        if (!account) {
          await fail(sessionId, `PF account not found: ${accountId}`);
          return;
        }

        // 2. Resolve credentials
        let credentials: { username: string; password: string; mpin?: string } | undefined;
        if (credentialOverride) {
          credentials = credentialOverride;
        } else if (account.storedCredentials) {
          try {
            const blob = (account.storedCredentials as { blob: string }).blob;
            credentials = await decryptCredentialBlob(blob);
          } catch (e) {
            logger.warn({ accountId, err: e }, '[pf-worker] failed to decrypt stored credentials');
          }
        }

        // 3. Decrypt identifier
        const identifierPlain = await decryptIdentifier(
          account.identifierCipher.toString('base64'),
        );

        // 4. Build ScrapeContext
        const abortController = new AbortController();

        const ctx: ScrapeContext = {
          sessionId,
          account,
          credentials,
          abortSignal: abortController.signal,
          emit(status: PfFetchStatus, info?: Record<string, unknown>) {
            void transition(sessionId, status, info);
          },
          prompt: {
            async askCaptcha(imgBytes: Buffer): Promise<string> {
              const promptId = randomUUID();
              const imgBase64 = imgBytes.toString('base64');
              return sseHub.ask(
                sessionId,
                {
                  type: 'captcha_required',
                  data: { promptId, imgBase64, expectedLength: 6 },
                },
                { timeoutMs: 90_000 },
              );
            },
            async askOtp(channel: 'sms' | 'email'): Promise<string> {
              const promptId = randomUUID();
              return sseHub.ask(
                sessionId,
                {
                  type: 'otp_required',
                  data: { promptId, channel },
                },
                { timeoutMs: 120_000 },
              );
            },
            async askText(label: string): Promise<string> {
              const promptId = randomUUID();
              return sseHub.ask(
                sessionId,
                {
                  type: 'text_required',
                  data: { promptId, label },
                },
                { timeoutMs: 90_000 },
              );
            },
          },
        };

        // 5. Run adapter chain
        await transition(sessionId, 'SCRAPING');
        const chainResult = await runPfChain(ctx);

        if (!chainResult.ok || !chainResult.parsed?.ok) {
          const errMsg =
            chainResult.error ??
            (chainResult.parsed && !chainResult.parsed.ok
              ? chainResult.parsed.error
              : 'Unknown chain error');

          const dlqEntry = await writeIngestionFailure({
            userId,
            sourceAdapter: 'pf.chain',
            adapterVersion: '1',
            sourceRef: accountId,
            error: errMsg,
            rawPayload: chainResult.raw ?? null,
          });

          await fail(sessionId, errMsg, (dlqEntry as { id: string }).id);
          return;
        }

        // 6. Build and upsert canonical events
        const events = chainResult.parsed.events;
        const built = buildCanonicalEvents({
          userId,
          account: {
            id: account.id,
            institution: account.institution,
            type: account.type,
            identifierPlain,
          },
          adapterId: 'pf.epfo.v1',
          adapterVersion: '1.0.0',
          events,
        });

        let eventsInserted = 0;
        await prisma.$transaction(async (tx) => {
          for (const e of built) {
            try {
              await tx.canonicalEvent.upsert({
                where: {
                  userId_sourceHash: { userId: e.userId, sourceHash: e.sourceHash },
                },
                create: { ...e, status: 'CONFIRMED' },
                update: {},
              });
              eventsInserted++;
            } catch (upsertErr) {
              logger.warn(
                { sourceHash: e.sourceHash, err: upsertErr },
                '[pf-worker] canonical event upsert skipped (likely duplicate)',
              );
            }
          }
        });

        // 7. Recompute holding projection
        if (account.portfolioId && account.assetKey) {
          try {
            await recomputeForAsset(account.portfolioId, account.assetKey);
          } catch (recomputeErr) {
            logger.warn(
              { portfolioId: account.portfolioId, assetKey: account.assetKey, err: recomputeErr },
              '[pf-worker] holding recompute failed — non-fatal',
            );
          }
        }

        // 8. Update account metadata
        await prisma.providentFundAccount.update({
          where: { id: account.id },
          data: {
            lastRefreshedAt: new Date(),
            lastFetchSource: 'SERVER_HEADLESS',
          },
        });

        // 9. Complete session
        await complete(sessionId, eventsInserted);

        logger.info(
          { bullJobId: job.id, sessionId, eventsInserted, durationMs: Date.now() - t0 },
          '[pf-worker] done',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ bullJobId: job.id, sessionId, err }, '[pf-worker] unhandled error');

        const dlqEntry = await writeIngestionFailure({
          userId,
          sourceAdapter: 'pf.chain',
          adapterVersion: '1',
          sourceRef: accountId,
          error: msg,
        }).catch(() => null);

        await fail(sessionId, msg, (dlqEntry as { id: string } | null)?.id).catch(() => {
          /* ignore secondary failure */
        });
      }
    });
  });

  logger.info('[pf-worker] started — concurrency=2, timeout=10min');
}
