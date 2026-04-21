/**
 * §6.6 inbox discovery scan.
 *
 * Given a connected Gmail account, list the senders whose recent mail
 * looks financial, so the user can pick which ones to monitor going
 * forward. This runs once per account (on connect, or when the user
 * explicitly asks to re-scan).
 *
 * The scan is bounded on three axes to keep latency and API quota in
 * check:
 *   1. Time window: default 2 years (§17 default). Tunable per call.
 *   2. Message cap: we stop after `MAX_MESSAGES` metadata fetches even
 *      if the query matches more. A user with 50k financial emails
 *      doesn't need all of them ranked — the top senders will surface
 *      from any reasonable sample.
 *   3. Broad keyword query: we let Gmail do the initial filter server-
 *      side with a conservative OR-of-financial-terms. This eliminates
 *      the bulk of marketing mail before we spend metadata-list quota.
 *
 * Result: a ranked list of {address, displayName, score, ...} that the
 * Review UI presents as checkboxes.
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { getAuthorizedClientFor } from '../../connectors/gmail.connector.js';
import { parseFromHeader } from './headers.js';
import { DISCOVERY_THRESHOLD, scoreSender } from './keywords.js';

/**
 * Broad Gmail search query. These are ORed together and then intersected
 * with the time window. Kept intentionally generic: we want a 2× over-
 * fetch here so the *scoring* step does the real financial/not-financial
 * decision — if the Gmail query were too narrow we'd silently hide
 * senders that use unusual phrasing.
 *
 * The precise keyword list overlaps with `FINANCIAL_KEYWORDS` in
 * keywords.ts but doesn't have to match exactly — Gmail does substring
 * matching on most terms, so "transaction" here also catches "txn".
 */
const DISCOVERY_QUERY_TERMS = [
  'credit',
  'debit',
  'transaction',
  'UPI',
  'NEFT',
  'IMPS',
  'RTGS',
  'dividend',
  'EMI',
  'premium',
  'policy',
  '"contract note"',
  'NAV',
  'folio',
  '"fixed deposit"',
  'statement',
  'maturity',
];

/**
 * Safety caps. A Gmail inbox with 20 years of financial mail could
 * easily match >10k messages; we cap to keep the scan latency under
 * ~60s and stay within daily quota. Top senders almost always surface
 * from the first few hundred hits anyway.
 */
const MAX_MESSAGES = 1000;
const MESSAGES_PER_PAGE = 100;

/** Per-sender, how many recent subject samples to keep for the UI preview. */
const MAX_SAMPLE_SUBJECTS = 5;

export interface DiscoveredSender {
  /** Lowercased email address — stable grouping key. */
  address: string;
  /** Most common display name seen from this sender, if any. */
  displayName: string | null;
  /** How many messages from this sender fell into the scan window. */
  messageCount: number;
  /** §6.6 weighted keyword score. */
  score: number;
  /** A handful of recent subjects for the UI to render as preview chips. */
  recentSubjects: string[];
}

interface SenderAccumulator {
  address: string;
  displayName: string | null;
  messageCount: number;
  subjects: string[];
  snippets: string[];
}

function buildDiscoveryQuery(lookbackDays: number): string {
  const terms = DISCOVERY_QUERY_TERMS.join(' OR ');
  // `-in:trash -in:spam` keeps the scan honest even if the user has
  // been aggressive with rules. A legit bank alert should never land in
  // those folders anyway.
  return `newer_than:${lookbackDays}d -in:trash -in:spam (${terms})`;
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

/**
 * Paginated message-list until we hit either the query's end or our
 * cap. Returns just the ids; metadata is fetched in a second pass so
 * any single bad message doesn't waste the whole list call.
 */
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
 * Fetch `From`, `Subject`, and snippet for each id and fold into the
 * per-sender accumulators. We ask Gmail for `metadata` format (not
 * `full`) so we pay no bandwidth for the message body we don't use.
 */
async function collectSenders(
  gmail: gmail_v1.Gmail,
  ids: readonly string[],
): Promise<Map<string, SenderAccumulator>> {
  const bySender = new Map<string, SenderAccumulator>();
  for (const id of ids) {
    let msg: gmail_v1.Schema$Message;
    try {
      const res = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      });
      msg = res.data;
    } catch {
      // A missing/deleted message shouldn't kill the scan. Skip it; the
      // total sample is still statistically fine without one message.
      continue;
    }

    const headers = msg.payload?.headers ?? undefined;
    const fromRaw = headerValue(headers, 'From');
    const subject = headerValue(headers, 'Subject') ?? '';
    const snippet = msg.snippet ?? '';

    const { address, displayName } = parseFromHeader(fromRaw);
    if (!address) continue; // can't group without an address key

    let acc = bySender.get(address);
    if (!acc) {
      acc = {
        address,
        displayName,
        messageCount: 0,
        subjects: [],
        snippets: [],
      };
      bySender.set(address, acc);
    }
    acc.messageCount += 1;
    // Prefer a display name the *first* time we see one. Later values
    // are often marketing variants ("HDFC Bank Offers" vs "HDFC Bank"),
    // and the first hit is usually the cleanest.
    if (!acc.displayName && displayName) acc.displayName = displayName;
    acc.subjects.push(subject);
    acc.snippets.push(snippet);
  }
  return bySender;
}

export interface DiscoverOptions {
  /** How many days back to scan. Default §17 = 730 (2 years). */
  lookbackDays?: number;
  /** Hard cap on metadata fetches. Default MAX_MESSAGES. */
  maxMessages?: number;
}

/**
 * Top-level discovery entry point. Exported for the UI endpoint and
 * for tests (which inject a fake `gmail` client via `_runDiscovery`).
 */
export async function discoverFinancialSenders(
  accountId: string,
  opts: DiscoverOptions = {},
): Promise<DiscoveredSender[]> {
  const auth = await getAuthorizedClientFor(accountId);
  const gmail = google.gmail({ version: 'v1', auth });
  return _runDiscovery(gmail, opts);
}

/**
 * Test seam. Takes an already-constructed Gmail client (or a mock) so
 * unit tests don't have to touch googleapis / OAuth. Keeps the public
 * entry point free of parameter noise.
 */
export async function _runDiscovery(
  gmail: gmail_v1.Gmail,
  opts: DiscoverOptions = {},
): Promise<DiscoveredSender[]> {
  const lookbackDays = opts.lookbackDays ?? 730;
  const cap = Math.max(1, Math.min(opts.maxMessages ?? MAX_MESSAGES, MAX_MESSAGES));

  const query = buildDiscoveryQuery(lookbackDays);
  const ids = await listMessageIds(gmail, query, cap);
  if (ids.length === 0) return [];

  const bySender = await collectSenders(gmail, ids);

  const candidates: DiscoveredSender[] = [];
  for (const acc of bySender.values()) {
    const score = scoreSender(acc.subjects, acc.snippets);
    if (score < DISCOVERY_THRESHOLD) continue;
    candidates.push({
      address: acc.address,
      displayName: acc.displayName,
      messageCount: acc.messageCount,
      score,
      recentSubjects: acc.subjects.slice(0, MAX_SAMPLE_SUBJECTS),
    });
  }

  // Highest-scoring first; break ties by message volume so a chatty
  // sender with a solid score outranks a one-off with the same score.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.messageCount - a.messageCount;
  });
  return candidates;
}
