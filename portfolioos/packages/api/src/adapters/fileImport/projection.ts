import type { CreateTransactionInput } from '../../services/transaction.service.js';
import type { TransactionEvent } from './types.js';

/**
 * CanonicalEvent → CreateTransactionInput projection.
 *
 * Called from import.service during the commit phase of an import job. The
 * event's generic fields (eventDate, quantity, price, instrument*) plus the
 * typed metadata block carry everything createTransaction needs, so this is
 * a near-1:1 field map — the interesting bits are the transactionType
 * restoration from metadata (eventType only carries BUY/SELL grain) and
 * the adapter lineage passed straight through.
 */
export function projectTransactionEvent(
  event: TransactionEvent,
  portfolioId: string,
): CreateTransactionInput {
  const m = event.metadata;

  return {
    portfolioId,
    assetClass: m.assetClass,
    transactionType: m.transactionType,

    stockSymbol: event.instrumentSymbol,
    stockName: event.instrumentName,
    exchange: m.exchange,

    schemeCode: m.schemeCode,
    schemeName: m.schemeName,
    amcName: m.amcName,

    assetName: event.instrumentName,
    isin: event.instrumentIsin,

    tradeDate: event.eventDate,
    settlementDate: m.settlementDate,
    quantity: event.quantity ?? '0',
    price: event.price ?? '0',

    brokerage: m.brokerage,
    stt: m.stt,
    stampDuty: m.stampDuty,
    exchangeCharges: m.exchangeCharges,
    gst: m.gst,
    sebiCharges: m.sebiCharges,
    otherCharges: m.otherCharges,

    broker: m.broker,
    orderNo: m.orderNo,
    tradeNo: m.tradeNo,
    narration: m.narration,

    sourceAdapter: event.sourceAdapter,
    sourceAdapterVer: event.sourceAdapterVer,
    sourceHash: event.sourceHash,
  };
}
