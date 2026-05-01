import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recomputeDerivativePosition } from './derivativePosition.service.js';
import { getLatestFoContractPrice } from '../priceFeeds/nseFoMaster.service.js';

/**
 * Expiry-day lifecycle. Run by cron at 17:30 IST (after bhavcopy job at
 * 16:45 publishes settlement prices). For each OPEN DerivativePosition with
 * `expiryDate = today`:
 *   1. Resolve settlementPrice from FoContractPrice.
 *   2. Create an ExpiryCloseJob (PENDING_REVIEW unless portfolio
 *      auto-approves).
 *   3. Set position.status = PENDING_EXPIRY_APPROVAL.
 *   4. If auto-approve: immediately call approveExpiryClose.
 *   5. Emit FO_EXPIRY_TODAY alert if not already alerted.
 *
 * Approval projects a closing SELL/BUY transaction at settlement → triggers
 * recompute → status=CLOSED with closeReason=EXPIRY (or
 * EXPIRED_WORTHLESS for OTM options worth 0).
 */

export async function scanExpiringPositions(): Promise<{
  scanned: number;
  jobsCreated: number;
  autoClosed: number;
}> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const positions = await prisma.derivativePosition.findMany({
    where: {
      status: 'OPEN',
      expiryDate: { gte: today, lt: tomorrow },
    },
    include: { portfolio: { include: { portfolioSetting: true } } },
  });

  let jobsCreated = 0;
  let autoClosed = 0;

  for (const p of positions) {
    try {
      const ltp = await getLatestFoContractPrice(p.assetKey);
      const settlementPrice = ltp ? new Decimal(ltp.settlementPrice) : null;
      const job = await prisma.expiryCloseJob.create({
        data: {
          portfolioId: p.portfolioId,
          positionId: p.id,
          assetKey: p.assetKey,
          expiryDate: p.expiryDate,
          openQty: p.netQuantity,
          settlementPrice: settlementPrice ? settlementPrice.toString() : null,
          status: 'PENDING_REVIEW',
        },
      });
      await prisma.derivativePosition.update({
        where: { id: p.id },
        data: { status: 'PENDING_EXPIRY_APPROVAL' },
      });
      await prisma.alert.create({
        data: {
          userId: p.userId,
          portfolioId: p.portfolioId,
          type: 'FO_EXPIRY_TODAY',
          title: `${p.underlying} ${p.instrumentType} expires today`,
          description: `${p.netQuantity.toString()} contracts at strike ${p.strikePrice?.toString() ?? '—'}; settlement ${settlementPrice?.toString() ?? '—'}`,
          triggerDate: new Date(),
        },
      });
      jobsCreated += 1;

      const autoApprove = p.portfolio?.portfolioSetting?.autoApproveExpiryClose ?? false;
      if (autoApprove) {
        await approveExpiryClose(job.id);
        autoClosed += 1;
      }
    } catch (err) {
      logger.error({ err, positionId: p.id }, '[foExpiry] scan failed for position');
    }
  }

  return { scanned: positions.length, jobsCreated, autoClosed };
}

export async function approveExpiryClose(jobId: string): Promise<void> {
  const job = await prisma.expiryCloseJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`ExpiryCloseJob ${jobId} not found`);
  if (job.status === 'COMPLETED') return;

  const position = await prisma.derivativePosition.findUnique({ where: { id: job.positionId } });
  if (!position) throw new Error('Position not found');

  const settlement = job.settlementPrice
    ? new Decimal(job.settlementPrice.toString())
    : new Decimal(0);
  const netQty = new Decimal(position.netQuantity.toString());
  if (netQty.isZero()) {
    await prisma.expiryCloseJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', reviewedAt: new Date() },
    });
    return;
  }

  const totalUnits = netQty.times(position.lotSize).abs();
  const grossAmount = totalUnits.times(settlement);
  // Long position settles via SELL at settlement; short via BUY at settlement.
  const closingType = netQty.isPositive() ? 'SELL' : 'BUY';

  await prisma.transaction.create({
    data: {
      portfolioId: position.portfolioId,
      assetClass: position.instrumentType === 'FUTURES' ? 'FUTURES' : 'OPTIONS',
      transactionType: closingType,
      assetName: `${position.underlying}-EXPIRY`,
      tradeDate: position.expiryDate,
      quantity: totalUnits.toString(),
      price: settlement.toString(),
      grossAmount: grossAmount.toString(),
      netAmount: grossAmount.toString(),
      strikePrice: position.strikePrice?.toString() ?? null,
      expiryDate: position.expiryDate,
      optionType: position.instrumentType === 'CALL' ? 'CALL' : position.instrumentType === 'PUT' ? 'PUT' : null,
      lotSize: position.lotSize,
      exchange: 'NFO',
      assetKey: position.assetKey,
      sourceAdapter: 'fno.expiry.v1',
      sourceAdapterVer: '1',
      narration: 'Auto-generated expiry close',
    },
  });

  await prisma.expiryCloseJob.update({
    where: { id: job.id },
    data: { status: 'COMPLETED', reviewedAt: new Date() },
  });

  // Recompute closes the position with realized P&L.
  await recomputeDerivativePosition(position.portfolioId, position.assetKey);

  // For options that settle worthless (settlement=0), patch close reason.
  if (settlement.isZero() && position.instrumentType !== 'FUTURES') {
    await prisma.derivativePosition.update({
      where: { id: position.id },
      data: {
        status: 'EXPIRED_WORTHLESS',
        closeReason: 'EXPIRY',
        settlementPrice: '0',
      },
    });
  } else {
    await prisma.derivativePosition.update({
      where: { id: position.id },
      data: {
        closeReason: 'EXPIRY',
        settlementPrice: settlement.toString(),
      },
    });
  }
}
