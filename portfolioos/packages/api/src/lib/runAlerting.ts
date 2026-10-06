/**
 * Telling somebody when a scheduled run does not produce what it should.
 *
 * ── Why this is one function ─────────────────────────────────────
 * There were two, written on branches that could not see each other:
 * `captureFeedFailure` for a market feed that came back thin, and
 * `captureJobFailure` for a scoring run that refused to write. Same tag
 * vocabulary, same fingerprint strategy, same reason for existing — and, once
 * both landed, two places to change when the shape of an alert needs to move.
 *
 * They are merged here rather than in `priceFeeds/`, because the advisor now
 * calls it too and an advisor module importing from a price-feed module to
 * reach Sentry is a dependency that says nothing true about the code.
 *
 * ── Why it exists at all ─────────────────────────────────────────
 * Verified before it was written, and the answer was no:
 * `Sentry.setupExpressErrorHandler` covers request handlers; the Bull queues
 * log their `failed` events without capturing them; and both the AMFI sync
 * and the nightly scoring job are `node-cron` jobs whose wrappers catch, log
 * and keep the process up on purpose. A tripped canary — or a refused scoring
 * run — produced one `logger.error` line and no alert. For a system whose
 * whole failure mode is "looks fine, is not", that is not enough.
 *
 * ── Shape ────────────────────────────────────────────────────────
 * Tags for the identifying fields, because tags are searchable and groupable:
 * "every amfi_nav trip this month" should be a query. Numbers go in
 * `contexts`, readable without being indexed.
 *
 * Fingerprints keep feed and scoring failures apart, deliberately. A feed
 * groups by (feed, failure mode) so a week of nightly trips is one issue with
 * seven events. A scoring refusal groups by (job, check) for the same reason,
 * and separately, because "AMFI came back thin" and "we declined to rank on a
 * calendar we do not trust" are different incidents with different fixes.
 */

import { Sentry } from './sentry.js';

/** Where a failure came from. Mirrors `FeedRunLog.kind`. */
export type RunKind = 'FEED' | 'SCORING';

export interface RunFailureMeta {
  kind: RunKind;
  /** Feed key, e.g. "amfi_nav", or the job name, e.g. "fund_scoring". */
  subject: string;
  /** Which check reported: "canary", "calendar_integrity". */
  check: string;
  /** The FeedRunLog row this wrote, so an alert traces to a row. */
  runId: string | null;
  /** One sentence a human can act on. */
  reason: string | null;
  /**
   * How it failed, for the fingerprint's last segment. Feeds use
   * "tripped" / "threw"; a scoring run uses "refused".
   */
  outcome: 'tripped' | 'threw' | 'refused';
  /** Numbers worth reading, not worth indexing. */
  context?: Record<string, unknown>;
}

export function captureFeedFailure(err: unknown, meta: RunFailureMeta): void {
  const feedLike = meta.kind === 'FEED';
  Sentry.captureException(err, {
    level: 'error',
    tags: {
      run_kind: meta.kind,
      // `feed` is kept as the tag name for both kinds rather than renamed:
      // existing Sentry saved searches and alert rules are keyed on it, and a
      // rename would silently orphan them.
      feed: meta.subject,
      feed_run_id: meta.runId ?? 'unwritten',
      run_check: meta.check,
      canary_verdict: meta.outcome,
      canary_reason: meta.reason ?? 'no reason recorded',
    },
    contexts: {
      feed_run: {
        kind: meta.kind,
        subject: meta.subject,
        check: meta.check,
        runId: meta.runId,
        ...(meta.context ?? {}),
      },
    },
    fingerprint: feedLike
      ? ['feed-canary', meta.subject, meta.outcome]
      : ['job-refused', meta.subject, meta.check],
  });
}
