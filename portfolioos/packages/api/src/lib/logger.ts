import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Paths scrubbed from every log record.
 *
 * This is a backstop, not the control: the fix for a secret reaching the logs
 * is to stop handing it to the logger. But one `logger.info({ email, token })`
 * was enough to turn password reset into an account-takeover path, and the
 * next one would be just as easy to write, so the shapes that must never be
 * logged are enumerated here as well.
 *
 * pino matches these literally, so each risky key is listed at the top level,
 * one level down, and inside the request/response serialiser wrappers.
 */
const REDACT_PATHS = [
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'newPassword',
  'passwordHash',
  'otp',
  'pan',
  'aadhaar',
  'apiSecret',
  'totpSecret',
  'secret',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.password',
  '*.newPassword',
  '*.passwordHash',
  '*.otp',
  '*.pan',
  '*.aadhaar',
  '*.apiSecret',
  '*.totpSecret',
  '*.secret',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.newPassword',
  'req.body.token',
];

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
