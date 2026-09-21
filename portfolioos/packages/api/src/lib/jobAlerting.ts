/**
 * Telling somebody when a scheduled job refuses to do its work.
 *
 * Verified before writing this, on this branch: nothing did.
 * `Sentry.setupExpressErrorHandler` covers request handlers; the Bull queues
 * log their `failed` events without capturing them; and the nightly scoring
 * job is a `node-cron` job whose own wrapper catches, logs and keeps the
 * process up on purpose. A scoring run that refused to write produced one
 * `logger.error` line and nothing else — which, for a system whose whole
 * failure mode is "looks fine, is not", is not enough.
 *
 * ── Shape is deliberate ──────────────────────────────────────────
 * Tags rather than extras for the identifying fields, because tags are
 * searchable and groupable in Sentry: "every calendar_integrity refusal this
 * month" should be a query. The numbers go in `contexts`, where a human can
 * read them without them being indexed.
 *
 * The fingerprint is (job, check), so a week of nightly refusals is one issue
 * with seven events rather than seven issues — which is what makes "how long
 * has this been failing" answerable at a glance.
 *
 * ── Note for whoever merges #135 ─────────────────────────────────
 * The market-feed canary on that branch has `captureFeedFailure`, with the
 * same tag vocabulary and the same fingerprint strategy, because both answer
 * the same question about different subjects. They should become one helper
 * once both land; this file is where that one should live. Until then the
 * duplication is two small functions, which is cheaper than either branch
 * waiting on the other.
 */

import { Sentry } from './sentry.js';

export interface JobFailureMeta {
  /** The job, e.g. "fund_scoring". */
  job: string;
  /** Which check refused, e.g. "calendar_integrity". */
  check: string;
  /** The run record this wrote, so an alert can be traced to a row. */
  runId: string | null;
  /** One sentence a human can act on. */
  reason: string | null;
  /** Numbers worth reading, not worth indexing. */
  context?: Record<string, unknown>;
}

export function captureJobFailure(err: unknown, meta: JobFailureMeta): void {
  Sentry.captureException(err, {
    level: 'error',
    tags: {
      job: meta.job,
      job_check: meta.check,
      job_run_id: meta.runId ?? 'unwritten',
      job_reason: meta.reason ?? 'no reason recorded',
    },
    contexts: {
      job_run: {
        job: meta.job,
        check: meta.check,
        runId: meta.runId,
        ...(meta.context ?? {}),
      },
    },
    fingerprint: ['job-refused', meta.job, meta.check],
  });
}
