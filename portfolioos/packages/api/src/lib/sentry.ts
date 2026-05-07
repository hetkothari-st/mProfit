import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('[sentry] no DSN configured — skipping init');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    integrations: [
      // HTTP, express auto-instrumentation enabled by default in @sentry/node v8
    ],
  });
  logger.info('[sentry] initialized');
}

export { Sentry };
