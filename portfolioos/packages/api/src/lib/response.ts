import type { Response } from 'express';
import type { ApiError, ApiSuccess, PaginationMeta } from '@portfolioos/shared';

export function ok<T>(res: Response, data: T, meta?: PaginationMeta) {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  res.json(body);
}

export function created<T>(res: Response, data: T) {
  const body: ApiSuccess<T> = { success: true, data };
  res.status(201).json(body);
}

export function noContent(res: Response) {
  res.status(204).end();
}

export function error(
  res: Response,
  statusCode: number,
  message: string,
  code?: string,
  details?: unknown,
) {
  const body: ApiError = {
    success: false,
    error: message,
    ...(code ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
  };
  res.status(statusCode).json(body);
}
