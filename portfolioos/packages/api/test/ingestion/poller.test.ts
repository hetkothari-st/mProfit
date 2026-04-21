import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { gmail_v1 } from 'googleapis';
import type { MonitoredSender } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  buildPollQuery,
  pollMonitoredSendersForAccount,
} from '../../src/ingestion/gmail/poller.js';
import type {
  ProcessEmailInput,
  ProcessEmailOutcome,
} from '../../src/ingestion/gmail/pipeline.js';

/**
 * §6.7 poller. We exercise the orchestration (query building, sender
 * matching, lastFetchedAt advance) against a real Postgres (the test
 * scope creates MailboxAccount + MonitoredSender rows) but swap the
 * Gmail client and `processEmail` function with in-memory fakes so no
 * network or LLM is touched.
 */

interface FakeMessage {
  id: string;
  from: string; // raw From header value
}

function makeFakeGmail(
  messages: FakeMessage[],
  opts: { pageSize?: number; failList?: boolean; failGet?: Set<string> } = {},
): gmail_v1.Gmail {
  const pageSize = opts.pageSize ?? 100;
  const failGet = opts.failGet ?? new Set<string>();
  let lastQuery: string | null = null;

  const listFn = async (params: { q?: string; pageToken?: string; maxResults?: number }) => {
    if (opts.failList) throw new Error('list failure');
    lastQuery = params.q ?? null;
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
    if (failGet.has(params.id)) throw new Error(`forced fetch failure for ${params.id}`);
    const m = messages.find((x) => x.id === params.id);
    if (!m) return { data: {} };
    const body = Buffer.from(`Body of ${m.id}`, 'utf8').toString('base64url');
    return {
      data: {
        id: m.id,
        payload: {
          mimeType: 'text/plain',
          body: { data: body },
          headers: [
            { name: 'From', value: m.from },
            { name: 'Subject', value: 'UPI credit' },
          ],
        },
      } as gmail_v1.Schema$Message,
    };
  };

  const client = {
    users: {
      messages: {
        list: listFn,
        get: getFn,
      },
    },
  } as unknown as gmail_v1.Gmail;

  // Expose the last query for assertions without polluting the real API.
  (client as unknown as { __lastQuery: () => string | null }).__lastQuery = () => lastQuery;
  return client;
}

function lastQuery(gmail: gmail_v1.Gmail): string | null {
  return (gmail as unknown as { __lastQuery: () => string | null }).__lastQuery();
}

async function createMailbox(userId: string): Promise<{ id: string }> {
  return runAsSystem(() =>
    prisma.mailboxAccount.create({
      data: {
        userId,
        provider: 'GMAIL_OAUTH',
        googleEmail: 'test@gmail.com',
        label: 'test',
        isActive: true,
      },
      select: { id: true },
    }),
  );
}

async function addMonitoredSender(
  userId: string,
  address: string,
  opts: {
    autoCommitEnabled?: boolean;
    isActive?: boolean;
    lastFetchedAt?: Date | null;
  } = {},
): Promise<MonitoredSender> {
  return runAsSystem(() =>
    prisma.monitoredSender.create({
      data: {
        userId,
        address,
        autoCommitEnabled: opts.autoCommitEnabled ?? false,
        isActive: opts.isActive ?? true,
        lastFetchedAt: opts.lastFetchedAt ?? null,
      },
    }),
  );
}

describe('pollMonitoredSendersForAccount', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('poller');
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  it('returns zero result when the account has no active monitored senders', async () => {
    const acc = await createMailbox(scope.userId);
    const gmail = makeFakeGmail([]);
    const fakeProcess = vi.fn();

    const out = await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: fakeProcess,
      }),
    );

    expect(out.processed).toBe(0);
    expect(out.created).toBe(0);
    expect(fakeProcess).not.toHaveBeenCalled();
    // No list() call should have been made either — nothing to search for.
    expect(lastQuery(gmail)).toBeNull();
  });

  it('returns zero result when the account is not GMAIL_OAUTH', async () => {
    const acc = await runAsSystem(() =>
      prisma.mailboxAccount.create({
        data: {
          userId: scope.userId,
          provider: 'IMAP',
          host: 'imap.example.com',
          port: 993,
          username: 'u',
          passwordEnc: 'x',
          isActive: true,
        },
        select: { id: true },
      }),
    );
    await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net');

    const out = await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: makeFakeGmail([]),
        processEmail: vi.fn(),
      }),
    );

    expect(out).toEqual({
      processed: 0,
      skippedDuplicate: 0,
      skippedEmpty: 0,
      created: 0,
      archived: 0,
      gateClosed: 0,
      failed: 0,
      unmatched: 0,
      fetchErrors: 0,
    });
  });

  it('builds an OR query over all active monitored senders plus after:', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const since = new Date('2026-04-10T00:00:00.000Z');
    const senders = [
      { address: 'alerts@hdfcbank.net' } as MonitoredSender,
      { address: 'contract@zerodha.com' } as MonitoredSender,
    ];
    const q = buildPollQuery(senders, since);
    expect(q).toContain('from:alerts@hdfcbank.net');
    expect(q).toContain('from:contract@zerodha.com');
    expect(q).toContain(' OR ');
    expect(q).toContain('after:2026/04/10');
    expect(q).toContain('-in:trash');
    expect(q).toContain('-in:spam');
    // sanity: now should postdate since
    expect(since.getTime()).toBeLessThan(now.getTime());
  });

  it('first-run (no lastFetchedAt) scans the full §17 default lookback window', async () => {
    const acc = await createMailbox(scope.userId);
    await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net', { lastFetchedAt: null });

    const now = new Date('2026-04-20T00:00:00.000Z');
    const gmail = makeFakeGmail([]); // empty inbox; we only care about query shape
    await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: vi.fn(),
        now: () => now,
      }),
    );

    // The exact date depends on leap years — compute it the same way the
    // poller does rather than hard-coding and tripping over Feb 29.
    const floor = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
    const expected = `after:${floor.getUTCFullYear()}/${String(
      floor.getUTCMonth() + 1,
    ).padStart(2, '0')}/${String(floor.getUTCDate()).padStart(2, '0')}`;
    expect(lastQuery(gmail)).toContain(expected);
  });

  it('processes matching messages and advances lastFetchedAt to the tick start', async () => {
    const acc = await createMailbox(scope.userId);
    const sender = await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net');

    const messages: FakeMessage[] = [
      { id: 'm1', from: '"HDFC Bank" <alerts@hdfcbank.net>' },
      { id: 'm2', from: 'HDFC <alerts@hdfcbank.net>' },
    ];
    const gmail = makeFakeGmail(messages);
    const fakeProcess = vi.fn().mockResolvedValue({ kind: 'created', eventIds: ['ev-1'] });
    const now = new Date('2026-04-20T10:00:00.000Z');

    const out = await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: fakeProcess,
        now: () => now,
      }),
    );

    expect(out.processed).toBe(2);
    expect(out.created).toBe(2);
    expect(fakeProcess).toHaveBeenCalledTimes(2);

    // Caller received both messageIds with the sender's auto-commit flag.
    const calls = fakeProcess.mock.calls.map((c) => c[0] as { messageId: string; autoCommitEnabled: boolean; senderAddress: string });
    expect(calls.map((c) => c.messageId).sort()).toEqual(['m1', 'm2']);
    expect(calls.every((c) => c.senderAddress === sender.address)).toBe(true);
    expect(calls.every((c) => c.autoCommitEnabled === false)).toBe(true);

    // lastFetchedAt advanced to tick start (not later — tick-end would
    // risk losing messages that landed mid-scan).
    const updated = await runAsSystem(() =>
      prisma.monitoredSender.findUnique({ where: { id: sender.id } }),
    );
    expect(updated!.lastFetchedAt?.getTime()).toBe(now.getTime());
  });

  it('counts messages whose From header does not match any monitored sender as unmatched', async () => {
    const acc = await createMailbox(scope.userId);
    await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net');

    // Gmail's `from:` search can leak a forwarded-envelope match where the
    // real From is different; we defend in code by rechecking.
    const messages: FakeMessage[] = [
      { id: 'm1', from: 'somebody@unknown.example' },
      { id: 'm2', from: '"HDFC Bank" <alerts@hdfcbank.net>' },
    ];
    const gmail = makeFakeGmail(messages);
    const fakeProcess = vi.fn().mockResolvedValue({ kind: 'created', eventIds: [] });

    const out = await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: fakeProcess,
      }),
    );

    expect(out.processed).toBe(2);
    expect(out.unmatched).toBe(1);
    // Only the matched one hits the pipeline.
    expect(fakeProcess).toHaveBeenCalledTimes(1);
    expect((fakeProcess.mock.calls[0]![0] as { messageId: string }).messageId).toBe('m2');
  });

  it('counts message-fetch failures without aborting the tick', async () => {
    const acc = await createMailbox(scope.userId);
    await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net');

    const messages: FakeMessage[] = [
      { id: 'm1', from: 'HDFC <alerts@hdfcbank.net>' },
      { id: 'm2', from: 'HDFC <alerts@hdfcbank.net>' },
    ];
    const gmail = makeFakeGmail(messages, { failGet: new Set(['m1']) });
    const fakeProcess = vi.fn().mockResolvedValue({ kind: 'created', eventIds: ['ev'] });

    const out = await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: fakeProcess,
      }),
    );

    expect(out.processed).toBe(2);
    expect(out.fetchErrors).toBe(1);
    expect(out.created).toBe(1);
    expect(fakeProcess).toHaveBeenCalledTimes(1);
  });

  it('tallies the full pipeline outcome vocabulary', async () => {
    const acc = await createMailbox(scope.userId);
    await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net');

    const messages: FakeMessage[] = [
      { id: 'created-1', from: 'HDFC <alerts@hdfcbank.net>' },
      { id: 'dup-1', from: 'HDFC <alerts@hdfcbank.net>' },
      { id: 'empty-1', from: 'HDFC <alerts@hdfcbank.net>' },
      { id: 'gated-1', from: 'HDFC <alerts@hdfcbank.net>' },
      { id: 'arch-1', from: 'HDFC <alerts@hdfcbank.net>' },
      { id: 'fail-1', from: 'HDFC <alerts@hdfcbank.net>' },
    ];
    const gmail = makeFakeGmail(messages);
    const fakeProcess = async (input: ProcessEmailInput): Promise<ProcessEmailOutcome> => {
      switch (input.messageId) {
        case 'created-1':
          return { kind: 'created', eventIds: ['a', 'b'] };
        case 'dup-1':
          return { kind: 'skipped_duplicate', sourceHash: 'h' };
        case 'empty-1':
          return { kind: 'skipped_empty_body' };
        case 'gated-1':
          return { kind: 'gate_closed', reason: 'disabled' };
        case 'arch-1':
          return { kind: 'archived_over_budget', eventId: 'ev' };
        case 'fail-1':
          return { kind: 'failed', reason: 'api_error' };
      }
      throw new Error(`unexpected ${input.messageId}`);
    };

    const out = await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: fakeProcess,
      }),
    );

    expect(out.processed).toBe(6);
    expect(out.created).toBe(2); // created-1 returned 2 eventIds
    expect(out.skippedDuplicate).toBe(1);
    expect(out.skippedEmpty).toBe(1);
    expect(out.gateClosed).toBe(1);
    expect(out.archived).toBe(1);
    expect(out.failed).toBe(1);
  });

  it('uses the earliest active-sender lastFetchedAt as the search floor', async () => {
    const acc = await createMailbox(scope.userId);
    await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net', {
      lastFetchedAt: new Date('2026-03-15T00:00:00.000Z'),
    });
    await addMonitoredSender(scope.userId, 'contract@zerodha.com', {
      lastFetchedAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const gmail = makeFakeGmail([]);
    await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: vi.fn(),
        now: () => new Date('2026-04-20T00:00:00.000Z'),
      }),
    );

    // Earliest of the two → 2026/03/15 is the floor.
    expect(lastQuery(gmail)).toContain('after:2026/03/15');
  });

  it('ignores inactive monitored senders', async () => {
    const acc = await createMailbox(scope.userId);
    await addMonitoredSender(scope.userId, 'alerts@hdfcbank.net');
    await addMonitoredSender(scope.userId, 'old@defunct.example', { isActive: false });

    const gmail = makeFakeGmail([]);
    await scope.runAs(() =>
      pollMonitoredSendersForAccount(acc.id, {
        gmailClient: gmail,
        processEmail: vi.fn(),
      }),
    );

    const q = lastQuery(gmail);
    expect(q).toContain('from:alerts@hdfcbank.net');
    expect(q).not.toContain('from:old@defunct.example');
  });
});
