import { Writable } from 'node:stream';
import type { Request, Response } from 'express';

/**
 * A response a controller can be driven against without an HTTP server: it is
 * a real Writable (PDF generation pipes into it) that also answers the Express
 * methods the report handlers use, and records everything written.
 */
export interface CapturedResponse {
  res: Response;
  /** Everything written to the stream, in order. */
  body: () => Buffer;
  json: () => unknown;
  headers: Record<string, string>;
  statusCode: number;
  /** Resolves once the handler has ended the response. */
  finished: Promise<void>;
}

export function fakeResponse(): CapturedResponse {
  const chunks: Buffer[] = [];
  let jsonBody: unknown;
  let resolveFinished: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      callback();
    },
  });
  stream.on('finish', () => resolveFinished());

  const captured = {
    headers: {} as Record<string, string>,
    statusCode: 200,
  };

  const res = Object.assign(stream, {
    setHeader(name: string, value: string | number) {
      captured.headers[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return captured.headers[name.toLowerCase()];
    },
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(value: unknown) {
      jsonBody = value;
      stream.end(Buffer.from(JSON.stringify(value)));
      return res;
    },
    send(value: unknown) {
      if (Buffer.isBuffer(value)) stream.end(value);
      else stream.end(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
      return res;
    },
    type() {
      return res;
    },
    attachment() {
      return res;
    },
    get headersSent() {
      return chunks.length > 0;
    },
    locals: {},
  }) as unknown as Response;

  return {
    res,
    body: () => Buffer.concat(chunks),
    json: () => jsonBody,
    get headers() {
      return captured.headers;
    },
    get statusCode() {
      return captured.statusCode;
    },
    finished,
  };
}

/** A request carrying just what the report controllers read. */
export function fakeRequest(userId: string, query: Record<string, string> = {}): Request {
  return {
    user: { id: userId },
    query,
    params: {},
    headers: {},
    // Express request accessors the controllers use.
    header: () => undefined,
    get: () => undefined,
  } as unknown as Request;
}
