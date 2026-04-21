import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { gmail_v1 } from 'googleapis';
import { Decimal } from '@portfolioos/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { processEmail } from '../../src/ingestion/gmail/pipeline.js';
import type { LlmParseResult } from '../../src/ingestion/llm/client.js';
import type { ParsedEvent } from '../../src/ingestion/llm/schema.js';
import { gmailSourceHash } from '../../src/ingestion/hash.js';

/**
 * §6.7 per-email pipeline. Tests hand `processEmail` a hand-rolled Gmail
 * message plus fake LLM / gate deps, so we verify the orchestration
 * (idempotency, gate refusal, budget archive, DLQ routing) without
 * touching Anthropic, googleapis, or Prisma mocking machinery.
 */

function textMessage(text: string): gmail_v1.Schema$Message {
  const b64 = Buffer.from(text, 'utf8').toString('base64url');
  return {
    id: 'gmail-msg-placeholder', // overwritten per-test via input.messageId
    payload: {
      mimeType: 'text/plain',
      body: { data: b64 },
      headers: [
        { name: 'From', value: '"HDFC Bank" <alerts@hdfcbank.net>' },
        { name: 'Subject', value: 'UPI credit' },
      ],
    },
  };
}

const gateOpen = (): { ok: true } => ({ ok: true });
const gateDisabled = (): {
  ok: false;
  reason: 'disabled' | 'missing_api_key';
  message: string;
} => ({
  ok: false,
  reason: 'disabled',
  message: 'ENABLE_LLM_PARSER is not "true"',
});

function successLlm(events: ParsedEvent[]) {
  const result: LlmParseResult = {
    ok: true,
    events,
    isMarketing: false,
    usage: {
      inputTokens: 100,
      outputTokens: 30,
      costInr: new Decimal('0.01'),
    },
    budget: {
      status: 'ok',
      spent: new Decimal('0'),
      warn: new Decimal('500'),
      cap: new Decimal('1000'),
    },
    redaction: { pan: 0, aadhaar: 0, account: 0, phone: 0, secret: 0 },
  };
  return async () => result;
}

describe('processEmail pipeline', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('pipeline');
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  it('returns skipped_duplicate when a CanonicalEvent with the same sourceHash already exists', async () => {
    const messageId = 'dup-1';
    const sourceHash = gmailSourceHash(messageId);
    await runAsSystem(() =>
      prisma.canonicalEvent.create({
        data: {
          userId: scope.userId,
          sourceAdapter: 'gmail.generic.v1',
          sourceAdapterVer: '1',
          sourceRef: messageId,
          sourceHash,
          eventType: 'UPI_CREDIT',
          eventDate: new Date('2026-04-15'),
          confidence: 0.9,
          status: 'CONFIRMED',
        },
      }),
    );

    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId,
          message: textMessage('whatever'),
        },
        {
          parseEmail: async () => {
            throw new Error('must not call LLM on duplicate');
          },
          checkGate: gateOpen,
        },
      ),
    );

    expect(outcome.kind).toBe('skipped_duplicate');
    if (outcome.kind === 'skipped_duplicate') {
      expect(outcome.sourceHash).toBe(sourceHash);
    }
  });

  it('skips an empty-body message without touching the LLM', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'empty-1',
          message: { id: 'empty-1', payload: { mimeType: 'multipart/mixed' } },
        },
        {
          parseEmail: async () => {
            throw new Error('must not call LLM for empty-body');
          },
          checkGate: gateOpen,
        },
      ),
    );

    expect(outcome.kind).toBe('skipped_empty_body');
  });

  it('writes an IngestionFailure and returns gate_closed when the LLM gate refuses', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'gated-1',
          message: textMessage('UPI credit of Rs 500'),
        },
        {
          parseEmail: async () => {
            throw new Error('must not call LLM when gate is closed');
          },
          checkGate: gateDisabled,
        },
      ),
    );

    expect(outcome.kind).toBe('gate_closed');

    const dlq = await runAsSystem(() =>
      prisma.ingestionFailure.findMany({
        where: { userId: scope.userId, sourceRef: 'gated-1' },
      }),
    );
    expect(dlq).toHaveLength(1);
    expect(dlq[0]!.errorMessage).toMatch(/llm_gate_closed/);
    expect(dlq[0]!.sourceAdapter).toBe('gmail.generic.v1');
  });

  it('archives an over-budget message with redacted body in metadata', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'cap-1',
          message: textMessage('UPI credit of Rs 500 to A/c 1234567890'),
        },
        {
          parseEmail: async () => ({
            ok: false,
            reason: 'budget_capped',
            message: 'monthly cap reached',
          }),
          checkGate: gateOpen,
        },
      ),
    );

    expect(outcome.kind).toBe('archived_over_budget');
    if (outcome.kind !== 'archived_over_budget') return;

    const row = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: outcome.eventId } }),
    );
    expect(row).not.toBeNull();
    expect(row!.status).toBe('ARCHIVED');
    expect(row!.parserNotes).toMatch(/budget capped/i);

    // Redacted body should be stashed in metadata so a future replay job
    // can re-parse when the next month's budget resets.
    const meta = row!.metadata as { archivedBody?: string } | null;
    expect(meta?.archivedBody).toBeDefined();
    // Redactor must have fired on the 10-digit account run.
    expect(meta!.archivedBody).not.toMatch(/1234567890/);
  });

  it('routes an LLM api_error to the DLQ without persisting the body', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'api-err-1',
          message: textMessage('UPI credit of Rs 500'),
        },
        {
          parseEmail: async () => ({
            ok: false,
            reason: 'api_error',
            message: '503 upstream',
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              costInr: new Decimal('0'),
            },
          }),
          checkGate: gateOpen,
        },
      ),
    );

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') expect(outcome.reason).toBe('api_error');

    const dlq = await runAsSystem(() =>
      prisma.ingestionFailure.findMany({
        where: { userId: scope.userId, sourceRef: 'api-err-1' },
      }),
    );
    expect(dlq).toHaveLength(1);
    expect(dlq[0]!.errorMessage).toMatch(/llm_api_error/);
    expect(dlq[0]!.errorMessage).toMatch(/503/);
    // Raw body must NOT leak into DLQ payload even through the redactor.
    const payload = dlq[0]!.rawPayload as { reason?: string } | null;
    expect(payload?.reason).toBe('api_error');
    expect(JSON.stringify(payload)).not.toMatch(/UPI credit/);
  });

  it('returns created eventIds=[] for a marketing email with no events', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'mkt-1',
          message: textMessage('50% off home loans — apply today'),
        },
        {
          parseEmail: successLlm([]),
          checkGate: gateOpen,
        },
      ),
    );

    expect(outcome.kind).toBe('created');
    if (outcome.kind === 'created') expect(outcome.eventIds).toEqual([]);

    // No CanonicalEvent row should exist for this messageId.
    const hash = gmailSourceHash('mkt-1');
    const row = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({
        where: { userId_sourceHash: { userId: scope.userId, sourceHash: hash } },
      }),
    );
    expect(row).toBeNull();
  });

  it('creates a PENDING_REVIEW CanonicalEvent when autoCommitEnabled is false', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'ev-1',
          message: textMessage('UPI credit of Rs 500'),
        },
        {
          parseEmail: successLlm([
            {
              event_type: 'UPI_CREDIT',
              event_date: '2026-04-15',
              amount: '500.00',
              quantity: null,
              price: null,
              counterparty: 'Rajesh',
              instrument_isin: null,
              instrument_symbol: null,
              instrument_name: null,
              account_last4: '1234',
              currency: 'INR',
              confidence: 0.95,
              notes: null,
            },
          ]),
          checkGate: gateOpen,
        },
      ),
    );

    expect(outcome.kind).toBe('created');
    if (outcome.kind !== 'created') return;
    expect(outcome.eventIds).toHaveLength(1);

    const row = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: outcome.eventIds[0]! } }),
    );
    expect(row).not.toBeNull();
    expect(row!.status).toBe('PENDING_REVIEW');
    expect(row!.eventType).toBe('UPI_CREDIT');
    expect(row!.sourceAdapter).toBe('gmail.generic.v1');
    expect(row!.sourceAdapterVer).toBe('1');
    expect(row!.amount!.toFixed(2)).toBe('500.00');
  });

  it('creates a PARSED CanonicalEvent when autoCommitEnabled is true', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: true,
          messageId: 'ev-auto-1',
          message: textMessage('UPI credit of Rs 500'),
        },
        {
          parseEmail: successLlm([
            {
              event_type: 'UPI_CREDIT',
              event_date: '2026-04-15',
              amount: '500.00',
              quantity: null,
              price: null,
              counterparty: null,
              instrument_isin: null,
              instrument_symbol: null,
              instrument_name: null,
              account_last4: null,
              currency: 'INR',
              confidence: 0.95,
              notes: null,
            },
          ]),
          checkGate: gateOpen,
        },
      ),
    );

    if (outcome.kind !== 'created') throw new Error(`expected created, got ${outcome.kind}`);
    const row = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: outcome.eventIds[0]! } }),
    );
    expect(row!.status).toBe('PARSED');
  });

  it('creates one row per parsed event with distinct hashes for multi-event messages', async () => {
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'statements@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'stmt-1',
          message: textMessage('Statement: 3 transactions'),
        },
        {
          parseEmail: successLlm([
            {
              event_type: 'UPI_CREDIT',
              event_date: '2026-04-10',
              amount: '100.00',
              quantity: null,
              price: null,
              counterparty: null,
              instrument_isin: null,
              instrument_symbol: null,
              instrument_name: null,
              account_last4: null,
              currency: 'INR',
              confidence: 0.9,
              notes: null,
            },
            {
              event_type: 'UPI_DEBIT',
              event_date: '2026-04-11',
              amount: '200.00',
              quantity: null,
              price: null,
              counterparty: null,
              instrument_isin: null,
              instrument_symbol: null,
              instrument_name: null,
              account_last4: null,
              currency: 'INR',
              confidence: 0.9,
              notes: null,
            },
            {
              event_type: 'NEFT_CREDIT',
              event_date: '2026-04-12',
              amount: '300.00',
              quantity: null,
              price: null,
              counterparty: null,
              instrument_isin: null,
              instrument_symbol: null,
              instrument_name: null,
              account_last4: null,
              currency: 'INR',
              confidence: 0.9,
              notes: null,
            },
          ]),
          checkGate: gateOpen,
        },
      ),
    );

    if (outcome.kind !== 'created') throw new Error(`expected created, got ${outcome.kind}`);
    expect(outcome.eventIds).toHaveLength(3);

    const rows = await runAsSystem(() =>
      prisma.canonicalEvent.findMany({
        where: { userId: scope.userId, sourceRef: 'stmt-1' },
        select: { sourceHash: true },
      }),
    );
    const hashes = rows.map((r) => r.sourceHash);
    expect(new Set(hashes).size).toBe(3);
  });

  it('is idempotent on re-dispatch of the same message', async () => {
    const input = {
      userId: scope.userId,
      senderAddress: 'alerts@hdfcbank.net',
      autoCommitEnabled: false,
      messageId: 'idem-1',
      message: textMessage('UPI credit of Rs 500'),
    };
    const deps = {
      parseEmail: successLlm([
        {
          event_type: 'UPI_CREDIT' as const,
          event_date: '2026-04-15',
          amount: '500.00',
          quantity: null,
          price: null,
          counterparty: null,
          instrument_isin: null,
          instrument_symbol: null,
          instrument_name: null,
          account_last4: null,
          currency: 'INR',
          confidence: 0.95,
          notes: null,
        },
      ]),
      checkGate: gateOpen,
    };

    const first = await scope.runAs(() => processEmail(input, deps));
    const second = await scope.runAs(() => processEmail(input, deps));
    expect(first.kind).toBe('created');
    expect(second.kind).toBe('skipped_duplicate');

    const rows = await runAsSystem(() =>
      prisma.canonicalEvent.findMany({
        where: { userId: scope.userId, sourceRef: 'idem-1' },
      }),
    );
    expect(rows).toHaveLength(1);
  });
});
