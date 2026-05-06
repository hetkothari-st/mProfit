import { Decimal } from '@portfolioos/shared';
import type { AssetClass, Exchange, TransactionType } from '@prisma/client';
import type { Parser, ParserResult, ParsedTransaction } from './types.js';
import { logger } from '../../../lib/logger.js';
import {
  readPdfText,
  getUserPdfPasswords,
  isPdfPasswordError,
} from '../../../lib/pdf.js';
import {
  detectBrokerFromPdfText,
  type BrokerDescriptor,
} from '../../../data/brokers.js';
import { parseEmailWithLlm, checkLlmGate } from '../../../ingestion/llm/client.js';
import type { ParsedEvent } from '../../../ingestion/llm/schema.js';
import { bodyStructureHash } from '../../../ingestion/hash.js';
import {
  findActiveContractNoteRecipe,
  recordContractNoteSample,
  recordContractNoteRecipeMiss,
  applyContractNoteRecipe,
  type CnSampleTrade,
} from '../../../ingestion/contractNoteTemplates.js';

/**
 * Generic Indian-broker contract-note parser.
 *
 * Strategy:
 *   1. Read PDF text (decrypts via stored PAN/DOB).
 *   2. Detect which of the 25 registered brokers emitted the document by
 *      keyword-matching the PDF body against `BROKERS[*].pdfKeywords`.
 *   3. Hand the extracted text to `parseEmailWithLlm` — Claude Haiku 4.5
 *      is already prompted to handle multi-trade contract notes (see
 *      `system-prompt.txt`). Reusing the same path means PII redaction,
 *      budget guard, ledger writes, and zero-retention header are all
 *      applied without duplication.
 *   4. Map the LLM's `ParsedEvent[]` (BUY / SELL / FNO_TRADE shape) into
 *      `ParsedTransaction[]` so the existing import pipeline can project
 *      them into Transaction rows after user review.
 *
 * Specific-broker parsers (currently only Zerodha) win earlier in the
 * adapter registry by checking their canHandle first; this parser is the
 * universal fallback for the other 24 brokers in the registry, plus any
 * future broker that gets added before a per-broker regex parser is
 * written. If a broker isn't in the registry the parser still handles
 * the PDF — broker is just left unset.
 *
 * Recipe caching (LearnedTemplate) is NOT enabled here yet. Every
 * eligible PDF goes through Haiku. Once we have ≥10 same-format samples
 * per broker, a follow-up commit synthesises a deterministic recipe and
 * skips the LLM call. The current design intentionally pays the LLM
 * cost up-front to keep the first version simple and accurate — the
 * monthly cap in `LlmSpend` keeps spend bounded.
 */

const ADAPTER_ID = 'broker.contract_note.generic';
const ADAPTER_VER = '1';

export const genericBrokerContractNoteParser: Parser = {
  name: 'generic-broker-contract-note',

  async canHandle(ctx, sample) {
    if (!ctx.fileName.toLowerCase().endsWith('.pdf')) return false;
    const text = typeof sample === 'string' ? sample : '';
    if (!text) return false;
    const upper = text.toUpperCase();

    // Must look like a contract note. The keyword set mirrors what every
    // SEBI-mandated digital contract note carries somewhere in its
    // header / footer, so this is robust across formats.
    const isContractNote =
      upper.includes('CONTRACT NOTE') ||
      upper.includes('CONTRACTNOTE') ||
      upper.includes('CONFIRMATION OF TRADE') ||
      upper.includes('TRADE CONFIRMATION') ||
      upper.includes('DIGITAL CONTRACT');
    if (!isContractNote) return false;

    // And come from one of the 25 registered brokers. Otherwise we'd
    // shadow the generic Excel/CSV adapters for unrelated PDFs.
    return detectBrokerFromPdfText(text) !== null;
  },

  async parse(ctx): Promise<ParserResult> {
    // 1. PDF text (with password-retry loop).
    const passwords = await getUserPdfPasswords(ctx.userId);
    let pdfText: string;
    try {
      const r = await readPdfText(ctx.filePath, passwords);
      pdfText = r.text;
    } catch (err) {
      if (isPdfPasswordError(err)) {
        return {
          adapter: ADAPTER_ID,
          adapterVer: ADAPTER_VER,
          transactions: [],
          warnings: [
            passwords.length === 0
              ? 'PDF is password-protected. Set your PAN (and DOB if known) in Settings — Indian broker contract notes are encrypted with PAN or PAN+DOB.'
              : 'PDF is password-protected and your saved credentials did not unlock it. Verify Settings → PAN and DOB match this broker account.',
          ],
        };
      }
      throw err;
    }

    if (!pdfText.trim()) {
      return {
        adapter: ADAPTER_ID,
        adapterVer: ADAPTER_VER,
        transactions: [],
        warnings: ['PDF contains no extractable text — file may be a scanned image. OCR is not yet supported.'],
      };
    }

    // 2. Broker detection.
    const broker = detectBrokerFromPdfText(pdfText);
    if (!broker) {
      // Belt-and-suspenders: canHandle should have already filtered these,
      // but a benign warning is friendlier than throwing.
      return {
        broker: undefined,
        adapter: ADAPTER_ID,
        adapterVer: ADAPTER_VER,
        transactions: [],
        warnings: ['Contract note detected but the broker is not in the registry. Add an entry to packages/api/src/data/brokers.ts.'],
      };
    }

    // 3. Recipe-cache fast path. Promoted templates skip the LLM
    // entirely — deterministic regex extraction, zero cost.
    const structureHash = bodyStructureHash(pdfText);
    const cached = await findActiveContractNoteRecipe({
      userId: ctx.userId,
      brokerId: broker.id,
      structureHash,
    });
    if (cached) {
      // Still need a trade date for the row — sniff a date from the PDF.
      // Falls back to today if not found; downstream the user can edit.
      const tradeDate = sniffTradeDate(pdfText) ?? new Date().toISOString().slice(0, 10);
      const recipeTrades = applyContractNoteRecipe({
        recipe: cached.recipe,
        broker,
        pdfText,
        tradeDate,
      });
      if (recipeTrades && recipeTrades.length > 0) {
        logger.info(
          {
            fileName: ctx.fileName,
            brokerId: broker.id,
            templateId: cached.templateId,
            templateVersion: cached.version,
            tradeCount: recipeTrades.length,
          },
          '[broker-cn] recipe hit',
        );
        return {
          broker: broker.label,
          adapter: ADAPTER_ID,
          adapterVer: `${ADAPTER_VER}.${broker.id}.r${cached.version}`,
          transactions: recipeTrades,
          warnings: [],
        };
      }
      // Recipe miss — record it so confidence decays, fall through to LLM.
      logger.warn(
        {
          fileName: ctx.fileName,
          brokerId: broker.id,
          templateId: cached.templateId,
        },
        '[broker-cn] recipe miss — falling back to LLM',
      );
      await recordContractNoteRecipeMiss({
        userId: ctx.userId,
        templateId: cached.templateId,
      });
    }

    // 4. LLM gate. Out-of-budget / API-key-missing falls back to a
    // user-visible warning rather than silent failure.
    const gate = checkLlmGate();
    if (!gate.ok) {
      return {
        broker: broker.label,
        adapter: ADAPTER_ID,
        adapterVer: `${ADAPTER_VER}.${broker.id}`,
        transactions: [],
        warnings: [
          `LLM parser unavailable (${gate.reason}). Contract note recognised as ${broker.label} but cannot be parsed. ${gate.message}`,
        ],
      };
    }

    const llmResult = await parseEmailWithLlm({
      userId: ctx.userId,
      emailBody: pdfText,
      sourceRef: `pdf:${ctx.fileName}`,
      purpose: `contract_note_parse:${broker.id}`,
    });

    if (!llmResult.ok) {
      logger.warn(
        {
          fileName: ctx.fileName,
          brokerId: broker.id,
          reason: llmResult.reason,
          message: llmResult.message,
        },
        '[broker-cn] LLM parse failed',
      );
      return {
        broker: broker.label,
        adapter: ADAPTER_ID,
        adapterVer: `${ADAPTER_VER}.${broker.id}`,
        transactions: [],
        warnings: [
          `LLM parse failed for ${broker.label} contract note: ${llmResult.message}`,
        ],
      };
    }

    // 5. Event → Transaction projection.
    const transactions = llmResult.events
      .map((event) => mapEventToTransaction(event, broker))
      .filter((tx): tx is ParsedTransaction => tx !== null);

    const warnings: string[] = [];
    if (llmResult.events.length > 0 && transactions.length === 0) {
      warnings.push(
        `LLM returned ${llmResult.events.length} event(s) but none mapped to a tradable transaction — review the document.`,
      );
    }
    if (transactions.length === 0) {
      logger.warn(
        { fileName: ctx.fileName, brokerId: broker.id },
        '[broker-cn] no trades extracted',
      );
    }

    // 6. Sample recording — fire-and-forget. Recipe synthesis happens
    // inside `recordContractNoteSample` once the threshold is hit.
    const cnTrades = collectCnTrades(transactions);
    if (cnTrades.length > 0) {
      void recordContractNoteSample({
        userId: ctx.userId,
        brokerId: broker.id,
        fileName: ctx.fileName,
        pdfText,
        trades: cnTrades,
      });
    }

    return {
      broker: broker.label,
      adapter: ADAPTER_ID,
      // Versioned per-broker so format drifts on one broker can be
      // correlated independently of others when reading LlmSpend / DLQ.
      adapterVer: `${ADAPTER_VER}.${broker.id}`,
      transactions,
      warnings,
    };
  },
};

/**
 * Look for a "Trade Date" / "Date" header line in the PDF and return its
 * value as YYYY-MM-DD. Best-effort — recipe-extracted trades don't carry
 * a per-row date, so we use a single document-level date for all rows.
 */
function sniffTradeDate(text: string): string | null {
  const m = text.match(
    /(?:Trade\s*Date|Date\s+of\s+Trade|Trade\s*Dt)[\s:.]+([0-9]{1,2}[-/][A-Za-z]{3}[-/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i,
  );
  if (!m) return null;
  return parseFlexibleDate(m[1]!);
}

function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const monAlpha = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2}|\d{4})$/);
  if (monAlpha) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mo = months[monAlpha[2]!.toLowerCase()];
    if (!mo) return null;
    const yy = monAlpha[3]!;
    const yyyy = yy.length === 2 ? `20${yy}` : yy;
    return `${yyyy}-${mo}-${monAlpha[1]!.padStart(2, '0')}`;
  }
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  }
  return null;
}

/** Filter to equity rows only — F&O recipe synthesis is out of scope for v1. */
function collectCnTrades(transactions: ParsedTransaction[]): CnSampleTrade[] {
  return transactions
    .filter((t) => t.assetClass === 'EQUITY')
    .map((t) => ({
      isin: t.isin ?? null,
      symbol: t.symbol ?? null,
      side: t.transactionType === 'BUY' ? 'BUY' : 'SELL',
      quantity: typeof t.quantity === 'string' ? t.quantity : String(t.quantity),
      price: typeof t.price === 'string' ? t.price : String(t.price),
    }));
}

/**
 * Map one LLM-emitted ParsedEvent to a ParsedTransaction. Returns null
 * for events the contract-note pipeline doesn't care about (DIVIDEND,
 * INTEREST_CREDIT, etc. — those leak through if Haiku misidentifies a
 * trade row, easier to drop than risk projecting garbage).
 */
function mapEventToTransaction(
  event: ParsedEvent,
  broker: BrokerDescriptor,
): ParsedTransaction | null {
  const exchange = pickPrimaryExchange(broker, event);

  // F&O: event_type=FNO_TRADE + fno_side carries the buy/sell flag.
  if (event.event_type === 'FNO_TRADE') {
    if (!event.fno_side || !event.fno_instrument_type) return null;
    if (!event.quantity || !event.price) return null;
    const qty = safeDecimal(event.quantity);
    const price = safeDecimal(event.price);
    if (!qty || !price || qty.isZero()) return null;
    return {
      assetClass: event.fno_instrument_type === 'FUTURES' ? 'FUTURES' : 'OPTIONS',
      transactionType: event.fno_side === 'BUY' ? 'BUY' : 'SELL',
      symbol: event.fno_underlying ?? event.instrument_symbol ?? undefined,
      assetName: event.fno_trading_symbol ?? event.instrument_name ?? undefined,
      exchange,
      tradeDate: event.event_date,
      quantity: qty.abs().toString(),
      price: price.abs().toString(),
      broker: broker.label,
      strikePrice: event.fno_strike_price ?? undefined,
      expiryDate: event.fno_expiry_date ?? undefined,
      optionType:
        event.fno_instrument_type === 'CALL'
          ? 'CALL'
          : event.fno_instrument_type === 'PUT'
            ? 'PUT'
            : undefined,
      lotSize: event.fno_lot_size ?? undefined,
    };
  }

  // Equity buy/sell.
  if (event.event_type === 'BUY' || event.event_type === 'SELL') {
    if (!event.quantity || !event.price) return null;
    const qty = safeDecimal(event.quantity);
    const price = safeDecimal(event.price);
    if (!qty || !price || qty.isZero()) return null;
    return {
      assetClass: 'EQUITY' as AssetClass,
      transactionType: event.event_type as TransactionType,
      symbol: event.instrument_symbol?.toUpperCase() ?? undefined,
      isin: event.instrument_isin ?? undefined,
      stockName: event.instrument_name ?? undefined,
      exchange,
      tradeDate: event.event_date,
      quantity: qty.abs().toString(),
      price: price.abs().toString(),
      broker: broker.label,
    };
  }

  return null;
}

/**
 * Choose an Exchange enum value for the trade. The LLM doesn't emit one
 * directly; we infer from F&O presence and the broker's primary venue.
 */
function pickPrimaryExchange(
  broker: BrokerDescriptor,
  event: ParsedEvent,
): Exchange | undefined {
  if (event.event_type === 'FNO_TRADE') {
    if (broker.exchanges.includes('NFO')) return 'NFO' as Exchange;
    if (broker.exchanges.includes('BFO')) return 'BFO' as Exchange;
  }
  if (broker.exchanges.includes('NSE')) return 'NSE' as Exchange;
  if (broker.exchanges.includes('BSE')) return 'BSE' as Exchange;
  return undefined;
}

function safeDecimal(s: string | null | undefined): Decimal | null {
  if (!s) return null;
  try {
    const d = new Decimal(s);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}
