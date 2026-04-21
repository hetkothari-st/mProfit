import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { error as errorResponse } from '../lib/response.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;

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
    logger.error({ err }, 'Prisma known request error');
    errorResponse(res, 500, 'Database error', 'DB_ERROR');
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ err }, 'Prisma validation error');
    errorResponse(res, 400, 'Invalid database query', 'DB_VALIDATION');
    return;
  }

  logger.error({ err }, 'Unhandled error');
  errorResponse(
    res,
    500,
    err instanceof Error ? err.message : 'Internal server error',
    'INTERNAL_ERROR',
  );
};

export const notFoundHandler = (_req: import('express').Request, res: import('express').Response) => {
  errorResponse(res, 404, 'Route not found', 'ROUTE_NOT_FOUND');
};
