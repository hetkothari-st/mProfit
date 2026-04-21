/**
 * §6.7 monitored-sender poller.
 *
 * Runs periodically per Gmail account. For a given account it:
 *   1. Looks up the user's active `MonitoredSender` rows.
 *   2. Builds a single Gmail query `(from:a OR from:b ...) after:<floor>`.
 *   3. Paginates message ids, capped to keep one tick bounded.
 *   4. For each id, fetches `format:'full'`, matches the From header
 *      back to one of the monitored senders, and dispatches through
 *      `processEmail` — which owns idempotency, the LLM gate, budget
 *      archival, and DLQ routing (§3.3, §3.5, §6.11).
 *   5. Advances each sender's `lastFetchedAt` to the scan start time.
 *
 * The poller itself is intentionally free of LLM / Prisma / decryption
 * business logic — those concerns live in `pipeline.ts` and the LLM
 * client. That separation lets us reason about "did we fetch X" apart
 * from "did we persist X".
 *
 * RLS: the caller (`mailboxPoller.pollAllMailboxes`) already wraps each
 * account in `runAsUser(userId, ...)` so every DB op here is tenant-
 * scoped by Postgres policy (§3.6).
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import type { MonitoredSender } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getAuthorizedClientFor } from '../../connectors/gmail.connector.js';
import { parseFromHeader } from './headers.js';
import {
  processEmail,
  type ProcessEmailDeps,
  type ProcessEmailOutcome,
} from './pipeline.js';

/**
 * Safety caps — keep one poll tick bounded even if a user has hundreds
 * of monitored senders or a long backfill window.
 */
const MAX_MESSAGES_PER_TICK = 500;
const MESSAGES_PER_PAGE = 100;

/**
 * Fallback backfill window when a sender has never been fetched before.
 * Pinned to §17 default (2 years) to match discovery. Chosen so a
 * first-ever poll surfaces enough history that the Review UI isn't
 * empty while the user is paying attention.
 */
const FIRST_RUN_LOOKBACK_DAYS = 730;

export interface PollResult {
  /** Count of Gmail messages the poller examined. */
  processed: number;
  /** Skipped due to existing CanonicalEvent with the same sourceHash. */
  skippedDuplicate: number;
  /** Skipped due to empty body. */
  skippedEmpty: number;
  /** CanonicalEvents newly inserted (PARSED or PENDING_REVIEW). */
  created: number;
  /** CanonicalEvents archived because the LLM budget was capped. */
  archived: number;
  /** Gate-closed (LLM disabled / key missing) — one DLQ row each. */
  gateClosed: number;
  /** Parse/api failures routed to DLQ. */
  failed: number;
  /** Messages where we couldn't match the From header to any monitored sender. */
  unmatched: number;
  /** Messages that the fetch step itself rejected — network, 404, etc. */
  fetchErrors: number;
}

interface PollDeps {
  /** Override for tests — supply a pre-built Gmail client. */
  gmailClient?: gmail_v1.Gmail;
  /** Override for tests — replace the pipeline call-site. */
  processEmail?: typeof processEmail;
  /** Passed straight through to processEmail for LLM/gate injection. */
  processEmailDeps?: ProcessEmailDeps;
  /**
   * `now` is injectable so tests can assert `lastFetchedAt` was advanced
   * to the tick start (not to a moving target).
   */
  now?: () => Date;
}

/**
 * Format a Date as `YYYY/MM/DD` — the one shape Gmail's `after:`
 * operator accepts. Timezone is deliberately UTC: Gmail's server-side
 * match is by day, and a small timezone skew just widens the window,
 * which is safer than narrowing it.
 */
function formatGmailAfterDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/**
 * Earliest sender fetch time. Senders seen for the first time force a
 * full §17 default lookback; existing senders advance from the oldest
 * pointer so no sender is starved even if the list is mixed.
 */
function earliestSince(senders: readonly MonitoredSender[], now: Date): Date {
  let earliest: Date | null = null;
  for (const s of senders) {
    const t = s.lastFetchedAt ?? null;
    if (!t) {
      // Any never-fetched sender pins the floor to the default window.
      const cutoff = new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      return cutoff;
    }
    if (!earliest || t < earliest) earliest = t;
  }
  return earliest ?? new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Build `(from:x OR from:y ...) after:YYYY/MM/DD`. Address strings come
 * from `MonitoredSender.address` which is trusted (it was set by the
 * discovery step, not by raw user input), so we don't escape — a
 * malformed address would just fail to match and waste a search slot.
 */
export function buildPollQuery(senders: readonly MonitoredSender[], since: Date): string {
  const fromClause = senders.map((s) => `from:${s.address}`).join(' OR ');
  return `(${fromClause}) after:${formatGmailAfterDate(since)} -in:trash -in:spam`;
}

async function listMessageIds(
  gmail: gmail_v1.Gmail,
  query: string,
  cap: number,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(MESSAGES_PER_PAGE, cap - ids.length),
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.id) ids.push(m.id);
      if (ids.length >= cap) break;
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < cap);
  return ids;
}

/**
 * Match the message's From header to one of the user's active senders.
 * Returns `null` when the header is unparseable or the address isn't in
 * the monitored list — the caller tallies these as `unmatched` so the
 * operator can spot a query drifting or a spoofed-from bug.
 */
function matchSender(
  from: string | null,
  byAddress: ReadonlyMap<string, MonitoredSender>,
): MonitoredSender | null {
  const { address } = parseFromHeader(from);
  if (!address) return null;
  return byAddress.get(address) ?? null;
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function zeroResult(): PollResult {
  return {
    processed: 0,
    skippedDuplicate: 0,
    skippedEmpty: 0,
    created: 0,
    archived: 0,
    gateClosed: 0,
    failed: 0,
    unmatched: 0,
    fetchErrors: 0,
  };
}

function tallyOutcome(result: PollResult, outcome: ProcessEmailOutcome): void {
  switch (outcome.kind) {
    case 'skipped_duplicate':
      result.skippedDuplicate++;
      return;
    case 'skipped_empty_body':
      result.skippedEmpty++;
      return;
    case 'gate_closed':
      result.gateClosed++;
      return;
    case 'archived_over_budget':
      result.archived++;
      return;
    case 'failed':
      result.failed++;
      return;
    case 'created':
      // A single email can produce many rows (statement with N lines);
      // count the *rows* so dashboards reflect real output, not the
      // message count which we already report as `processed`.
      result.created += outcome.eventIds.length;
      return;
  }
}

/**
 * Run one poll tick for one Gmail account. Public entry point — the
 * parent scheduler wraps with `runAsUser` for RLS.
 */
export async function pollMonitoredSendersForAccount(
  accountId: string,
  deps: PollDeps = {},
): Promise<PollResult> {
  const now = deps.now?.() ?? new Date();
  const acc = await prisma.mailboxAccount.findUnique({ where: { id: accountId } });
  if (!acc || !acc.isActive || acc.provider !== 'GMAIL_OAUTH') {
    return zeroResult();
  }

  const senders = await prisma.monitoredSender.findMany({
    where: { userId: acc.userId, isActive: true },
  });
  if (senders.length === 0) return zeroResult();

  const byAddress = new Map<string, MonitoredSender>();
  for (const s of senders) byAddress.set(s.address.toLowerCase(), s);

  const since = earliestSince(senders, now);
  const query = buildPollQuery(senders, since);

  const gmail =
    deps.gmailClient ??
    google.gmail({
      version: 'v1',
      auth: await getAuthorizedClientFor(accountId),
    });

  const ids = await listMessageIds(gmail, query, MAX_MESSAGES_PER_TICK);
  const result = zeroResult();

  const processOne = deps.processEmail ?? processEmail;

  for (const id of ids) {
    result.processed++;
    let message: gmail_v1.Schema$Message;
    try {
      const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      message = res.data;
    } catch (err) {
      // A single 404/transient failure shouldn't stop the tick — the
      // message will re-appear on the next `list` call or simply be
      // gone. DLQ-worthy failures happen further in, inside the
      // pipeline.
      result.fetchErrors++;
      logger.warn(
        { err, accountId, messageId: id },
        'gmail.poller.message_fetch_failed',
      );
      continue;
    }

    const from = headerValue(message.payload?.headers ?? undefined, 'From');
    const sender = matchSender(from, byAddress);
    if (!sender) {
      // The user narrowed their monitored list (or Gmail's `from:`
      // matched a forwarded envelope), so the From header doesn't
      // line up. Counting these separately gives us signal if the
      // discovery step ever starts leaking addresses.
      result.unmatched++;
      continue;
    }

    const outcome = await processOne(
      {
        userId: acc.userId,
        senderAddress: sender.address,
        autoCommitEnabled: sender.autoCommitEnabled,
        messageId: id,
        message,
      },
      deps.processEmailDeps ?? {},
    );
    tallyOutcome(result, outcome);
  }

  // Advance every active sender to the tick start. Doing this even when
  // the tick was a no-op means we don't re-scan the same empty window
  // forever if a sender goes quiet. The start-of-tick timestamp (not
  // end) protects us from losing messages that landed *during* the
  // scan: next tick re-includes them and idempotency dedupes.
  await prisma.monitoredSender.updateMany({
    where: { userId: acc.userId, isActive: true },
    data: { lastFetchedAt: now },
  });

  logger.info(
    { accountId, userId: acc.userId, query, ...result },
    'gmail.poller.tick_complete',
  );
  return result;
}
