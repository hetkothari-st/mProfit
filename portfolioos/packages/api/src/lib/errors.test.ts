import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from './errors.js';

describe('AppError hierarchy', () => {
  it('defaults AppError to 500 / INTERNAL_ERROR', () => {
    const err = new AppError('boom');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err).toBeInstanceOf(Error);
  });

  it('maps each subclass to the right status + code', () => {
    expect(new BadRequestError().statusCode).toBe(400);
    expect(new BadRequestError().code).toBe('BAD_REQUEST');
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new UnauthorizedError().code).toBe('UNAUTHORIZED');
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new ForbiddenError().code).toBe('FORBIDDEN');
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new NotFoundError().code).toBe('NOT_FOUND');
    expect(new ConflictError().statusCode).toBe(409);
    expect(new ConflictError().code).toBe('CONFLICT');
    expect(new ValidationError().statusCode).toBe(422);
    expect(new ValidationError().code).toBe('VALIDATION_ERROR');
  });

  it('preserves custom message and details', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    expect(err.message).toBe('bad input');
    expect(err.details).toEqual({ field: 'email' });
  });
});
