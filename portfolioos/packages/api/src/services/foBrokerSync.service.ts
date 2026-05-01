import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { getFnoConnector } from '../adapters/fno/broker-registry.js';
import type { FnoNormalizedTrade } from '../adapters/fno/types.js';
import { ensureFoInstrument } from '../priceFeeds/nseFoMaster.service.js';
import { computeAssetKey } from './assetKey.js';
import { recomputeDerivativePosition } from './derivativePosition.service.js';

/**
 * Drive a single user's F&O broker sync end-to-end:
 *   1. Pick the connector for `brokerId`
 *   2. Fetch trades + margin from broker API
 *   3. Upsert Transactions (idempotent via sourceHash)
 *   4. Recompute DerivativePosition for each touched assetKey
 *   5. Insert MarginSnapshot row if available
 */
export async function syncFnoBroker(input: {
  userId: string;
  brokerId: string;
  portfolioId: string;
}): Promise<{ tradesIngested: number; positionsTouched: number; marginUpdated: boolean }> {
  const connector = getFnoConnector(input.brokerId);
  if (!connector) throw new AppError(`No connector for broker ${input.brokerId}`, 400, 'BROKER_UNSUPPORTED');

  const cred = await prisma.brokerCredential.findUnique({
    where: { userId_brokerId: { userId: input.userId, brokerId: input.brokerId } },
  });
  if (!cred || !cred.isActive) {
    throw new AppError(
      `Connect ${input.brokerId} first — no active credential on file.`,
      400,
      'NO_BROKER_CREDENTIAL',
      { brokerId: input.brokerId },
    );
  }
  // Token missing entirely → user has set up keys but not completed login.
  if (!cred.accessToken) {
    throw new AppError(
      `Login to ${input.brokerId} required.`,
      401,
      'BROKER_LOGIN_REQUIRED',
      { brokerId: input.brokerId },
    );
  }

  const result = await connector.syncDay(cred.id);
  let ingested = 0;
  const touchedKeys = new Set<string>();

  for (const t of result.trades) {
    try {
      const created = await ingestFnoTrade(input.userId, input.portfolioId, t);
      if (created) {
        ingested += 1;
        touchedKeys.add(created.assetKey);
      }
    } catch (err) {
      logger.warn({ err, sourceHash: t.sourceHash }, '[fno.sync] trade ingest failed');
    }
  }

  for (const key of touchedKeys) {
    await recomputeDerivativePosition(input.portfolioId, key);
  }

  let marginUpdated = false;
  if (result.margin) {
    await prisma.marginSnapshot.create({
      data: {
        userId: input.userId,
        portfolioId: input.portfolioId,
        snapshotDate: new Date(),
        spanMargin: result.margin.spanMargin,
        exposureMargin: result.margin.exposureMargin,
        totalRequired: result.margin.totalRequired,
        availableBalance: result.margin.availableBalance,
        utilizationPct: result.margin.utilizationPct,
        source: 'broker_api',
      },
    });
    marginUpdated = true;
  }

  return { tradesIngested: ingested, positionsTouched: touchedKeys.size, marginUpdated };
}

async function ingestFnoTrade(
  userId: string,
  portfolioId: string,
  t: FnoNormalizedTrade,
): Promise<{ id: string; assetKey: string } | null> {
  // Idempotency.
  const dup = await prisma.transaction.findUnique({ where: { sourceHash: t.sourceHash } });
  if (dup) return { id: dup.id, assetKey: dup.assetKey ?? '' };

  // Ensure FoInstrument so DerivativePosition.recompute can resolve it.
  await ensureFoInstrument({
    underlying: t.underlying,
    instrumentType: t.instrumentType,
    strikePrice: t.strikePrice,
    expiryDate: new Date(`${t.expiryDate}T00:00:00.000Z`),
    lotSize: t.lotSize,
    exchange: t.exchange ?? 'NFO',
  });

  const qtyContracts = new Decimal(t.quantityContracts);
  const price = new Decimal(t.pricePerUnit);
  const totalUnits = qtyContracts.times(t.lotSize);
  const gross = totalUnits.times(price);
  const charges = sumCharges(t.charges);
  const isBuy = t.side === 'BUY';
  const net = isBuy ? gross.plus(charges) : gross.minus(charges);

  const assetKey = computeAssetKey({
    foUnderlying: t.underlying,
    foInstrumentType: t.instrumentType,
    foStrikePrice: t.strikePrice,
    foExpiryDate: t.expiryDate,
  });

  const tx = await prisma.transaction.create({
    data: {
      portfolioId,
      assetClass: t.instrumentType === 'FUTURES' ? 'FUTURES' : 'OPTIONS',
      transactionType: isBuy ? 'BUY' : 'SELL',
      assetName: t.tradingSymbol ?? t.underlying,
      tradeDate: new Date(`${t.tradeDate}T00:00:00.000Z`),
      quantity: totalUnits.toString(),
      price: price.toString(),
      grossAmount: gross.toString(),
      brokerage: t.charges?.brokerage ?? '0',
      stt: t.charges?.stt ?? '0',
      stampDuty: t.charges?.stampDuty ?? '0',
      exchangeCharges: t.charges?.exchangeCharges ?? '0',
      gst: t.charges?.gst ?? '0',
      sebiCharges: t.charges?.sebiCharges ?? '0',
      netAmount: net.toString(),
      strikePrice: t.strikePrice,
      expiryDate: new Date(`${t.expiryDate}T00:00:00.000Z`),
      optionType: t.instrumentType === 'CALL' ? 'CALL' : t.instrumentType === 'PUT' ? 'PUT' : null,
      lotSize: t.lotSize,
      broker: t.brokerId,
      exchange: t.exchange ?? 'NFO',
      orderNo: t.orderNo,
      tradeNo: t.tradeNo,
      assetKey,
      sourceAdapter: t.sourceAdapter,
      sourceAdapterVer: t.sourceAdapterVer,
      sourceHash: t.sourceHash,
    },
    select: { id: true, assetKey: true },
  });

  return { id: tx.id, assetKey: tx.assetKey ?? assetKey };
}

function sumCharges(c: FnoNormalizedTrade['charges'] | undefined): Decimal {
  if (!c) return new Decimal(0);
  return new Decimal(c.brokerage ?? 0)
    .plus(c.stt ?? 0)
    .plus(c.stampDuty ?? 0)
    .plus(c.exchangeCharges ?? 0)
    .plus(c.gst ?? 0)
    .plus(c.sebiCharges ?? 0);
}

// Credential save lives in services/brokerOauth/index.ts (setupBrokerCredential)
// — this used to host a direct accessToken-paste path that is no longer used.
