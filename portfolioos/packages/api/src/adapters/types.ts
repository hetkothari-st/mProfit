/**
 * Adapter framework — §5.1 task 7 / CLAUDE.md §3.4, §4.1.
 *
 * Every source of financial data (file import, Gmail email, CAS PDF,
 * mParivahan API, etc.) implements {@link Adapter}. Adapters emit
 * {@link CanonicalEvent}s — a source-agnostic in-memory shape that the
 * projection layer turns into Transactions / CashFlows / PremiumPayments /
 * etc. downstream.
 *
 * Separating detection, parsing, and projection means:
 *   - A new data source only has to speak the {@link CanonicalEvent}
 *     vocabulary (the projection stays unchanged).
 *   - Parser failures surface as a typed {@link ParseResult} discriminated
 *     union so the DLQ (Task 8) can persist raw payloads cleanly.
 *   - Every event carries adapter lineage ({id, version}) so re-parsing under
 *     a new format version is distinguishable from historical rows.
 *
 * Phase 4.5 scope: the base types and one specialization (file-import,
 * emitting TransactionEvent). Phase 5-A layers email/Gmail adapters on the
 * same contract without changing downstream code.
 */

export type CanonicalEventType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'INTEREST_CREDIT'
  | 'INTEREST_DEBIT'
  | 'EMI_DEBIT'
  | 'PREMIUM_PAID'
  | 'MATURITY_CREDIT'
  | 'RENT_RECEIVED'
  | 'RENT_PAID'
  | 'SIP_INSTALLMENT'
  | 'FD_CREATION'
  | 'FD_MATURITY'
  | 'CARD_PURCHASE'
  | 'CARD_PAYMENT'
  | 'UPI_CREDIT'
  | 'UPI_DEBIT'
  | 'NEFT_CREDIT'
  | 'NEFT_DEBIT'
  | 'VALUATION_SNAPSHOT'
  | 'VEHICLE_CHALLAN'
  | 'OTHER';

/**
 * In-memory event shape that adapters emit. Lines up 1:1 with the §4.1
 * Prisma CanonicalEvent model so Phase 5-A can persist these for review
 * without a second mapping step.
 */
export interface CanonicalEvent {
  sourceAdapter: string;
  sourceAdapterVer: string;
  /** Per-event source reference: file path, email message id, RC number, etc. */
  sourceRef: string;
  /**
   * Optional adapter-computed idempotency hash. When absent, the projection
   * layer derives one from the natural key or positional fallback
   * (see services/sourceHash.ts).
   */
  sourceHash?: string;

  eventType: CanonicalEventType;
  /** ISO 8601 (YYYY-MM-DD). */
  eventDate: string;
  /** Money as a Decimal-safe string (§3.2). */
  amount?: string;
  quantity?: string;
  price?: string;
  counterparty?: string;
  instrumentIsin?: string;
  instrumentSymbol?: string;
  instrumentName?: string;
  accountLast4?: string;
  currency: string;
  /** Adapter-specific extras. Projection consumers know their own shape. */
  metadata?: Record<string, unknown>;
  /** 0.0–1.0. Deterministic adapters (CSV/PDF) default to 1.0. */
  confidence: number;
  parserNotes?: string;
}

export type ParseResult<T extends CanonicalEvent> =
  | { ok: true; events: T[]; warnings?: string[]; metadata?: Record<string, unknown> }
  | { ok: false; error: string; rawPayload?: unknown; locked?: boolean; passwordsTried?: number };

export interface Adapter<TInput, TOutput extends CanonicalEvent = CanonicalEvent> {
  id: string;
  version: string;
  detect(input: TInput): boolean | Promise<boolean>;
  parse(input: TInput): Promise<ParseResult<TOutput>>;
}
