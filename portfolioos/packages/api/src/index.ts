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
import { runStartupSync } from './jobs/startupSync.js';
import { startMailboxPoller, stopMailboxPoller } from './jobs/mailboxPoller.js';
import { startVehicleJobs } from './jobs/vehicleJobs.js';
import { startCatalogJobs } from './jobs/catalogJobs.js';
import { startRentalJobs } from './jobs/rentalJobs.js';
import { startInsuranceJobs } from './jobs/insuranceJobs.js';
import { startAlertJobs } from './jobs/alertJobs.js';
import { startFoExpiryJob } from './jobs/foExpiryClose.job.js';
import { closeQueues } from './lib/queue.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
const corsAllowList = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsAllowList.includes(origin)) return callback(null, true);
      // Allow any *.railway.app subdomain (Railway-generated web service URLs)
      if (/^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.railway\.app$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: Request) => ({ method: req.method, url: req.url }),
      res: (res: Response) => ({ statusCode: res.statusCode }),
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

app.use('/api', standardLimiter);
registerRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, '::', () => {
  logger.info(`PortfolioOS API listening on http://localhost:${env.PORT}`);
  startPriceJobs();
  startImportWorker();
  startMailboxPoller();
  startVehicleJobs();
  startCatalogJobs();
  startRentalJobs();
  startInsuranceJobs();
  startAlertJobs();
  startFoExpiryJob();
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

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
