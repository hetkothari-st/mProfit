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
    // sendDefaultPii defaults to false, but v8's Express auto-instrumentation
    // can still attach request data to an event, and this app's JWTs ride in
    // the Authorization header. Strip credentials and known PII shapes before
    // anything leaves the process for a third-party service.
    beforeSend(event) {
      const headers = event.request?.headers;
      if (headers) {
        for (const key of Object.keys(headers)) {
          const k = key.toLowerCase();
          if (k === 'authorization' || k === 'cookie' || k === 'x-finfactor-signature') {
            headers[key] = '[redacted]';
          }
        }
      }
      // Request bodies can carry passwords, OTPs and reset tokens. Nothing in
      // them is worth shipping off-box for debugging.
      if (event.request?.data !== undefined) event.request.data = '[redacted]';
      if (event.request?.cookies) event.request.cookies = { redacted: '[redacted]' };
      return event;
    },
  });
  logger.info('[sentry] initialized');
}

export { Sentry };
