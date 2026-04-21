import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { gmail_v1 } from 'googleapis';
import { Decimal as SharedDecimal } from '@portfolioos/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { extractTemplateSlots } from '../../src/ingestion/hash.js';
import {
  applyRecipe,
  findPromotedTemplate,
  recordRecipeMiss,
  recordSample,
  synthesizeRecipe,
  TEMPLATE_SAMPLE_THRESHOLD,
  type RecipeFields,
  type StoredSample,
} from '../../src/ingestion/templates.js';
import { processEmail } from '../../src/ingestion/gmail/pipeline.js';
import type { LlmParseResult } from '../../src/ingestion/llm/client.js';
import type { ParsedEvent } from '../../src/ingestion/llm/schema.js';

/**
 * §6.4 template promotion: LLM→regex recipe synthesis after
 * TEMPLATE_SAMPLE_THRESHOLD agreeing samples, plus pipeline integration
 * (recipe short-circuits the LLM) and confidence-decay on misses.
 */

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a UPI-credit-alert body with caller-chosen amount and date. */
function hdfcUpiBody(amount: string, dateDdmmyyyy: string): string {
  return `Dear Customer,\nYour A/c XXXX1234 has been credited with Rs. ${amount} on ${dateDdmmyyyy} via UPI from Rajesh. Available balance Rs. 100000.00.\nHDFC Bank`;
}

function sampleFor(amount: string, date: string): StoredSample {
  return {
    messageId: `msg-${amount}-${date}`,
    redactedBody: hdfcUpiBody(amount, date),
    event: {
      event_type: 'UPI_CREDIT',
      event_date: date === '15/04/2026' ? '2026-04-15' : date.split('/').reverse().join('-'),
      amount,
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
  };
}

// ─── Pure-function tests ────────────────────────────────────────────

describe('extractTemplateSlots', () => {
  it('returns AMT slots in source order with parsed numeric values', () => {
    const body = 'credit Rs. 500.00 on 15/04/2026. balance Rs. 100000.00';
    const slots = extractTemplateSlots(body);
    const amts = slots.filter((s) => s.slot === 'AMT');
    expect(amts.map((s) => s.normalized)).toEqual(['500.00', '100000.00']);
    expect(amts.map((s) => s.index)).toEqual([0, 1]);
  });

  it('parses DATE slots to ISO-8601', () => {
    const body = 'on 15/04/2026 and again on 2026-05-01 and 03-Jun-2026';
    const dates = extractTemplateSlots(body).filter((s) => s.slot === 'DATE');
    expect(dates.map((s) => s.normalized)).toEqual([
      '2026-04-15',
      '2026-05-01',
      '2026-06-03',
    ]);
  });

  it('does not split ₹100 into an AMT and a NUM', () => {
    const slots = extractTemplateSlots('paid ₹100 today');
    const amts = slots.filter((s) => s.slot === 'AMT');
    const nums = slots.filter((s) => s.slot === 'NUM');
    expect(amts).toHaveLength(1);
    expect(nums).toHaveLength(0);
  });
});

describe('applyRecipe', () => {
  const hdfcRecipe: RecipeFields = {
    event_type: { kind: 'static', value: 'UPI_CREDIT' },
    event_date: { kind: 'slot', slot: 'DATE', index: 0 },
    amount: { kind: 'slot', slot: 'AMT', index: 0 },
    currency: { kind: 'static', value: 'INR' },
    confidence: { kind: 'static', value: 0.9 },
  };

  it('reconstructs a ParsedEvent deterministically', () => {
    const ev = applyRecipe(hdfcRecipe, hdfcUpiBody('750.50', '22/04/2026'));
    expect(ev).not.toBeNull();
    expect(ev!.event_type).toBe('UPI_CREDIT');
    expect(ev!.event_date).toBe('2026-04-22');
    expect(ev!.amount).toBe('750.50');
    expect(ev!.currency).toBe('INR');
  });

  it('returns null when a required slot is missing', () => {
    // No date present → DATE slot 0 unfilled.
    const ev = applyRecipe(hdfcRecipe, 'credit Rs. 500 received');
    expect(ev).toBeNull();
  });

  it('returns null when the event_type static fails zod validation', () => {
    const bogus: RecipeFields = {
      ...hdfcRecipe,
      event_type: { kind: 'static', value: 'NOT_A_REAL_TYPE' },
    };
    expect(applyRecipe(bogus, hdfcUpiBody('500', '15/04/2026'))).toBeNull();
  });
});

describe('synthesizeRecipe', () => {
  it(`refuses to promote below ${TEMPLATE_SAMPLE_THRESHOLD} samples`, () => {
    const samples = Array.from({ length: 5 }, (_, i) =>
      sampleFor(`${100 + i}`, '15/04/2026'),
    );
    expect(synthesizeRecipe(samples)).toBeNull();
  });

  it('promotes when event_type is static and amount/date sit at stable slots', () => {
    const samples = Array.from({ length: TEMPLATE_SAMPLE_THRESHOLD }, (_, i) =>
      sampleFor(`${100 + i}.00`, '15/04/2026'),
    );
    const recipe = synthesizeRecipe(samples);
    expect(recipe).not.toBeNull();
    expect(recipe!.event_type).toEqual({ kind: 'static', value: 'UPI_CREDIT' });
    expect(recipe!.amount).toEqual({ kind: 'slot', slot: 'AMT', index: 0 });
    expect(recipe!.event_date).toEqual({ kind: 'slot', slot: 'DATE', index: 0 });
  });

  it('refuses to promote if event_type drifts between samples', () => {
    const samples = Array.from({ length: TEMPLATE_SAMPLE_THRESHOLD }, (_, i) =>
      sampleFor(`${100 + i}`, '15/04/2026'),
    );
    samples[5]!.event.event_type = 'NEFT_CREDIT';
    expect(synthesizeRecipe(samples)).toBeNull();
  });
});

// ─── DB-backed tests ────────────────────────────────────────────────

describe('recordSample promotion flow', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('templates');
  });
  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.learnedTemplate.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('creates a sampling row on first sight, increments on subsequent samples', async () => {
    const hash = 'struct-abc123';
    const sender = 'alerts@hdfcbank.net';

    const sample = sampleFor('500.00', '15/04/2026');
    await scope.runAs(() =>
      recordSample({
        userId: scope.userId,
        senderAddress: sender,
        bodyStructureHash: hash,
        messageId: sample.messageId,
        redactedBody: sample.redactedBody,
        events: [sample.event],
      }),
    );

    let row = await runAsSystem(() =>
      prisma.learnedTemplate.findFirst({
        where: { userId: scope.userId, bodyStructureHash: hash },
      }),
    );
    expect(row).not.toBeNull();
    expect(row!.sampleCount).toBe(1);
    expect((row!.extractionRecipe as { state: string }).state).toBe('sampling');

    // Append a second sample — stays sampling.
    const second = sampleFor('600.00', '16/04/2026');
    await scope.runAs(() =>
      recordSample({
        userId: scope.userId,
        senderAddress: sender,
        bodyStructureHash: hash,
        messageId: second.messageId,
        redactedBody: second.redactedBody,
        events: [second.event],
      }),
    );
    row = await runAsSystem(() =>
      prisma.learnedTemplate.findFirst({
        where: { userId: scope.userId, bodyStructureHash: hash },
      }),
    );
    expect(row!.sampleCount).toBe(2);
  });

  it(`promotes the template once ${TEMPLATE_SAMPLE_THRESHOLD} agreeing samples accumulate`, async () => {
    const hash = 'struct-promote';
    const sender = 'alerts@hdfcbank.net';

    for (let i = 0; i < TEMPLATE_SAMPLE_THRESHOLD; i++) {
      const s = sampleFor(`${100 + i}.00`, '15/04/2026');
      await scope.runAs(() =>
        recordSample({
          userId: scope.userId,
          senderAddress: sender,
          bodyStructureHash: hash,
          messageId: s.messageId,
          redactedBody: s.redactedBody,
          events: [s.event],
        }),
      );
    }

    const row = await runAsSystem(() =>
      prisma.learnedTemplate.findFirst({
        where: { userId: scope.userId, bodyStructureHash: hash },
      }),
    );
    expect(row).not.toBeNull();
    const recipe = row!.extractionRecipe as { state: string; fields?: RecipeFields };
    expect(recipe.state).toBe('promoted');
    expect(recipe.fields?.event_type).toEqual({ kind: 'static', value: 'UPI_CREDIT' });
    expect(row!.confidenceScore.toString()).toBe('1');

    const promoted = await scope.runAs(() =>
      findPromotedTemplate({
        userId: scope.userId,
        senderAddress: sender,
        bodyStructureHash: hash,
      }),
    );
    expect(promoted).not.toBeNull();
    expect(promoted!.fields.event_type).toEqual({ kind: 'static', value: 'UPI_CREDIT' });
  });

  it('skips multi-event samples (statements) — no row created', async () => {
    const hash = 'struct-multi';
    const ev1 = sampleFor('100', '15/04/2026').event;
    const ev2 = sampleFor('200', '16/04/2026').event;

    await scope.runAs(() =>
      recordSample({
        userId: scope.userId,
        senderAddress: 'statements@hdfcbank.net',
        bodyStructureHash: hash,
        messageId: 'stmt-1',
        redactedBody: 'two events here',
        events: [ev1, ev2],
      }),
    );

    const row = await runAsSystem(() =>
      prisma.learnedTemplate.findFirst({
        where: { userId: scope.userId, bodyStructureHash: hash },
      }),
    );
    expect(row).toBeNull();
  });
});

describe('recordRecipeMiss', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('templatemiss');
  });
  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.learnedTemplate.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('halves confidence on first miss, deactivates on second', async () => {
    const row = await runAsSystem(() =>
      prisma.learnedTemplate.create({
        data: {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          bodyStructureHash: 'struct-miss',
          extractionRecipe: {
            state: 'promoted',
            fields: {
              event_type: { kind: 'static', value: 'UPI_CREDIT' },
              event_date: { kind: 'slot', slot: 'DATE', index: 0 },
            },
            promotedAt: new Date().toISOString(),
          },
          sampleCount: 10,
          confidenceScore: 1,
          version: 1,
          isActive: true,
        },
      }),
    );

    await scope.runAs(() =>
      recordRecipeMiss({ userId: scope.userId, templateId: row.id }),
    );
    let reloaded = await runAsSystem(() =>
      prisma.learnedTemplate.findUnique({ where: { id: row.id } }),
    );
    expect(reloaded!.confidenceScore.toString()).toBe('0.5');
    expect(reloaded!.isActive).toBe(true);

    await scope.runAs(() =>
      recordRecipeMiss({ userId: scope.userId, templateId: row.id }),
    );
    reloaded = await runAsSystem(() =>
      prisma.learnedTemplate.findUnique({ where: { id: row.id } }),
    );
    expect(reloaded!.confidenceScore.toString()).toBe('0');
    expect(reloaded!.isActive).toBe(false);
  });
});

// ─── Pipeline integration ───────────────────────────────────────────

function textMessage(text: string): gmail_v1.Schema$Message {
  const b64 = Buffer.from(text, 'utf8').toString('base64url');
  return {
    id: 'gmail-msg-placeholder',
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

function successLlm(events: ParsedEvent[]) {
  const result: LlmParseResult = {
    ok: true,
    events,
    isMarketing: false,
    usage: {
      inputTokens: 100,
      outputTokens: 30,
      costInr: new SharedDecimal('0.01'),
    },
    budget: {
      status: 'ok',
      spent: new SharedDecimal('0'),
      warn: new SharedDecimal('500'),
      cap: new SharedDecimal('1000'),
    },
    redaction: { pan: 0, aadhaar: 0, account: 0, phone: 0, secret: 0 },
  };
  return async () => result;
}

describe('pipeline + recipe integration', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('pipetpl');
  });
  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.learnedTemplate.deleteMany({ where: { userId: scope.userId } });
      await prisma.canonicalEvent.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('a promoted template short-circuits the LLM call and tags the event with template provenance', async () => {
    // Seed a promoted template directly.
    const body = hdfcUpiBody('1234.56', '20/04/2026');
    // Use real bodyStructureHash so the pipeline's lookup hits.
    const { bodyStructureHash } = await import('../../src/ingestion/hash.js');
    const hash = bodyStructureHash(body);

    const tpl = await runAsSystem(() =>
      prisma.learnedTemplate.create({
        data: {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          bodyStructureHash: hash,
          extractionRecipe: {
            state: 'promoted',
            promotedAt: new Date().toISOString(),
            fields: {
              event_type: { kind: 'static', value: 'UPI_CREDIT' },
              event_date: { kind: 'slot', slot: 'DATE', index: 0 },
              amount: { kind: 'slot', slot: 'AMT', index: 0 },
              currency: { kind: 'static', value: 'INR' },
              confidence: { kind: 'static', value: 0.9 },
            },
          },
          sampleCount: 10,
          confidenceScore: 1,
          version: 1,
          isActive: true,
        },
      }),
    );

    let llmCalled = false;
    const outcome = await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'recipe-hit-1',
          message: textMessage(body),
        },
        {
          parseEmail: async () => {
            llmCalled = true;
            throw new Error('LLM must not be called when recipe applies');
          },
          checkGate: gateOpen,
        },
      ),
    );

    expect(llmCalled).toBe(false);
    expect(outcome.kind).toBe('created');
    if (outcome.kind !== 'created') return;
    expect(outcome.eventIds).toHaveLength(1);

    const row = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: outcome.eventIds[0]! } }),
    );
    expect(row!.sourceAdapter).toBe('gmail.template.v1');
    expect(row!.sourceAdapterVer).toBe('1');
    expect(row!.eventType).toBe('UPI_CREDIT');
    expect(row!.amount!.toFixed(2)).toBe('1234.56');
    const meta = row!.metadata as { template?: { id: string; version: number } } | null;
    expect(meta?.template?.id).toBe(tpl.id);
    expect(meta?.template?.version).toBe(1);
  });

  it('a successful LLM parse records a sample for future promotion', async () => {
    const body = hdfcUpiBody('500.00', '15/04/2026');
    const { bodyStructureHash } = await import('../../src/ingestion/hash.js');
    const hash = bodyStructureHash(body);

    await scope.runAs(() =>
      processEmail(
        {
          userId: scope.userId,
          senderAddress: 'alerts@hdfcbank.net',
          autoCommitEnabled: false,
          messageId: 'learn-1',
          message: textMessage(body),
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

    const row = await runAsSystem(() =>
      prisma.learnedTemplate.findFirst({
        where: { userId: scope.userId, bodyStructureHash: hash },
      }),
    );
    expect(row).not.toBeNull();
    expect(row!.sampleCount).toBe(1);
  });
});
