import { z } from 'zod';

/**
 * CLAUDE.md §6.1 — the LLM parser contract.
 *
 * Two representations of the same shape live here:
 *
 * 1. `ParsedEventsSchema` — Zod validator. Used to *validate* the model's
 *    response after it returns. Anything that fails the parse is routed
 *    to `IngestionFailure` rather than downstream consumers.
 *
 * 2. `ANTHROPIC_TOOL_JSON_SCHEMA` — the JSON Schema passed to the Anthropic
 *    SDK's `tools: [{ input_schema }]`. Claude Haiku 4.5 is capable of
 *    structured-output via tool_use: the model fills in the tool
 *    parameters and we read them back as strongly-typed data.
 *
 * The two MUST describe the same shape. Tests below verify that every
 * enum value enumerated in the JSON Schema is also a valid Zod enum
 * entry, so a drift between them fails in CI rather than in production.
 */

/**
 * Canonical event types — a subset of the DB enum `CanonicalEventType`
 * that the LLM is allowed to emit. We don't expose every enum value
 * (e.g. `VEHICLE_CHALLAN` comes from the parivahan scraper, never from
 * email), and `VALUATION_SNAPSHOT` is computed server-side, not parsed
 * from email text — so both are excluded from the LLM's vocabulary.
 */
export const LLM_EVENT_TYPES = [
  'BUY',
  'SELL',
  'DIVIDEND',
  'INTEREST_CREDIT',
  'INTEREST_DEBIT',
  'EMI_DEBIT',
  'PREMIUM_PAID',
  'MATURITY_CREDIT',
  'RENT_RECEIVED',
  'RENT_PAID',
  'SIP_INSTALLMENT',
  'FD_CREATION',
  'FD_MATURITY',
  'CARD_PURCHASE',
  'CARD_PAYMENT',
  'UPI_CREDIT',
  'UPI_DEBIT',
  'NEFT_CREDIT',
  'NEFT_DEBIT',
  'FNO_TRADE',
  'OTHER',
] as const;

export type LlmEventType = (typeof LLM_EVENT_TYPES)[number];

/**
 * Single parsed event. Nullable fields mean "the LLM could not find this
 * in the email"; missing (undefined) means the LLM didn't emit the field.
 * Both are treated as unknown downstream. Amounts/dates stay as strings so
 * decimal.js never sees a JS number (per §3.2).
 */
export const ParsedEventSchema = z.object({
  event_type: z.enum(LLM_EVENT_TYPES),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'event_date must be YYYY-MM-DD'),
  amount: z.string().nullable(),
  quantity: z.string().nullable(),
  price: z.string().nullable(),
  counterparty: z.string().nullable(),
  instrument_isin: z.string().nullable(),
  instrument_symbol: z.string().nullable(),
  instrument_name: z.string().nullable(),
  account_last4: z.string().nullable(),
  currency: z.string().default('INR'),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable(),
  // F&O extensions — only populated for FNO_TRADE events. Buy/Sell side
  // for F&O is encoded as event_type=FNO_TRADE plus side="BUY"|"SELL" in
  // a follow-up field; dropped into the metadata blob on CanonicalEvent.
  fno_trading_symbol: z.string().nullable().optional(),
  fno_underlying: z.string().nullable().optional(),
  fno_instrument_type: z.enum(['FUTURES', 'CALL', 'PUT']).nullable().optional(),
  fno_strike_price: z.string().nullable().optional(),
  fno_expiry_date: z.string().nullable().optional(), // YYYY-MM-DD
  fno_lot_size: z.number().nullable().optional(),
  fno_quantity_contracts: z.string().nullable().optional(),
  fno_side: z.enum(['BUY', 'SELL']).nullable().optional(),
});

export type ParsedEvent = z.infer<typeof ParsedEventSchema>;

/**
 * The full response body. Claude's tool_use input goes here verbatim.
 */
export const ParsedEventsSchema = z.object({
  events: z.array(ParsedEventSchema),
  is_marketing: z.boolean().optional(),
});

export type ParsedEvents = z.infer<typeof ParsedEventsSchema>;

/**
 * JSON Schema handed to Anthropic as the tool's input schema. Keep in
 * sync with `ParsedEventSchema` above — the cross-check test enforces
 * this at CI time.
 *
 * `additionalProperties: false` is critical: without it Haiku sometimes
 * invents sibling fields ("bank_name", "reference_id") that Zod then
 * rejects, routing otherwise-fine events to the DLQ.
 */
export const ANTHROPIC_TOOL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['event_type', 'event_date', 'confidence'],
        properties: {
          event_type: { type: 'string', enum: [...LLM_EVENT_TYPES] },
          event_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          amount: { type: ['string', 'null'] },
          quantity: { type: ['string', 'null'] },
          price: { type: ['string', 'null'] },
          counterparty: { type: ['string', 'null'] },
          instrument_isin: { type: ['string', 'null'] },
          instrument_symbol: { type: ['string', 'null'] },
          instrument_name: { type: ['string', 'null'] },
          account_last4: { type: ['string', 'null'] },
          currency: { type: 'string', default: 'INR' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          notes: { type: ['string', 'null'] },
          fno_trading_symbol: { type: ['string', 'null'] },
          fno_underlying: { type: ['string', 'null'] },
          fno_instrument_type: { type: ['string', 'null'], enum: ['FUTURES', 'CALL', 'PUT', null] },
          fno_strike_price: { type: ['string', 'null'] },
          fno_expiry_date: { type: ['string', 'null'] },
          fno_lot_size: { type: ['number', 'null'] },
          fno_quantity_contracts: { type: ['string', 'null'] },
          fno_side: { type: ['string', 'null'], enum: ['BUY', 'SELL', null] },
        },
      },
    },
    is_marketing: { type: 'boolean' },
  },
  required: ['events'],
  additionalProperties: false,
} as const;

/** Tool name presented to the model. */
export const ANTHROPIC_TOOL_NAME = 'emit_events';
export const ANTHROPIC_TOOL_DESCRIPTION =
  'Emit the structured financial events extracted from the email.';
