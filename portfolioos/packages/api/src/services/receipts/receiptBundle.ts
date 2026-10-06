/**
 * Many receipts at once: a ZIP of PDFs, or one spreadsheet of the same rows.
 *
 * The two answer different questions. A tenant or an insurer wants the paper,
 * one file per payment, which is the ZIP. A CA wants to work with the set —
 * sort it, total it, tie it to a return — which is the spreadsheet. Producing
 * one and calling it both would serve neither.
 *
 * Selection is by date range and voucher type, the same filters the vouchers
 * list uses, so what you downloaded is what you were looking at.
 */

import ExcelJS from 'exceljs';
import type { VoucherType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { toDecimal } from '@everypaisa/shared';
import { buildReceipt, type ReceiptDocument } from './receiptData.js';
import { renderReceiptPdf, receiptFileName } from './receiptPdf.js';

export interface ReceiptQuery {
  from?: string;
  to?: string;
  type?: VoucherType;
  /**
   * Only vouchers that came from a real-world payment — rent, premiums, loan
   * instalments. Default true: a "receipts" download that swept in every
   * auto-generated buy and sell voucher would be a ledger dump wearing the
   * wrong name.
   */
  paymentsOnly?: boolean;
}

/**
 * The vouchers a receipt download covers, newest first.
 *
 * Capped, because this loads and renders every one of them: a client with ten
 * years of monthly rent is 120 pages, which is fine, and a full ledger replay
 * is not. The cap is stated in the result so a caller can say it was hit
 * rather than silently handing over a truncated set.
 */
const MAX_RECEIPTS = 500;

const PAYMENT_PREFIXES = ['AUTO-RENT-', 'AUTO-PREM-', 'AUTO-LOAN-'];

export interface ReceiptSelection {
  receipts: ReceiptDocument[];
  truncated: boolean;
}

export async function selectReceipts(
  userId: string,
  q: ReceiptQuery = {},
): Promise<ReceiptSelection> {
  const vouchers = await prisma.voucher.findMany({
    where: {
      userId,
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to
        ? {
            date: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}),
              ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    },
    select: { id: true, voucherNo: true, type: true },
    orderBy: { date: 'desc' },
    take: MAX_RECEIPTS + 1,
  });

  const wanted =
    q.paymentsOnly === false
      ? vouchers
      : vouchers.filter(
          (v) =>
            PAYMENT_PREFIXES.some((p) => v.voucherNo.startsWith(p)) ||
            v.type === 'RECEIPT' ||
            v.type === 'PAYMENT',
        );

  const truncated = wanted.length > MAX_RECEIPTS;
  const page = truncated ? wanted.slice(0, MAX_RECEIPTS) : wanted;

  // Sequentially: each one is a handful of queries, and a burst of 500
  // concurrent fan-outs would take the connection pool down with it.
  const receipts: ReceiptDocument[] = [];
  for (const v of page) {
    receipts.push(await buildReceipt(userId, v.id));
  }
  return { receipts, truncated };
}

/** One ZIP, one PDF per receipt, named by date and receipt number. */
export async function zipReceipts(receipts: ReceiptDocument[]): Promise<Buffer> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // Two receipts can share a filename only if they share a voucher number,
  // which the ledger forbids — but a suffix costs nothing and a silently
  // overwritten file inside a ZIP is invisible until someone needs it.
  const used = new Set<string>();
  for (const r of receipts) {
    let name = receiptFileName(r);
    let n = 2;
    while (used.has(name)) name = receiptFileName(r).replace(/\.pdf$/, `-${n++}.pdf`);
    used.add(name);
    zip.file(name, await renderReceiptPdf(r));
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * The same set as a spreadsheet: one row per receipt, totalled.
 *
 * Amounts are written as numbers, not strings, so the totals row is a real
 * SUM and the file is worth opening in Excel at all. The string form is kept
 * alongside in "Amount in words" for anyone reconciling against the PDFs.
 */
export async function receiptsWorkbook(receipts: ReceiptDocument[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EveryPaisa';
  wb.created = new Date();

  const ws = wb.addWorksheet('Receipts');
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Receipt no.', key: 'number', width: 26 },
    { header: 'Type', key: 'kind', width: 16 },
    { header: 'Party', key: 'party', width: 28 },
    { header: 'Details', key: 'details', width: 46 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Amount in words', key: 'words', width: 52 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };

  for (const r of receipts) {
    ws.addRow({
      date: r.date,
      number: r.number,
      kind: r.title,
      party: r.receivedFrom ?? r.paidTo ?? '—',
      details: r.fields
        .filter((f) => f.label !== 'Amount')
        .map((f) => `${f.label}: ${f.value}`)
        .join('; '),
      // eslint-disable-next-line everypaisa/no-money-coercion -- Excel cells hold IEEE doubles; a string here would make the column unsummable. Already fixed to 2dp, well inside exact-integer range for any realistic amount.
      amount: Number(r.amount),
      words: r.amountWords,
    });
  }

  ws.getColumn('amount').numFmt = '#,##0.00';

  const total = receipts.reduce((sum, r) => sum.plus(toDecimal(r.amount)), toDecimal(0));
  const totalRow = ws.addRow({
    number: `${receipts.length} receipt${receipts.length === 1 ? '' : 's'}`,
    // eslint-disable-next-line everypaisa/no-money-coercion -- as above; the total itself is summed as Decimal and only converted at the cell boundary.
    amount: Number(total.toFixed(2)),
  });
  totalRow.font = { bold: true };
  totalRow.getCell('amount').numFmt = '#,##0.00';

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
