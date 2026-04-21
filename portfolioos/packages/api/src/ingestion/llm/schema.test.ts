import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_TOOL_JSON_SCHEMA,
  LLM_EVENT_TYPES,
  ParsedEventsSchema,
} from './schema.js';

/**
 * §6.1 cross-check: the Zod validator and the JSON Schema handed to the
 * Anthropic tool must describe the same shape. If one drifts from the
 * other, Haiku will happily generate an "event_type" we don't support
 * and the resulting parse will fail Zod in production instead of in CI.
 */
describe('LLM schema', () => {
  it('JSON Schema enum matches Zod enum for event_type', () => {
    const jsonEnum = (
      ANTHROPIC_TOOL_JSON_SCHEMA.properties.events.items.properties
        .event_type as { enum: readonly string[] }
    ).enum;
    expect([...jsonEnum].sort()).toEqual([...LLM_EVENT_TYPES].sort());
  });

  it('JSON Schema forbids additional properties on each event', () => {
    // Without additionalProperties:false Haiku sometimes invents siblings
    // like "bank_name"; those would then fail Zod and route good events to DLQ.
    expect(
      ANTHROPIC_TOOL_JSON_SCHEMA.properties.events.items.additionalProperties,
    ).toBe(false);
  });

  it('Zod accepts a minimal event', () => {
    const res = ParsedEventsSchema.safeParse({
      events: [
        {
          event_type: 'BUY',
          event_date: '2026-04-15',
          amount: '1234.56',
          quantity: null,
          price: null,
          counterparty: null,
          instrument_isin: null,
          instrument_symbol: null,
          instrument_name: null,
          account_last4: null,
          confidence: 0.9,
          notes: null,
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('Zod rejects event_date not in YYYY-MM-DD', () => {
    const res = ParsedEventsSchema.safeParse({
      events: [
        {
          event_type: 'BUY',
          event_date: '15/04/2026',
          amount: '100',
          quantity: null,
          price: null,
          counterparty: null,
          instrument_isin: null,
          instrument_symbol: null,
          instrument_name: null,
          account_last4: null,
          confidence: 0.9,
          notes: null,
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('Zod rejects an unknown event_type', () => {
    const res = ParsedEventsSchema.safeParse({
      events: [
        {
          event_type: 'FROBNICATE', // not in LLM_EVENT_TYPES
          event_date: '2026-04-15',
          amount: '1',
          quantity: null,
          price: null,
          counterparty: null,
          instrument_isin: null,
          instrument_symbol: null,
          instrument_name: null,
          account_last4: null,
          confidence: 0.9,
          notes: null,
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('Zod clamps confidence to 0–1', () => {
    const tooHigh = ParsedEventsSchema.safeParse({
      events: [
        {
          event_type: 'OTHER',
          event_date: '2026-04-15',
          amount: null,
          quantity: null,
          price: null,
          counterparty: null,
          instrument_isin: null,
          instrument_symbol: null,
          instrument_name: null,
          account_last4: null,
          confidence: 1.5,
          notes: null,
        },
      ],
    });
    expect(tooHigh.success).toBe(false);
  });
});
