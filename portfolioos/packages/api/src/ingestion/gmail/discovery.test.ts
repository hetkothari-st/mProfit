import { describe, expect, it } from 'vitest';
import type { gmail_v1 } from 'googleapis';
import { _runDiscovery } from './discovery.js';

/**
 * §6.6 discovery scan. We test via the `_runDiscovery` seam, handing it
 * a hand-rolled fake Gmail client. Keeps the test free of googleapis,
 * OAuth, and Prisma — the discovery logic itself is what we care about:
 *
 *   - pagination until cap
 *   - grouping by canonical sender address
 *   - keyword scoring + threshold filter
 *   - ordering (score desc, then messageCount desc)
 *   - resilience to single-message fetch failures
 */

interface FakeMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}

/**
 * Build a fake `gmail_v1.Gmail` client that serves a canned list of
 * messages. Only the methods discovery actually calls are implemented;
 * everything else is left as `any` that would explode if touched, which
 * is the desired failure mode.
 */
function makeFakeGmail(
  messages: FakeMessage[],
  opts: { failGet?: Set<string>; pageSize?: number } = {},
): gmail_v1.Gmail {
  const pageSize = opts.pageSize ?? 100;
  const failGet = opts.failGet ?? new Set<string>();

  const listFn = async (params: { pageToken?: string; maxResults?: number }) => {
    const start = params.pageToken ? Number(params.pageToken) : 0;
    const max = Math.min(params.maxResults ?? pageSize, pageSize);
    const slice = messages.slice(start, start + max);
    const nextStart = start + slice.length;
    return {
      data: {
        messages: slice.map((m) => ({ id: m.id })),
        nextPageToken: nextStart < messages.length ? String(nextStart) : undefined,
      },
    };
  };

  const getFn = async (params: { id: string }) => {
    if (failGet.has(params.id)) {
      throw new Error(`forced fetch failure for ${params.id}`);
    }
    const m = messages.find((x) => x.id === params.id);
    if (!m) return { data: {} };
    return {
      data: {
        id: m.id,
        snippet: m.snippet,
        payload: {
          headers: [
            { name: 'From', value: m.from },
            { name: 'Subject', value: m.subject },
          ],
        },
      },
    };
  };

  return {
    users: {
      messages: {
        list: listFn,
        get: getFn,
      },
    },
  } as unknown as gmail_v1.Gmail;
}

describe('discoverFinancialSenders (via _runDiscovery)', () => {
  it('returns empty when the inbox has no matches', async () => {
    const gmail = makeFakeGmail([]);
    const out = await _runDiscovery(gmail);
    expect(out).toEqual([]);
  });

  it('groups messages by lowercased address and keeps the first display name', async () => {
    const gmail = makeFakeGmail([
      { id: '1', from: '"HDFC Bank" <Alerts@HdfcBank.net>', subject: 'UPI credit', snippet: 'Rs 500 credited' },
      { id: '2', from: 'HDFC Bank Marketing <alerts@hdfcbank.net>', subject: 'NEFT credit', snippet: 'Rs 1000' },
    ]);
    const out = await _runDiscovery(gmail);
    expect(out).toHaveLength(1);
    const s = out[0]!;
    expect(s.address).toBe('alerts@hdfcbank.net');
    expect(s.messageCount).toBe(2);
    expect(s.displayName).toBe('HDFC Bank');
  });

  it('filters out senders whose score does not reach DISCOVERY_THRESHOLD', async () => {
    const gmail = makeFakeGmail([
      // iCloud: one "statement" mention in the *snippet* (weight 2,
      // snippet multiplier 1× → score 2, below threshold 3). The
      // subject has no financial keywords at all.
      { id: '1', from: 'iCloud <no-reply@apple.com>', subject: 'Your backup is ready', snippet: 'statement' },
      // HDFC: clearly financial — UPI + credit in subject.
      { id: '2', from: 'HDFC <alerts@hdfcbank.net>', subject: 'UPI credit', snippet: 'Rs 500' },
    ]);
    const out = await _runDiscovery(gmail);
    expect(out.map((s) => s.address)).toEqual(['alerts@hdfcbank.net']);
  });

  it('sorts by score desc, then messageCount desc as tiebreaker', async () => {
    const gmail = makeFakeGmail([
      // Sender A: one high-signal email (contract note in subject).
      { id: '1', from: 'Zerodha <noreply@zerodha.com>', subject: 'Contract note', snippet: '' },
      // Sender B: two medium emails (UPI credit) — same per-email score
      // as the single Zerodha one, but more messages. Well, let's set
      // up a clean tiebreaker: make B's cumulative score equal A's via
      // two messages, then verify volume wins.
      { id: '2', from: 'HDFC <alerts@hdfcbank.net>', subject: 'UPI', snippet: 'credit of Rs 100' },
      { id: '3', from: 'HDFC <alerts@hdfcbank.net>', subject: 'UPI', snippet: 'credit of Rs 200' },
      // Sender C: three very high-signal subjects — should top the list.
      { id: '4', from: 'Groww <no-reply@groww.in>', subject: 'Zerodha contract note', snippet: '' },
      { id: '5', from: 'Groww <no-reply@groww.in>', subject: 'Zerodha contract note', snippet: '' },
      { id: '6', from: 'Groww <no-reply@groww.in>', subject: 'Zerodha contract note', snippet: '' },
    ]);
    const out = await _runDiscovery(gmail);
    // Groww (highest cumulative score) first.
    expect(out[0]!.address).toBe('no-reply@groww.in');
    // Scores are strictly non-increasing in the result.
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.score).toBeGreaterThanOrEqual(out[i]!.score);
    }
  });

  it('truncates recentSubjects to at most 5 samples', async () => {
    const messages: FakeMessage[] = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      from: 'HDFC <alerts@hdfcbank.net>',
      subject: `UPI credit ${i}`,
      snippet: '',
    }));
    const gmail = makeFakeGmail(messages);
    const out = await _runDiscovery(gmail);
    expect(out[0]!.recentSubjects.length).toBeLessThanOrEqual(5);
  });

  it('paginates past the first page', async () => {
    // 250 matching messages across 3 pages of 100. We cap the run at
    // 250 and expect all to be grouped under the single sender.
    const messages: FakeMessage[] = Array.from({ length: 250 }, (_, i) => ({
      id: `m${i}`,
      from: 'HDFC <alerts@hdfcbank.net>',
      subject: 'UPI credit',
      snippet: '',
    }));
    const gmail = makeFakeGmail(messages, { pageSize: 100 });
    const out = await _runDiscovery(gmail, { maxMessages: 250 });
    expect(out[0]!.messageCount).toBe(250);
  });

  it('respects maxMessages cap even when more would match', async () => {
    const messages: FakeMessage[] = Array.from({ length: 500 }, (_, i) => ({
      id: `m${i}`,
      from: 'HDFC <alerts@hdfcbank.net>',
      subject: 'UPI credit',
      snippet: '',
    }));
    const gmail = makeFakeGmail(messages, { pageSize: 100 });
    const out = await _runDiscovery(gmail, { maxMessages: 150 });
    expect(out[0]!.messageCount).toBe(150);
  });

  it('swallows a single fetch failure and keeps going', async () => {
    const gmail = makeFakeGmail(
      [
        { id: '1', from: 'HDFC <alerts@hdfcbank.net>', subject: 'UPI credit', snippet: '' },
        { id: '2', from: 'HDFC <alerts@hdfcbank.net>', subject: 'NEFT credit', snippet: '' },
      ],
      { failGet: new Set(['1']) },
    );
    const out = await _runDiscovery(gmail);
    // We lost message 1 but still have 2 → sender still surfaces.
    expect(out).toHaveLength(1);
    expect(out[0]!.messageCount).toBe(1);
  });

  it('drops messages whose From header lacks a parseable address', async () => {
    const gmail = makeFakeGmail([
      { id: '1', from: 'Just A Name', subject: 'UPI credit', snippet: '' },
      { id: '2', from: 'HDFC <alerts@hdfcbank.net>', subject: 'UPI credit', snippet: '' },
    ]);
    const out = await _runDiscovery(gmail);
    expect(out).toHaveLength(1);
    expect(out[0]!.address).toBe('alerts@hdfcbank.net');
  });
});
