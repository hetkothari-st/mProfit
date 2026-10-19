import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// R-03: these five were started at the end of runStartupSync, so a DB error
// early in the sync — or ENABLE_STARTUP_SYNC=false — meant they never ran for
// the life of the process. Succession (legacy transfer) is a dead-man switch;
// a silent non-start is a missed delivery.
const STARTERS = [
  'startPfFetchWorker',
  'startPfNudgeJob',
  'startSplitShareLinkReconcileJob',
  'startSplitDigestJobs',
  'startLegacyTransferJob',
];

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('boot-time job wiring', () => {
  const startupSync = read('../../src/jobs/startupSync.ts');
  const index = read('../../src/index.ts');

  it.each(STARTERS)('%s is not started from runStartupSync', (name) => {
    expect(startupSync).not.toMatch(new RegExp(`\\b${name}\\(`));
  });

  it.each(STARTERS)('%s is started from index.ts', (name) => {
    expect(index).toMatch(new RegExp(`^\\s*${name}\\(\\);`, 'm'));
  });
});
