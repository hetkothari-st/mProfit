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

  // R-18: the weekly NAV-history backfill was exported but never started, so
  // newly listed schemes never got history and stayed unscored.
  it('starts the weekly MF NAV history backfill', () => {
    expect(index).toMatch(/^\s*startMfNavHistoryBackfillJob\(\);/m);
  });

  it.each(STARTERS)('%s is started from index.ts', (name) => {
    expect(index).toMatch(new RegExp(`^\\s*${name}\\(\\);`, 'm'));
  });
});

// PROCESS_ROLE=web must not drop work: these three queues are filled by requests and drained in the same
// process, so they have to start in every role, not only where the cron jobs run.
describe('process roles', () => {
  const index = read('../../src/index.ts');
  const fn = (name: string) => index.slice(index.indexOf(`function ${name}`), index.indexOf('\n}\n', index.indexOf(`function ${name}`)));

  it.each(['startMfAnalysisJob', 'startMfProseJob', 'startPolicyProseJob'])('%s starts in every role', (name) => {
    expect(fn('startRequestDrivenQueues')).toContain(`${name}();`);
    expect(fn('startBackgroundJobs')).not.toContain(`${name}();`);
  });

  it('startRequestDrivenQueues runs unconditionally, background jobs only when the role runs jobs', () => {
    expect(index).toMatch(/^\s*startRequestDrivenQueues\(\);/m);
    expect(index).toMatch(/if \(runsJobs\) startBackgroundJobs\(\);/);
  });
});
