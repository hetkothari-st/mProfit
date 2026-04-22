import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@portfolioos/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { env } from '../../src/config/env.js';

/**
 * Shared mock for the Anthropic SDK. Each test case configures
 * `mockCreate` to return / throw what it needs before invoking the
 * client. The default client module imports `Anthropic` as a default
 * export, instantiates it, and calls `.messages.create` — so our mock
 * replicates exactly that shape.
 */
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

// Import AFTER vi.mock so the mocked SDK is wired in.
const {
  checkLlmGate,
  parseEmailWithLlm,
  recordSpend,
  __resetLlmClientForTests,
} = await import('../../src/ingestion/llm/client.js');

const envAny = env as unknown as Record<string, string | undefined>;

function withEnv(
  overrides: Partial<
    Record<'ENABLE_LLM_PARSER' | 'ANTHROPIC_API_KEY' | 'NODE_ENV', string | undefined>
  >,
): () => void {
  const snap = {
    ENABLE_LLM_PARSER: envAny.ENABLE_LLM_PARSER,
    ANTHROPIC_API_KEY: envAny.ANTHROPIC_API_KEY,
    NODE_ENV: envAny.NODE_ENV,
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete envAny[k];
    else envAny[k] = v;
  }
  __resetLlmClientForTests();
  return () => {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete envAny[k];
      else envAny[k] = v;
    }
    __resetLlmClientForTests();
  };
}

describe('LLM client', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('llm-client');
    mockCreate.mockReset();
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  describe('checkLlmGate', () => {
    it('refuses when ENABLE_LLM_PARSER is not "true"', () => {
      const restore = withEnv({ ENABLE_LLM_PARSER: 'false', ANTHROPIC_API_KEY: 'sk-xxx', NODE_ENV: 'production' });
      try {
        const g = checkLlmGate();
        expect(g.ok).toBe(false);
        if (!g.ok) expect(g.reason).toBe('disabled');
      } finally {
        restore();
      }
    });

    it('refuses when ANTHROPIC_API_KEY is missing', () => {
      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: undefined });
      try {
        const g = checkLlmGate();
        expect(g.ok).toBe(false);
        if (!g.ok) expect(g.reason).toBe('missing_api_key');
      } finally {
        restore();
      }
    });

    it('passes when both flags are set', () => {
      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: 'sk-test' });
      try {
        expect(checkLlmGate().ok).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe('parseEmailWithLlm gate behaviour', () => {
    it('returns disabled without calling the SDK', async () => {
      const restore = withEnv({ ENABLE_LLM_PARSER: 'false', ANTHROPIC_API_KEY: 'sk-test', NODE_ENV: 'production' });
      try {
        const r = await scope.runAs(() =>
          parseEmailWithLlm({
            userId: scope.userId,
            emailBody: 'hello',
            sourceRef: 'test-1',
            purpose: 'unit-test',
          }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('disabled');
        expect(mockCreate).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('returns missing_api_key without calling the SDK', async () => {
      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: undefined });
      try {
        const r = await scope.runAs(() =>
          parseEmailWithLlm({
            userId: scope.userId,
            emailBody: 'hello',
            sourceRef: 'test-2',
            purpose: 'unit-test',
          }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('missing_api_key');
        expect(mockCreate).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('refuses when monthly budget is capped and records no ledger row', async () => {
      // Push spend past the cap so budget returns status='capped'.
      await runAsSystem(async () => {
        await prisma.llmSpend.create({
          data: {
            userId: scope.userId,
            model: 'test',
            inputTokens: 0,
            outputTokens: 0,
            costInr: '1001.0000',
            purpose: 'pre-cap-fill',
            success: true,
          },
        });
      });

      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: 'sk-test' });
      try {
        const r = await scope.runAs(() =>
          parseEmailWithLlm({
            userId: scope.userId,
            emailBody: 'hello',
            sourceRef: 'test-capped',
            purpose: 'unit-test',
          }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('budget_capped');
        expect(mockCreate).not.toHaveBeenCalled();
        const rows = await runAsSystem(() =>
          prisma.llmSpend.findMany({
            where: { userId: scope.userId, sourceRef: 'test-capped' },
          }),
        );
        // No ledger row for the refused call — spend didn't happen.
        expect(rows).toHaveLength(0);
      } finally {
        restore();
      }
    });
  });

  describe('parseEmailWithLlm happy path', () => {
    it('parses a tool_use block and records a successful spend row', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_test',
        stop_reason: 'tool_use',
        usage: { input_tokens: 1500, output_tokens: 80 },
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'emit_events',
            input: {
              events: [
                {
                  event_type: 'UPI_CREDIT',
                  event_date: '2026-04-15',
                  amount: '450.00',
                  quantity: null,
                  price: null,
                  counterparty: 'Rajesh Kumar',
                  instrument_isin: null,
                  instrument_symbol: null,
                  instrument_name: null,
                  account_last4: '1234',
                  currency: 'INR',
                  confidence: 0.97,
                  notes: null,
                },
              ],
            },
          },
        ],
      });

      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: 'sk-test' });
      try {
        const r = await scope.runAs(() =>
          parseEmailWithLlm({
            userId: scope.userId,
            // 10-digit account — out of Aadhaar's 12-exact range so it
            // lands in the labelled-account redactor as intended.
            emailBody: 'You received ₹450 from Rajesh (A/c 1234567890)',
            sourceRef: 'gmail-happy-1',
            purpose: 'gmail_parse',
          }),
        );
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.events).toHaveLength(1);
          expect(r.events[0].event_type).toBe('UPI_CREDIT');
          expect(r.usage.inputTokens).toBe(1500);
          expect(r.usage.outputTokens).toBe(80);
          // PII redactor should have masked the 12-digit A/c run.
          expect(r.redaction.account).toBeGreaterThanOrEqual(1);
        }

        const rows = await runAsSystem(() =>
          prisma.llmSpend.findMany({
            where: { userId: scope.userId, sourceRef: 'gmail-happy-1' },
          }),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].success).toBe(true);
        expect(rows[0].inputTokens).toBe(1500);
        expect(rows[0].outputTokens).toBe(80);
        expect(rows[0].purpose).toBe('gmail_parse');
      } finally {
        restore();
      }
    });

    it('records a failed ledger row when Anthropic throws', async () => {
      mockCreate.mockRejectedValueOnce(new Error('503 upstream'));

      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: 'sk-test' });
      try {
        const r = await scope.runAs(() =>
          parseEmailWithLlm({
            userId: scope.userId,
            emailBody: 'anything',
            sourceRef: 'gmail-503',
            purpose: 'gmail_parse',
          }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.reason).toBe('api_error');
          expect(r.message).toMatch(/503/);
        }

        const rows = await runAsSystem(() =>
          prisma.llmSpend.findMany({
            where: { userId: scope.userId, sourceRef: 'gmail-503' },
          }),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].success).toBe(false);
        expect(rows[0].errorMessage).toMatch(/503/);
        // 0-token rows so a flaky upstream that charges $0 doesn't count.
        expect(rows[0].inputTokens).toBe(0);
      } finally {
        restore();
      }
    });

    it('returns validation_error when tool output violates schema', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_bad',
        stop_reason: 'tool_use',
        usage: { input_tokens: 200, output_tokens: 20 },
        content: [
          {
            type: 'tool_use',
            id: 'tu_bad',
            name: 'emit_events',
            input: {
              events: [
                {
                  // Missing required fields + event_type not in enum
                  event_type: 'NOT_A_TYPE',
                  event_date: 'yesterday',
                  confidence: 0.5,
                },
              ],
            },
          },
        ],
      });

      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: 'sk-test' });
      try {
        const r = await scope.runAs(() =>
          parseEmailWithLlm({
            userId: scope.userId,
            emailBody: 'anything',
            sourceRef: 'gmail-bad-shape',
            purpose: 'gmail_parse',
          }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('validation_error');
      } finally {
        restore();
      }
    });

    it('returns no_tool_use when model replies with text only', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_text',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 10 },
        content: [{ type: 'text', text: 'I refuse.' }],
      });

      const restore = withEnv({ ENABLE_LLM_PARSER: 'true', ANTHROPIC_API_KEY: 'sk-test' });
      try {
        const r = await scope.runAs(() =>
          parseEmailWithLlm({
            userId: scope.userId,
            emailBody: 'anything',
            sourceRef: 'gmail-text',
            purpose: 'gmail_parse',
          }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('no_tool_use');
      } finally {
        restore();
      }
    });
  });

  describe('recordSpend', () => {
    it('writes a row under the caller user context', async () => {
      await scope.runAs(() =>
        recordSpend({
          userId: scope.userId,
          model: 'test-model',
          inputTokens: 10,
          outputTokens: 5,
          costInr: new Decimal('0.1234'),
          purpose: 'unit-test',
          sourceRef: 'direct-recordSpend',
          success: true,
        }),
      );
      const rows = await runAsSystem(() =>
        prisma.llmSpend.findMany({
          where: { userId: scope.userId, sourceRef: 'direct-recordSpend' },
        }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].costInr.toFixed(4)).toBe('0.1234');
    });
  });
});
