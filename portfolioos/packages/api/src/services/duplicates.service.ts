// Finding — and, when the user says so, removing — duplicates already on the
// books. The matching rules live in duplicateMatch.ts; this file only reads
// the rows and deletes exactly the ids it is handed. Nothing here decides on
// its own what to delete.

import { prisma } from '../lib/prisma.js';
import { deleteTransaction } from './transaction.service.js';
import { deleteLedgerEntry } from './rentalLedger.service.js';
import { computeAssetKey } from './assetKey.js';
import {
  groupRentDuplicates,
  groupTransactionDuplicates,
  type DuplicateGroup,
  type DuplicateRentRow,
  type DuplicateTxnRow,
} from './duplicateMatch.js';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function scanDuplicates(userId: string): Promise<{
  groups: DuplicateGroup[];
  scanned: { transactions: number; rentEntries: number };
}> {
  const txns = await prisma.transaction.findMany({
    where: { portfolio: { userId } },
    select: {
      id: true,
      portfolioId: true,
      portfolio: { select: { name: true } },
      assetClass: true,
      assetKey: true,
      assetName: true,
      isin: true,
      stockId: true,
      fundId: true,
      stock: { select: { name: true, symbol: true } },
      fund: { select: { schemeName: true } },
      transactionType: true,
      tradeDate: true,
      quantity: true,
      price: true,
      netAmount: true,
      broker: true,
      orderNo: true,
      tradeNo: true,
      importJobId: true,
      importJob: { select: { fileName: true } },
      sourceAdapter: true,
      createdAt: true,
    },
  });

  const txnRows: DuplicateTxnRow[] = txns.map((t) => ({
    id: t.id,
    portfolioId: t.portfolioId,
    portfolioName: t.portfolio.name,
    assetClass: t.assetClass,
    assetKey:
      t.assetKey ??
      computeAssetKey({
        stockId: t.stockId,
        fundId: t.fundId,
        isin: t.isin,
        assetName: t.assetName,
      }),
    assetName: t.stock?.name ?? t.fund?.schemeName ?? t.assetName ?? t.stock?.symbol ?? 'Unnamed',
    transactionType: t.transactionType,
    tradeDate: isoDay(t.tradeDate),
    quantity: t.quantity.toString(),
    price: t.price.toString(),
    netAmount: t.netAmount.toString(),
    broker: t.broker,
    orderNo: t.orderNo,
    tradeNo: t.tradeNo,
    importJobId: t.importJobId,
    importFileName: t.importJob?.fileName ?? null,
    sourceAdapter: t.sourceAdapter,
    createdAt: t.createdAt.toISOString(),
  }));

  const entries = await prisma.rentLedgerEntry.findMany({
    where: { tenancy: { property: { userId } } },
    select: {
      id: true,
      tenancyId: true,
      entryType: true,
      amount: true,
      entryDate: true,
      forMonth: true,
      note: true,
      createdAt: true,
      tenancy: { select: { tenantName: true, property: { select: { name: true } } } },
    },
  });

  const rentRows: DuplicateRentRow[] = entries.map((e) => ({
    id: e.id,
    tenancyId: e.tenancyId,
    property: e.tenancy.property.name,
    tenant: e.tenancy.tenantName,
    entryType: e.entryType,
    entryDate: isoDay(e.entryDate),
    amount: e.amount.toString(),
    forMonth: e.forMonth,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  }));

  return {
    groups: [...groupTransactionDuplicates(txnRows), ...groupRentDuplicates(rentRows)],
    scanned: { transactions: txnRows.length, rentEntries: rentRows.length },
  };
}

/**
 * Removes exactly the ids handed in. Each delete goes through the owning
 * service so holdings, capital gains and the rent khata are recomputed, and so
 * a row belonging to somebody else is refused.
 */
export async function removeDuplicates(
  userId: string,
  ids: { transactionIds?: string[]; rentEntryIds?: string[] },
): Promise<{ removedTransactions: number; removedRentEntries: number }> {
  let removedTransactions = 0;
  for (const id of ids.transactionIds ?? []) {
    await deleteTransaction(userId, id);
    removedTransactions += 1;
  }

  let removedRentEntries = 0;
  for (const id of ids.rentEntryIds ?? []) {
    await deleteLedgerEntry(userId, id);
    removedRentEntries += 1;
  }

  return { removedTransactions, removedRentEntries };
}

export type { DuplicateGroup } from './duplicateMatch.js';
