import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { error as errorResponse } from '../lib/response.js';
import { env } from '../config/env.js';
import multer from 'multer';

/**
 * Prisma codes that mean "the database is busy or unreachable right now", not
 * "this request is wrong": pool checkout timed out (P2024), cannot reach the
 * server (P1001), interactive transaction expired (P2028), write conflict or
 * deadlock (P2034). Answered as 503 + Retry-After so clients retry instead of
 * reporting a bug.
 */
const TRANSIENT_DB_CODES = new Set(['P1001', 'P2024', 'P2028', 'P2034']);

const MULTER_MESSAGES: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: 'File is too large',
  LIMIT_FILE_COUNT: 'Too many files',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
};

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === 'object' && err !== null &&
    typeof (err as { status?: unknown }).status === 'number' &&
    typeof (err as { type?: unknown }).type === 'string' &&
    (err as { type: string }).type.startsWith('entity.')
  );
}

function serviceUnavailable(res: Parameters<ErrorRequestHandler>[2]): void {
  res.setHeader('Retry-After', '5');
  errorResponse(res, 503, 'Service temporarily unavailable, please retry', 'SERVICE_UNAVAILABLE');
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // The response is already partly written (a stream or SSE). Returning here
  // left the socket open with no end; Express's default handler closes it.
  if (res.headersSent) {
    next(err);
    return;
  }

  // body-parser: malformed JSON (400), body over the limit (413), bad charset.
  // Client errors, not server faults — no error log, no 500.
  if (isBodyParserError(err) && err.status >= 400 && err.status < 500) {
    const message = err.type === 'entity.too.large' ? 'Request body is too large' : 'Malformed request body';
    errorResponse(res, err.status, message, err.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST');
    return;
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    errorResponse(res, status, MULTER_MESSAGES[err.code] ?? 'Invalid upload', err.code);
    return;
  }

  if (err instanceof ZodError) {
    errorResponse(res, 422, 'Validation failed', 'VALIDATION_ERROR', err.flatten());
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err }, err.message);
    errorResponse(res, err.statusCode, err.message, err.code, err.details);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      errorResponse(res, 409, `Duplicate value for unique ${target}`, 'DUPLICATE', err.meta);
      return;
    }
    if (err.code === 'P2025') {
      errorResponse(res, 404, 'Record not found', 'NOT_FOUND');
      return;
    }
    if (TRANSIENT_DB_CODES.has(err.code)) {
      logger.warn({ err }, 'Transient database error');
      serviceUnavailable(res);
      return;
    }
    logger.error({ err }, 'Prisma known request error');
    errorResponse(res, 500, 'Database error', 'DB_ERROR');
    return;
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error({ err }, 'Database unreachable');
    serviceUnavailable(res);
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ err }, 'Prisma validation error');
    errorResponse(res, 400, 'Invalid database query', 'DB_VALIDATION');
    return;
  }

  logger.error({ err }, 'Unhandled error');
  // Every branch above maps a known error type to a deliberate message. This
  // one catches everything else, so its message is whatever an unmapped
  // `throw` happened to say — internal paths, query fragments, third-party
  // API errors. That is fine to read in a dev console and not fine to hand to
  // a client, so production gets a fixed string while the detail stays in the
  // log line above.
  errorResponse(
    res,
    500,
    env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Internal server error',
    'INTERNAL_ERROR',
  );
};

export const notFoundHandler = (_req: import('express').Request, res: import('express').Response) => {
  errorResponse(res, 404, 'Route not found', 'ROUTE_NOT_FOUND');
};
