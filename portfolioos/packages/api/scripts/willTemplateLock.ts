/**
 * Will template lock. Every locked template file (`*.v<N>.ts` in
 * packages/shared/src/will/template) is listed in LOCK.json with its sha256.
 * test/will/templateLock.test.ts fails if a locked file changes: wording
 * changes need a new versioned file, never an edit.
 *
 * Write the lock (only when adding a NEW versioned file):
 *   cd portfolioos/packages/api && npx tsx scripts/willTemplateLock.ts
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WILL_TEMPLATE_DIR = fileURLToPath(new URL('../../shared/src/will/template/', import.meta.url));

/** sha256 per locked file, CRLF normalised so a Windows checkout hashes the same. */
export function templateHashes(dir: string = WILL_TEMPLATE_DIR): Record<string, string> {
  const files = readdirSync(dir).filter((f) => /\.v\d+\.ts$/.test(f)).sort();
  return Object.fromEntries(
    files.map((f) => [
      f,
      createHash('sha256').update(readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex'),
    ]),
  );
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  writeFileSync(join(WILL_TEMPLATE_DIR, 'LOCK.json'), `${JSON.stringify(templateHashes(), null, 2)}\n`);
  process.stdout.write('LOCK.json written\n');
}
