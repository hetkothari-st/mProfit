import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// R-09: client errors and transient DB errors all came back as 500, and a
// failure after the response had started left the socket hanging.

function run(err: unknown, headersSent = false) {
  const headers: Record<string, string> = {};
  const res = {
    headersSent,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  const next = vi.fn();
  errorHandler(err, {} as Request, res as unknown as Response, next);
  return { res, headers, next };
}

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

describe('errorHandler', () => {
  it('malformed JSON is a 400', () => {
    const err = Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' });
    expect(run(err).res.statusCode).toBe(400);
  });

  it('an oversized body is a 413', () => {
    const err = Object.assign(new Error('too large'), { status: 413, type: 'entity.too.large' });
    expect(run(err).res.statusCode).toBe(413);
  });

  it('an oversized upload is a 413', () => {
    expect(run(new multer.MulterError('LIMIT_FILE_SIZE')).res.statusCode).toBe(413);
  });

  it.each(['P1001', 'P2024', 'P2028', 'P2034'])('Prisma %s is a 503 with Retry-After', (code) => {
    const { res, headers } = run(known(code));
    expect(res.statusCode).toBe(503);
    expect(headers['Retry-After']).toBeDefined();
  });

  it('a database that cannot be reached at all is a 503', () => {
    const err = new Prisma.PrismaClientInitializationError("Can't reach database server", 'test');
    expect(run(err).res.statusCode).toBe(503);
  });

  it('still maps P2002 to 409', () => {
    expect(run(known('P2002')).res.statusCode).toBe(409);
  });

  it('hands a mid-stream error to Express so the socket is closed', () => {
    const err = new Error('boom');
    const { next } = run(err, true);
    expect(next).toHaveBeenCalledWith(err);
  });
});
