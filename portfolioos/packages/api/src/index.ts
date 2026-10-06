import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { standardLimiter } from './middleware/rateLimit.js';
import { registerRoutes } from './routes/index.js';
import { prisma } from './lib/prisma.js';
import { startPriceJobs } from './jobs/priceJobs.js';
import { startImportWorker } from './jobs/importWorker.js';
import { registerGmailScanWorker } from './jobs/gmailScanWorker.js';
import { runStartupSync } from './jobs/startupSync.js';
import { startMailboxPoller, stopMailboxPoller } from './jobs/mailboxPoller.js';
import { startVehicleJobs } from './jobs/vehicleJobs.js';
import { startCatalogJobs } from './jobs/catalogJobs.js';
import { startRentalJobs } from './jobs/rentalJobs.js';
import { startInsuranceJobs } from './jobs/insuranceJobs.js';
import { startAccountDeletionJob } from './jobs/accountDeletionJob.js';
import { startPiiAtRestJobs } from './jobs/piiAtRestJobs.js';
import { startSecretRotationJobs } from './jobs/secretRotationJobs.js';
import { startAlertJobs } from './jobs/alertJobs.js';
import { startNetWorthSnapshotJob } from './jobs/netWorthSnapshotJob.js';
import { startFundScoringJob } from './jobs/fundScoring.job.js';
import { assertNamedFundReleaseGate } from './services/advisor/fundRanking/releaseGate.js';
import { evaluateDbRole, readDbRoleFacts } from './lib/dbRoleGuard.js';
import { startFoExpiryJob } from './jobs/foExpiryClose.job.js';
// MF analytics layer (docs/mf-analytics/). Ordering below is load-bearing, not
// cosmetic — see the comment at the call sites.
import { startMfNavAdjustmentJob } from './jobs/mfNavAdjustmentJob.js';
import { startMfMetricsJob } from './jobs/mfMetricsJob.js';
import { startMfPeerRankJob } from './jobs/mfPeerRankJob.js';
import { startMfMetadataJob } from './jobs/mfMetadataJob.js';
import { startBenchmarkPriceJob } from './jobs/benchmarkPriceJob.js';
import { startRiskFreeRateJob } from './jobs/riskFreeRateJob.js';
import { startMfReconciliationJob } from './jobs/mfReconciliationJob.js';
import { startMfAnalysisJob } from './jobs/mfAnalysisJob.js';
import { startMfProseJob } from './jobs/mfProseJob.js';
import { startMfOpsAlertsJob } from './jobs/mfOpsAlertsJob.js';
import { startMfScoreJob } from './jobs/mfScoreJob.js';
import { closeQueues } from './lib/queue.js';
import { initSentry, Sentry } from './lib/sentry.js';
import { makeOriginCheck } from './lib/corsOrigins.js';
import { apiSandbox } from './lib/apiSandbox.js';
import { redactUrl } from './lib/redactUrl.js';

// Initialise Sentry BEFORE building the Express app so auto-instrumentation
// wraps all request handling. No-ops if SENTRY_DSN is not set.
initSentry();

const app = express();

app.disable('x-powered-by');

// Railway terminates TLS and proxies every request, so the socket's remote
// address is the edge, not the client. Without this, `req.ip` — which
// express-rate-limit keys on — is identical for all traffic: one shared
// bucket, so a single abuser exhausts everyone's login attempts and no
// attacker is ever isolated. `1` = trust exactly one proxy hop; do not use
// `true`, which trusts a client-supplied X-Forwarded-For outright and makes
// the limiter trivially spoofable.
app.set('trust proxy', 1);

app.use(
  helmet({
    // This process serves JSON only (the SPA is a separate nginx origin), so
    // a CSP here protects nothing the SPA's own CSP does not. Left off
    // deliberately rather than by omission.
    contentSecurityPolicy: false,
    // Six months, and let the edge decide about preload.
    hsts: { maxAge: 15_552_000, includeSubDomains: true, preload: false },
  }),
);
const isOriginAllowed = makeOriginCheck(env.CORS_ORIGIN);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin)) return callback(null, true);
      // Reject. Every branch here used to call `callback(null, true)`, which
      // made the allow-list above dead code and reflected any origin back
      // alongside `credentials: true`. Auth is Bearer-header only today so
      // that was not a live session-theft path, but it left nothing standing
      // between an arbitrary site and this API the moment any cookie-based
      // flow is added.
      logger.warn({ origin }, 'cors.origin.rejected');
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(
  express.json({
    limit: '10mb',
    // Keep the exact bytes for routes that authenticate by signing the body.
    // Scoped by path so we are not holding a second copy of every 10MB
    // request in memory just for the handful that need it.
    verify: (req, _res, buf) => {
      const url = (req as IncomingMessage).url ?? '';
      if (url.includes('/integrations/finfactor/webhook/')) {
        (req as IncomingMessage & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req: IncomingMessage, res: ServerResponse, responseTime: number) =>
      `${(req as Request).method} ${redactUrl((req as Request).url)} ${res.statusCode} ${responseTime.toFixed(1)}ms`,
    customAttributeKeys: { responseTime: 'duration_ms' },
    serializers: {
      req: (req: Request) => ({ method: req.method, url: redactUrl(req.url) }),
      res: (res: Response) => ({ statusCode: res.statusCode }),
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

app.use('/api', apiSandbox);
app.use('/api', standardLimiter);
registerRoutes(app);

app.use(notFoundHandler);
// Sentry error handler must come before other error handlers and after all routes.
// It is a no-op when Sentry is not initialised (no SENTRY_DSN).
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

// Checked before serving: with a superuser/BYPASSRLS connection every RLS
// policy is off and the app would still look healthy. Logged as an error in
// production; fatal only with DB_ROLE_GUARD_STRICT=true (local Docker commonly
// connects as `postgres`, so elsewhere it's a warning).
const strictRoleGuard = env.DB_ROLE_GUARD_STRICT === 'true';
try {
  const verdict = evaluateDbRole(await readDbRoleFacts(), env.NODE_ENV, strictRoleGuard);
  if (!verdict.ok) {
    if (verdict.fatal) {
      logger.fatal(`Refusing to start: ${verdict.message}`);
      process.exit(1);
    }
    if (env.NODE_ENV === 'production') logger.error(verdict.message);
    else logger.warn(verdict.message);
  }
} catch (err) {
  if (env.NODE_ENV === 'production' && strictRoleGuard) {
    logger.fatal({ err }, 'Refusing to start: could not verify the database role');
    process.exit(1);
  }
  logger.warn({ err }, 'Could not verify the database role');
}

const server = app.listen(env.PORT, '::', () => {
  logger.info(`EveryPaisa API listening on http://localhost:${env.PORT}`);
  // Rate funds from the NAV history already stored, once, without holding up
  // the boot (it takes about an hour). See jobs/mfBootstrap.ts.
  if (env.ENABLE_MF_BOOTSTRAP === 'true' && env.NODE_ENV !== 'test') {
    void import('./jobs/mfBootstrap.js')
      .then((m) => m.runMfBootstrapOnce({ months: env.MF_BOOTSTRAP_MONTHS }))
      .catch((err: unknown) => logger.error({ err }, '[mf] bootstrap: could not start'));
  }
  startPriceJobs();
  // Named-fund advice must be able to run honestly before it runs at all: the
  // gate checks TER and AUM coverage and that the signed methodology is the
  // newest one. It logs the figures either way and throws only when the
  // feature is on and the data cannot support it.
  void assertNamedFundReleaseGate().catch((err: unknown) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      '[fundRanking] refusing to serve named-fund advice',
    );
    // Exiting rather than limping: a deployment configured to name funds but
    // unable to do so would otherwise serve category-level advice silently,
    // and nobody would notice for weeks.
    process.exit(1);
  });
  // After the AMFI NAV sync it schedules itself against; no-ops unless
  // named-fund advice is switched on.
  startFundScoringJob();
  startImportWorker();
  registerGmailScanWorker();
  startMailboxPoller();
  startVehicleJobs();
  startCatalogJobs();
  startRentalJobs();
  startInsuranceJobs();
  startAccountDeletionJob();
  startPiiAtRestJobs();
  startSecretRotationJobs();
  startAlertJobs();
  startNetWorthSnapshotJob();
  startFoExpiryJob();
  /**
   * MF analytics pipeline. Each job only registers a cron schedule here; the
   * schedules themselves encode the dependency chain, because each stage reads
   * what the previous one wrote:
   *
   *   benchmarkPrice   20:00  daily   TRI levels; metrics need these for
   *                                     every benchmark-relative figure
   *   AMFI NAV sync (startPriceJobs, above)  ~22:00 IST
   *     -> mfNavAdjustment  22:30  quarantine + adjustedNav
   *     -> mfMetrics        23:15  per-scheme metrics, needs adjustedNav
   *     -> mfPeerRank       00:30  universes + percentiles, needs every
   *                                scheme's metrics row to rank one of them
   *
   *   riskFreeRate     Mon 06:00  weekly  T-bill yield (Sharpe/Sortino input)
   *   mfReconciliation 5th 03:00  monthly accuracy check against published
   *                               figures. NOT the 1st: AMCs publish
   *                               month-end factsheets over the first few
   *                               working days, so a 1st run would compare
   *                               our fresh numbers against last month's
   *                               published ones and breach all 30 schemes.
   *   mfMetadata       1st 02:00  monthly scheme master; deliberately outside
   *                               the nightly band because it rewrites
   *                               sebiSubCategory/planType, which DECIDE a
   *                               scheme's peer universe — running it under
   *                               mfPeerRank would re-partition universes
   *                               mid-ranking.
   *
   * Registering them in this order does not enforce the sequence — the cron
   * times do. But a reader changing one time needs to see the chain, so they
   * are grouped and commented rather than filed alphabetically.
   *
   * All three are reference-data jobs: they run under `runAsSystem`, write no
   * user-scoped rows, and are safe to re-run (every write upserts on a natural
   * key, per `01-DATA-FOUNDATION.md §5`).
   */
  startBenchmarkPriceJob();
  startRiskFreeRateJob();
  startMfMetadataJob();
  startMfReconciliationJob();
  /**
   * The two user-scoped MF workers. Neither is on a cron: mfAnalysis is driven
   * by its three triggers (holdings change, a new score for a held scheme, a
   * rate-limited user refresh) and mfProse drains whatever mfAnalysis enqueued.
   * They are started here only so their queues exist and drain.
   *
   * Prose runs on its own queue on purpose (`05 §7`): a narration failure must
   * never change a run's status, and findings are shown with or without it.
   */
  startMfAnalysisJob();
  startMfProseJob();
  /**
   * The `06 §7` operational alerts that have no natural home inside a single
   * job -- the cross-job rates (analysis PARTIAL rate, prose verification
   * failure rate) that can only be measured after the fact. Runs late enough
   * to see a full night's pipeline.
   */
  startMfOpsAlertsJob();
  startMfNavAdjustmentJob();
  startMfMetricsJob();
  startMfPeerRankJob();
  /**
   * Monthly, the 15th (`01 §5`) -- after the month's holdings and metrics are
   * in. Scores are computed per universe rather than per scheme, because the
   * rating buckets are a fixed distribution WITHIN the universe and cannot be
   * assigned without every peer's composite in hand.
   */
  startMfScoreJob();
  // Fire-and-forget: run initial data sync in background so server stays responsive
  runStartupSync().catch((err) => logger.error({ err }, 'Startup sync failed'));
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    stopMailboxPoller();
    await closeQueues();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

/**
 * Log before dying.
 *
 * Node terminates on an unhandled rejection, and a terminated container is all
 * the platform can report: the edge returns 502 with no CORS headers and the
 * container restarts, so the browser blames CORS and the actual error is never
 * written down anywhere. That is exactly how a batch of unwrapped async route
 * handlers stayed invisible.
 *
 * This does not swallow the failure — the process still exits, because state
 * after an unhandled rejection is not to be trusted — it just makes sure the
 * reason reaches the logs first.
 */
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection — exiting');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception — exiting');
  process.exit(1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
