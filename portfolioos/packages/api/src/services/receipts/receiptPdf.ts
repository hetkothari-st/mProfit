/**
 * The receipt as a piece of paper.
 *
 * Deliberately NOT built on `ExportPayload`. That renders tables, and a
 * receipt is not a table: it is a heading, a number, one amount said twice —
 * in figures and in words — the handful of facts that identify what was paid
 * for, and a signature line. Forcing it through the table renderer would
 * produce something that is technically the same data and obviously not a
 * receipt.
 *
 * Printed on the light theme, always. This is a document that gets printed,
 * attached to a return, or emailed to a tenant; the app's dark skin would
 * waste a cartridge and look wrong in every one of those places.
 */

import PDFDocument from 'pdfkit';
import { LIGHT_THEME } from '../charts/pdfTheme.js';
import { drawBrandLockup } from '../charts/pdfBrand.js';
import type { ReceiptDocument } from './receiptData.js';

const C = LIGHT_THEME;
const PAGE_MARGIN = 48;

/** ₹ with Indian digit grouping, for a string that is already fixed to 2dp. */
function inr(amount: string): string {
  const [whole = '0', frac = '00'] = amount.split('.');
  const negative = whole.startsWith('-');
  const digits = whole.replace('-', '');
  // Last three digits, then pairs — 12,34,567.
  const head = digits.length > 3 ? digits.slice(0, digits.length - 3) : '';
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  return `${negative ? '-' : ''}Rs. ${grouped}.${frac}`;
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Draw one receipt onto an open document, starting at the current page.
 *
 * Kept separate from `renderReceiptPdf` so a bundle can put many receipts in
 * one file, one per page, without re-opening a document each time.
 */
export function drawReceipt(
  doc: InstanceType<typeof PDFDocument>,
  receipt: ReceiptDocument,
): void {
  const left = PAGE_MARGIN;
  const right = doc.page.width - PAGE_MARGIN;
  const width = right - left;

  // ── Header: brand, then the document's own name ──
  drawBrandLockup(doc, C, left, PAGE_MARGIN, 15);

  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(C.titleInk)
    .text(receipt.title.toUpperCase(), left, PAGE_MARGIN + 46, { width, align: 'center' });

  doc
    .moveTo(left, PAGE_MARGIN + 74)
    .lineTo(right, PAGE_MARGIN + 74)
    .lineWidth(1)
    .strokeColor(C.border)
    .stroke();

  // ── Number and date, on one line, facing each other ──
  let y = PAGE_MARGIN + 88;
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted);
  doc.text('Receipt no.', left, y);
  doc.text('Date', left, y, { width, align: 'right' });

  y += 13;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink);
  doc.text(receipt.number, left, y);
  doc.text(prettyDate(receipt.date), left, y, { width, align: 'right' });

  // ── Who ──
  y += 30;
  const party = receipt.isInflow ? receipt.receivedFrom : receipt.paidTo;
  if (party) {
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted);
    doc.text(receipt.isInflow ? 'Received with thanks from' : 'Paid to', left, y);
    y += 14;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.titleInk).text(party, left, y);
    y += 22;
  }

  // ── The amount, said twice ──
  y += 6;
  doc.rect(left, y, width, 58).fillColor(C.tableHeaderBg).fill();
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(C.muted)
    .text('Amount', left + 14, y + 10);
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(C.titleInk)
    .text(inr(receipt.amount), left + 14, y + 23, { width: width - 28 });

  y += 66;
  doc
    .font('Helvetica-Oblique')
    .fontSize(10)
    .fillColor(C.ink)
    .text(`(${receipt.amountWords})`, left, y, { width });

  // ── The facts ──
  y += 26;
  for (const field of receipt.fields) {
    if (field.label === 'Amount') continue; // already stated, twice
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(field.label, left, y, {
      width: 150,
    });
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(C.ink)
      .text(field.value, left + 160, y, { width: width - 160 });
    y = Math.max(doc.y, y + 16) + 2;
  }

  if (receipt.narration) {
    y += 6;
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text('Narration', left, y, {
      width: 150,
    });
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(C.ink)
      .text(receipt.narration, left + 160, y, { width: width - 160 });
    y = Math.max(doc.y, y + 16) + 2;
  }

  // ── Signature, bottom right, above the ledger footnote ──
  const signY = Math.max(y + 60, doc.page.height - 190);
  doc
    .moveTo(right - 180, signY)
    .lineTo(right, signY)
    .lineWidth(0.8)
    .strokeColor(C.border)
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(C.muted)
    .text(receipt.issuedBy, right - 180, signY + 6, { width: 180, align: 'center' });
  doc
    .fontSize(8.5)
    .text(
      receipt.isInflow ? 'Signature of recipient' : 'Authorised signatory',
      right - 180,
      signY + 20,
      { width: 180, align: 'center' },
    );

  // ── The ledger legs, small, at the foot ──
  //
  // A receipt is not a voucher, but the person filing it often wants to know
  // which accounts moved — and printing it here means the paper reconciles to
  // the books without a second document.
  let footY = doc.page.height - 118;
  doc
    .moveTo(left, footY)
    .lineTo(right, footY)
    .lineWidth(0.6)
    .strokeColor(C.border)
    .stroke();
  footY += 8;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text('Ledger entries', left, footY);
  footY += 12;
  for (const e of receipt.entries.slice(0, 4)) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(C.muted)
      .text(`Dr ${e.debit}   Cr ${e.credit}`, left, footY, { width: width - 90 });
    doc.text(inr(e.amount), left, footY, { width, align: 'right' });
    footY += 11;
  }
  if (receipt.entries.length > 4) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .text(`and ${receipt.entries.length - 4} more`, left, footY);
  }

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(C.muted)
    .text(
      'Computer-generated from recorded transactions. Valid without a physical seal.',
      left,
      doc.page.height - 58,
      { width, align: 'center' },
    );
}

/** One receipt, as a PDF buffer. */
export function renderReceiptPdf(receipt: ReceiptDocument): Promise<Buffer> {
  return renderReceiptsPdf([receipt]);
}

/** Many receipts in one file, one per page, in the order given. */
export function renderReceiptsPdf(receipts: ReceiptDocument[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(C.pageBg).fill();

    receipts.forEach((r, i) => {
      if (i > 0) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(C.pageBg).fill();
      }
      drawReceipt(doc, r);
    });

    doc.end();
  });
}

/** `rent-receipt-AUTO-RENT-abc123.pdf` — stable, sortable, and says what it is. */
export function receiptFileName(receipt: ReceiptDocument): string {
  const kind = receipt.kind.toLowerCase().replace(/_/g, '-');
  const safeNumber = receipt.number.replace(/[^A-Za-z0-9._-]/g, '-');
  return `${receipt.date}-${kind}-${safeNumber}.pdf`;
}
