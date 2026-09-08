/**
 * Integration tests for the two MF ops alerts that have no job of their own
 * (`06-QUALITY-COMPLIANCE.md §7`, `07` Task 6.1): the `mfAnalysisJob` PARTIAL
 * rate and the scheduled prose-verification failure rate.
 *
 * These hit a real database, and three things follow from that:
 *
 *  1. **Every row is namespaced.** Users are created per-run with a reserved
 *     email prefix and `afterEach` deletes only those users; `MfAnalysisRun`,
 *     `LlmSpend` and `Alert` all cascade from `User`. The development database
 *     is shared with other suites — an unscoped `deleteMany` here would take
 *     somebody else's fixtures with it.
 *
 *  2. **The ops user is passed explicitly.** `resolveOpsUserId` otherwise picks
 *     the oldest active ADMIN, which in a shared database is somebody else's
 *     user, and the alert would be written where this test cannot see it and
 *     cannot clean it up.
 *
 *  3. **Both rates are read fleet-wide.** `MfAnalysisRun` and `LlmSpend` are
 *     user-scoped, so the checks run under `runAsSystem`. Every test therefore
 *     pins its own UTC day far in the future, so rows another suite happens to
 *     leave behind on *today* cannot move the denominator.
 *
 * The load-bearing assertions are the ones about *not* alerting: a minimum
 * sample floor and a dedupe key are the difference between an alert channel an
 * operator reads and one they mute.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  checkMfAnalysisPartialRate,
  runMfOpsAlertsSweep,
  resetMfOpsAlertsOpsUserCache,
  MF_ANALYSIS_PARTIAL_MIN_SAMPLE,
  MF_ANALYSIS_PARTIAL_RATE_THRESHOLD,
} from '../../src/jobs/mfOpsAlertsJob.js';
import {
  MF_PROSE_PURPOSE,
  PROSE_VERIFICATION_FAILED_PREFIX,
  PROSE_VERIFICATION_MIN_SAMPLE,
} from '../../src/jobs/mfProseJob.js';

/**
 * A day nothing else in the suite writes to. Both checks aggregate across every
 * user, so an ambient row from another test on "today" would silently join the
 * sample; a day in 2099 cannot.
 */
const DAY = new Date(Date.UTC(2099, 3, 17));
const DAY_START = new Date(Date.UTC(2099, 3, 17));
const DAY_LABEL = '2099-04-17';
/** Mid-day, so a timezone bug that shifts by hours still lands inside the day. */
const AT = new Date(Date.UTC(2099, 3, 17, 12, 0, 0));

const EMAIL_PREFIX = 'mf-ops-alerts-';

const createdUserIds: string[] = [];

async function createUser(role: 'INVESTOR' | 'ADMIN' = 'INVESTOR'): Promise<string> {
  const id = await runAsSystem(async () => {
    const u = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'test-not-a-real-hash',
        name: 'MF ops alerts fixture',
        role,
      },
      select: { id: true },
    });
    return u.id;
  });
  createdUserIds.push(id);
  return id;
}

/** Minimal but structurally faithful — the checks read only `status`/`startedAt`,
 *  but a snapshot column that is `{}` in a fixture and an object in production
 *  is how a future field that the check starts reading arrives undefined. */
const EMPTY_JSON = {} as Prisma.InputJsonValue;

async function seedRuns(
  userId: string,
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'RUNNING',
  count: number,
): Promise<void> {
  await runAsSystem(async () => {
    for (let i = 0; i < count; i += 1) {
      await prisma.mfAnalysisRun.create({
        data: {
          userId,
          asOf: DAY_START,
          status,
          factsSnapshot: EMPTY_JSON,
          portfolioAnalysis: EMPTY_JSON,
          ruleVersionsSnapshot: EMPTY_JSON,
          triggeredBy: 'HOLDINGS_CHANGE',
          startedAt: AT,
        },
      });
    }
  });
}

async function seedProseSpend(
  userId: string,
  outcome: 'verified' | 'rejected' | 'transport',
  count: number,
): Promise<void> {
  await runAsSystem(async () => {
    for (let i = 0; i < count; i += 1) {
      await prisma.llmSpend.create({
        data: {
          userId,
          model: 'test-model',
          inputTokens: 1,
          outputTokens: 1,
          costInr: '0.0001',
          purpose: MF_PROSE_PURPOSE,
          success: outcome === 'verified',
          errorMessage:
            outcome === 'rejected'
              ? `${PROSE_VERIFICATION_FAILED_PREFIX}: fabricated figure`
              : outcome === 'transport'
                ? 'ANTHROPIC_TIMEOUT'
                : null,
          createdAt: AT,
        },
      });
    }
  });
}

function alertsFor(opsUserId: string): Promise<Array<{ title: string; description: string | null }>> {
  return runAsSystem(() =>
    prisma.alert.findMany({
      where: { userId: opsUserId, type: 'CUSTOM', triggerDate: DAY_START },
      select: { title: true, description: true },
    }),
  );
}

beforeEach(() => {
  resetMfOpsAlertsOpsUserCache();
});

afterEach(async () => {
  // Alert, MfAnalysisRun and LlmSpend all cascade from User, so deleting the
  // fixture users is the whole teardown. Scoped to the ids this file created —
  // never to the email prefix alone, in case a real user ever adopts it.
  await runAsSystem(async () => {
    for (const id of createdUserIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {
        // Already gone (a failed test that cleaned up early). Nothing to undo.
      });
    }
  });
  createdUserIds.length = 0;
});

// ---------------------------------------------------------------------------
// mfAnalysisJob PARTIAL rate
// ---------------------------------------------------------------------------

describe('checkMfAnalysisPartialRate', () => {
  it('alerts when the PARTIAL share of terminal runs breaches 5%', async () => {
    const ops = await createUser('ADMIN');
    const subject = await createUser();
    // 3/40 = 7.5%, above the 5% threshold and above the sample floor.
    await seedRuns(subject, 'COMPLETED', 37);
    await seedRuns(subject, 'PARTIAL', 3);

    const result = await checkMfAnalysisPartialRate({ day: DAY, opsUserId: ops });

    expect(result.day).toBe(DAY_LABEL);
    expect(result.completed).toBe(37);
    expect(result.partial).toBe(3);
    expect(result.rate).toBe('0.0750');
    expect(result.alerted).toBe(true);

    const alerts = await alertsFor(ops);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.title).toBe(`MF analysis PARTIAL rate: ${DAY_LABEL}`);
    // The alert has to carry the numbers, not just the fact of a breach — an
    // operator should not have to re-run the query to know how bad it is.
    expect(alerts[0]?.description).toContain('3 of 40');
    expect(alerts[0]?.description).toContain('7.5%');
  });

  it('does not alert below the minimum sample, however bad the ratio', async () => {
    const ops = await createUser('ADMIN');
    const subject = await createUser();
    // 100% PARTIAL — but on a sample of 3. The first bad run of a quiet day is
    // not a regression, and paging on it is how the channel gets muted.
    await seedRuns(subject, 'PARTIAL', 3);

    const result = await checkMfAnalysisPartialRate({ day: DAY, opsUserId: ops });

    expect(result.rate).toBe('1.0000');
    expect(result.alerted).toBe(false);
    expect(result.reason).toContain(String(MF_ANALYSIS_PARTIAL_MIN_SAMPLE));
    expect(await alertsFor(ops)).toHaveLength(0);
  });

  it('excludes FAILED and RUNNING from both numerator and denominator', async () => {
    const ops = await createUser('ADMIN');
    const subject = await createUser();
    // 1/25 PARTIAL = 4%, under threshold. Twenty FAILED runs would drag the
    // rate to 2.2% if they were in the denominator — diluting the signal
    // exactly when things are worst — and RUNNING rows have no outcome yet.
    await seedRuns(subject, 'COMPLETED', 24);
    await seedRuns(subject, 'PARTIAL', 1);
    await seedRuns(subject, 'FAILED', 20);
    await seedRuns(subject, 'RUNNING', 10);

    const result = await checkMfAnalysisPartialRate({ day: DAY, opsUserId: ops });

    expect(result.completed).toBe(24);
    expect(result.partial).toBe(1);
    expect(result.failed).toBe(20);
    expect(result.rate).toBe('0.0400');
    expect(
      MF_ANALYSIS_PARTIAL_RATE_THRESHOLD.greaterThanOrEqualTo(result.rate),
    ).toBe(true);
    expect(result.alerted).toBe(false);
    expect(result.reason).toBe('within threshold');
  });

  it('is idempotent for a day — a re-run raises no second alert', async () => {
    const ops = await createUser('ADMIN');
    const subject = await createUser();
    await seedRuns(subject, 'COMPLETED', 37);
    await seedRuns(subject, 'PARTIAL', 3);

    await checkMfAnalysisPartialRate({ day: DAY, opsUserId: ops });
    const second = await checkMfAnalysisPartialRate({ day: DAY, opsUserId: ops });

    // Still reports the breach — the day is still bad — but writes nothing new.
    expect(second.alerted).toBe(true);
    expect(await alertsFor(ops)).toHaveLength(1);
  });

  it('reports an empty day as 0% rather than dividing by zero', async () => {
    const ops = await createUser('ADMIN');
    const result = await checkMfAnalysisPartialRate({ day: DAY, opsUserId: ops });
    expect(result.rate).toBe('0.0000');
    expect(result.alerted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The sweep — the part Task 6.1 was actually missing for prose
// ---------------------------------------------------------------------------

describe('runMfOpsAlertsSweep', () => {
  it('runs both checks for the day and raises both alerts', async () => {
    const ops = await createUser('ADMIN');
    const subject = await createUser();

    await seedRuns(subject, 'COMPLETED', 37);
    await seedRuns(subject, 'PARTIAL', 3);
    // 3/30 = 10% verification failures, above 5%. The transport failures are
    // outside both halves of that rate — an Anthropic outage says nothing
    // about the prompt.
    await seedProseSpend(subject, 'verified', 27);
    await seedProseSpend(subject, 'rejected', 3);
    await seedProseSpend(subject, 'transport', 9);

    const result = await runMfOpsAlertsSweep({ day: DAY, opsUserId: ops });

    expect(result.day).toBe(DAY_LABEL);
    expect(result.analysisPartial.alerted).toBe(true);
    expect(result.proseVerification.verified).toBe(27);
    expect(result.proseVerification.rejected).toBe(3);
    expect(result.proseVerification.alerted).toBe(true);

    const titles = (await alertsFor(ops)).map((a) => a.title).sort();
    expect(titles).toEqual([
      `MF analysis PARTIAL rate: ${DAY_LABEL}`,
      `MF prose verification failures: ${DAY_LABEL}`,
    ]);
  });

  it('is silent on a healthy day', async () => {
    const ops = await createUser('ADMIN');
    const subject = await createUser();
    await seedRuns(subject, 'COMPLETED', 40);
    await seedProseSpend(subject, 'verified', PROSE_VERIFICATION_MIN_SAMPLE + 5);

    const result = await runMfOpsAlertsSweep({ day: DAY, opsUserId: ops });

    expect(result.analysisPartial.alerted).toBe(false);
    expect(result.proseVerification.alerted).toBe(false);
    expect(await alertsFor(ops)).toHaveLength(0);
  });
});
