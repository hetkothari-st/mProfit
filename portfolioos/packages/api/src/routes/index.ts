import type { Express } from 'express';
import { authRouter } from './auth.routes.js';
import { portfoliosRouter } from './portfolios.routes.js';
import { transactionsRouter } from './transactions.routes.js';
import { assetsRouter } from './assets.routes.js';
import { importsRouter } from './imports.routes.js';
import { ingestionFailuresRouter } from './ingestionFailures.routes.js';
import { connectorsRouter } from './connectors.routes.js';
import { mailboxesRouter } from './mailboxes.routes.js';
import { gmailRouter } from './gmail.routes.js';
import { reportsRouter } from './reports.routes.js';
import { casRouter } from './cas.routes.js';
import { canonicalEventsRouter } from './canonicalEvents.routes.js';
import { monitoredSendersRouter } from './monitoredSenders.routes.js';
import { ingestionRouter } from './ingestion.routes.js';
import { vehiclesRouter } from './vehicles.routes.js';
import { cashFlowsRouter } from './cashflows.routes.js';
import { rentalRouter } from './rental.routes.js';

export function registerRoutes(app: Express): void {
  app.use('/api/auth', authRouter);
  app.use('/api/portfolios', portfoliosRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/ingestion-failures', ingestionFailuresRouter);
  app.use('/api/connectors', connectorsRouter);
  app.use('/api/mailboxes', mailboxesRouter);
  app.use('/api/gmail', gmailRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/cas', casRouter);
  app.use('/api/canonical-events', canonicalEventsRouter);
  app.use('/api/monitored-senders', monitoredSendersRouter);
  app.use('/api/ingestion', ingestionRouter);
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/cashflows', cashFlowsRouter);
  app.use('/api/rental', rentalRouter);
}
