import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every way into the AMFI NAV load goes through the canary.
 *
 * The outage that started all of this was not a crash: NAVAll gained two
 * columns, every row failed the numeric check, and the job reported success
 * having imported zero rows. Funds were carried at stale NAVs for a month.
 *
 * `judgeFeedRun` catches that now — but only for callers that ask it to, and
 * for a while only the nightly job did. The startup sync, the master-sync
 * route and the admin refresh button each called the raw loader, so the same
 * silent zero-row run could still pass through three doors.
 *
 * `syncAmfiNav` is the guarded door. This keeps the raw loader private to its
 * own module, so a fourth caller cannot reintroduce the hole by accident.
 */

const SRC = join(__dirname, '..', '..', 'src');
const OWNER = join('priceFeeds', 'amfi.service.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

describe('the AMFI NAV load is always judged', () => {
  it('is only called directly by the module that guards it', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(OWNER))
      .filter((file) => /\bloadAmfiNavToDb\b/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1));

    expect(
      offenders,
      `These call the raw AMFI loader and so skip the canary that catches a ` +
        `zero-row import. Call syncAmfiNav() instead:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('exports a guarded entry point that the canary wraps', () => {
    const owner = readFileSync(join(SRC, OWNER), 'utf8');
    expect(owner).toMatch(/export async function syncAmfiNav\b/);
    expect(owner).toMatch(/runFeedWithCanary\(\s*'amfi_nav'/);
  });
});
