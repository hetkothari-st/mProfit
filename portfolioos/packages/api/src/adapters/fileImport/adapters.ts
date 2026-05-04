/**
 * File-import adapter wrappers. Each one delegates parsing to the underlying
 * Parser implementation in services/imports/parsers/ — the adapter layer is
 * a thin shell that gives the existing code an Adapter-shaped interface and
 * converts ParsedTransaction rows into TransactionEvent[].
 *
 * Keeping the legacy parsers intact is deliberate (§5.1 task 7: "each keeps
 * its current behavior"). The only behavioural change is that failures now
 * ride through a typed ParseResult discriminated union so Task 8 / the DLQ
 * can persist the error + raw context uniformly.
 */

import type { Parser, ParsedTransaction } from '../../services/imports/parsers/types.js';
import { zerodhaContractNoteParser } from '../../services/imports/parsers/zerodhaContractNote.parser.js';
import { nsdlCdslCasParser } from '../../services/imports/parsers/nsdlCdslCas.parser.js';
import { mfCasParser } from '../../services/imports/parsers/mfCas.parser.js';
import { genericExcelParser } from '../../services/imports/parsers/genericExcel.parser.js';
import { genericCsvParser } from '../../services/imports/parsers/genericCsv.parser.js';
import type {
  FileImportAdapter,
  FileImportInput,
  TransactionEvent,
  TransactionEventMetadata,
} from './types.js';
import type { CanonicalEventType } from '../types.js';

/**
 * Map a legacy ParsedTransaction (output of a Parser) into a TransactionEvent.
 * The trade's assetClass + transactionType live in metadata; CanonicalEvent
 * keeps `eventType` at the BUY/SELL-grain level to stay compatible with
 * other event sources (email, Gmail, etc.).
 */
function toTransactionEvent(
  pt: ParsedTransaction,
  adapterId: string,
  adapterVer: string,
  sourceRef: string,
): TransactionEvent {
  const metadata: TransactionEventMetadata = {
    assetClass: pt.assetClass,
    transactionType: pt.transactionType,
    exchange: pt.exchange,
    schemeCode: pt.schemeCode,
    schemeName: pt.schemeName,
    amcName: pt.amcName,
    folioNumber: pt.folioNumber,
    brokerage: toStr(pt.brokerage),
    stt: toStr(pt.stt),
    stampDuty: toStr(pt.stampDuty),
    exchangeCharges: toStr(pt.exchangeCharges),
    gst: toStr(pt.gst),
    sebiCharges: toStr(pt.sebiCharges),
    otherCharges: toStr(pt.otherCharges),
    broker: pt.broker,
    orderNo: pt.orderNo,
    tradeNo: pt.tradeNo,
    narration: pt.narration,
    settlementDate: pt.settlementDate,
    strikePrice: toStr(pt.strikePrice),
    expiryDate: pt.expiryDate,
    optionType: pt.optionType,
    lotSize: pt.lotSize,
  };

  return {
    sourceAdapter: adapterId,
    sourceAdapterVer: adapterVer,
    sourceRef,
    sourceHash: pt.sourceHash,
    eventType: toCanonicalEventType(pt.transactionType),
    eventDate: pt.tradeDate,
    amount: undefined,
    quantity: toStr(pt.quantity),
    price: toStr(pt.price),
    counterparty: pt.broker,
    instrumentIsin: pt.isin,
    instrumentSymbol: pt.symbol,
    instrumentName: pt.stockName ?? pt.schemeName ?? pt.assetName,
    currency: 'INR',
    metadata,
    confidence: 1.0,
  };
}

function toStr(v: number | string | undefined | null): string | undefined {
  if (v === undefined || v === null) return undefined;
  return typeof v === 'string' ? v : v.toString();
}

/**
 * Coarse-grained mapping from Prisma TransactionType to CanonicalEventType.
 * Anything buy-flavoured folds to BUY, anything sell-flavoured to SELL; the
 * exact sub-variant (SIP, SWITCH_IN, BONUS, ...) is preserved on
 * metadata.transactionType so the projection step can restore it.
 */
function toCanonicalEventType(t: ParsedTransaction['transactionType']): CanonicalEventType {
  switch (t) {
    case 'BUY':
    case 'SIP':
    case 'SWITCH_IN':
    case 'BONUS':
    case 'MERGER_IN':
    case 'DEMERGER_IN':
    case 'RIGHTS_ISSUE':
    case 'DIVIDEND_REINVEST':
    case 'OPENING_BALANCE':
      return 'BUY';
    case 'SELL':
    case 'SWITCH_OUT':
    case 'MERGER_OUT':
    case 'DEMERGER_OUT':
    case 'REDEMPTION':
    case 'MATURITY':
      return 'SELL';
    case 'DIVIDEND_PAYOUT':
      return 'DIVIDEND';
    default:
      return 'OTHER';
  }
}

/**
 * Build a FileImportAdapter that delegates to a legacy Parser. We eagerly
 * resolve the sample (canHandle contract) inside `detect`, then re-use it in
 * `parse` by round-tripping through the parser's own `parse(ctx)` call.
 *
 * The underlying parsers already stamp {adapter, adapterVer} on their
 * ParserResult; we use those as the source of truth so format-version bumps
 * only have to change one place.
 */
function makeAdapter(
  parser: Parser,
  fallbackId: string,
  fallbackVer: string,
): FileImportAdapter {
  return {
    id: fallbackId,
    version: fallbackVer,
    detect: () => {
      // detect() on FileImport inputs needs a file sample; the runner
      // (runFileImportAdapter) does the buildSample+canHandle work centrally
      // using the underlying Parser in PARSER_OF. This stub satisfies the
      // Adapter contract without duplicating that logic. Phase 5-A adapters
      // (Gmail, etc.) will implement detect() meaningfully.
      return false;
    },
    parse: async (input: FileImportInput) => {
      try {
        const result = await parser.parse({
          filePath: input.filePath,
          fileName: input.fileName,
          portfolioId: input.portfolioId,
          userId: input.userId,
          extraPasswords: input.extraPasswords,
        });
        const adapterId = result.adapter ?? fallbackId;
        const adapterVer = result.adapterVer ?? fallbackVer;
        const events = result.transactions.map((pt) =>
          toTransactionEvent(pt, adapterId, adapterVer, input.filePath),
        );
        return { ok: true, events, warnings: result.warnings };
      } catch (err) {
        return {
          ok: false,
          error: (err as Error).message,
          rawPayload: { fileName: input.fileName },
        };
      }
    },
  };
}

export const zerodhaContractNoteAdapter = makeAdapter(
  zerodhaContractNoteParser,
  'zerodha.contract_note',
  '1',
);
export const nsdlCdslCasAdapter = makeAdapter(
  nsdlCdslCasParser,
  'cas.depository.nsdl_cdsl',
  '1',
);
export const mfCasAdapter = makeAdapter(mfCasParser, 'cas.mf.cams_kfintech', '1');
export const genericExcelAdapter = makeAdapter(genericExcelParser, 'generic.excel', '1');
export const genericCsvAdapter = makeAdapter(genericCsvParser, 'generic.csv', '1');

/**
 * Registry in detect-priority order. The runner pairs each adapter with its
 * underlying Parser via `PARSER_OF` so the shared buildSample + canHandle
 * loop (which already handles password-protected / scanned PDFs correctly)
 * can drive adapter selection.
 */
export const FILE_IMPORT_ADAPTERS: readonly FileImportAdapter[] = [
  zerodhaContractNoteAdapter,
  nsdlCdslCasAdapter,
  mfCasAdapter,
  genericExcelAdapter,
  genericCsvAdapter,
] as const;

export const PARSER_OF = new Map<FileImportAdapter, Parser>([
  [zerodhaContractNoteAdapter, zerodhaContractNoteParser],
  [nsdlCdslCasAdapter, nsdlCdslCasParser],
  [mfCasAdapter, mfCasParser],
  [genericExcelAdapter, genericExcelParser],
  [genericCsvAdapter, genericCsvParser],
]);
