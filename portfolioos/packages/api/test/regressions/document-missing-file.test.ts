import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { streamFileTo } from '../../src/lib/documentStorage.js';
import { NotFoundError } from '../../src/lib/errors.js';

/**
 * Stored files live on the API container's disk, which a redeploy wipes. The
 * download handlers piped `createReadStream(path)` straight into the response
 * with no error listener, so a missing file emitted an unhandled 'error',
 * hit the process's uncaughtException handler and took the whole API down
 * (Railway 502 for every user until it restarted).
 */
function fakeRes() {
  const res = new PassThrough() as unknown as Response & PassThrough;
  return res;
}

describe('streamFileTo', () => {
  it('refuses a missing file with a 404 instead of crashing the process', async () => {
    const missing = join(tmpdir(), `nope-${Date.now()}.pdf`);
    await expect(streamFileTo(fakeRes(), missing)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('streams a file that exists', async () => {
    const file = join(tmpdir(), `yes-${Date.now()}.txt`);
    writeFileSync(file, 'hello');
    const res = fakeRes();
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    await streamFileTo(res, file);
    await new Promise((r) => res.on('end', r));
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });
});
