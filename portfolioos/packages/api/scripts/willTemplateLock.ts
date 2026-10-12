/**
 * Will template lock. Every locked template file (`*.v<N>.ts` in
 * packages/shared/src/will/template) is listed in LOCK.json with its sha256,
 * keyed by file name. The helpers the template prints through
 * (WILL_LOCKED_EXTRA_FILES) are listed too, keyed by their path relative to
 * packages/shared/src. test/will/templateLock.test.ts fails if a locked file
 * changes: wording changes need a new versioned file, never an edit.
 *
 * Add new versioned files to the lock (never changes an existing entry):
 *   cd portfolioos/packages/api && npx tsx scripts/willTemplateLock.ts
 * Accept a changed hash for a file that has never been used to generate a will
 * (a controller ruling, recorded in the commit):
 *   npx tsx scripts/willTemplateLock.ts --rebless common.v1.ts --rebless will/ast.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WILL_SHARED_SRC_DIR = fileURLToPath(new URL('../../shared/src/', import.meta.url));
export const WILL_TEMPLATE_DIR = join(WILL_SHARED_SRC_DIR, 'will', 'template');

/** Files outside the template folder whose output is printed in the will (paths relative to shared/src). */
export const WILL_LOCKED_EXTRA_FILES: readonly string[] = ['amountInWords.ts', 'will/ast.ts'];

function sha256(path: string): string {
  // CRLF normalised so a Windows checkout hashes the same.
  return createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
}

/** sha256 per locked file. */
export function templateHashes(
  dir: string = WILL_TEMPLATE_DIR,
  srcDir: string = WILL_SHARED_SRC_DIR,
  extras: readonly string[] = WILL_LOCKED_EXTRA_FILES,
): Record<string, string> {
  const files = readdirSync(dir).filter((f) => /\.v\d+\.ts$/.test(f));
  const out: Record<string, string> = {};
  for (const f of files) out[f] = sha256(join(dir, f));
  for (const e of extras) out[e] = sha256(join(srcDir, e));
  return sortKeys(out);
}

function sortKeys(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]!]));
}

export interface LockPlan {
  lock: Record<string, string>;
  errors: string[];
}

/**
 * The next LOCK.json: new files are added; an existing entry whose hash changed
 * or whose file disappeared is an error unless it is named in `rebless`.
 */
export function planLock(
  current: Record<string, string>,
  existing: Record<string, string>,
  rebless: readonly string[] = [],
): LockPlan {
  const errors: string[] = [];
  const allowed = new Set(rebless);
  for (const name of rebless) {
    if (!(name in existing)) errors.push(`--rebless ${name}: not in LOCK.json (new files are added without --rebless)`);
  }
  const lock: Record<string, string> = {};
  for (const [name, hash] of Object.entries(existing)) {
    const now = current[name];
    if (now === undefined) {
      if (!allowed.has(name)) {
        errors.push(`${name}: locked file is missing`);
        lock[name] = hash;
      }
    } else if (now !== hash && !allowed.has(name)) {
      errors.push(`${name}: locked file changed; add a new version instead (or --rebless ${name})`);
      lock[name] = hash;
    } else {
      lock[name] = now;
    }
  }
  for (const [name, hash] of Object.entries(current)) if (!(name in existing)) lock[name] = hash;
  return { lock: sortKeys(lock), errors };
}

export function parseRebless(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--rebless') throw new Error(`unknown argument ${argv[i]}`);
    const name = argv[i + 1];
    if (!name || name.startsWith('--')) throw new Error('--rebless needs a file name');
    out.push(name);
    i++;
  }
  return out;
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const lockPath = join(WILL_TEMPLATE_DIR, 'LOCK.json');
  const existing = existsSync(lockPath)
    ? (JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, string>)
    : {};
  const { lock, errors } = planLock(templateHashes(), existing, parseRebless(process.argv.slice(2)));
  if (errors.length) {
    process.stderr.write(`LOCK.json not written:\n${errors.map((e) => `  ${e}`).join('\n')}\n`);
    process.exit(1);
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  process.stdout.write('LOCK.json written\n');
}
