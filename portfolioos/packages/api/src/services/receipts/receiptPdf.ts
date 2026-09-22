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
 * The layout is one column inside a hairline frame, and everything hangs off
 * two vertical rhythms: a label column and a value column that never move.
 * The first version let each block find its own left edge and pinned the
 * signature to the bottom of the page, which on a short receipt left a hand's
 * width of nothing in the middle and read as a broken page rather than a
 * document. Content now flows, and only the footnote is pinned.
 *
 * Printed on the light theme, always. This gets printed, attached to a return,
 * or emailed to a tenant; the app's dark skin is wrong in all three places.
 * `Rs.` rather than `₹` for the same reason the charts use it — PDFKit's
 * built-in Helvetica has no U+20B9 glyph and would draw a blank box.
 */

import PDFDocument from 'pdfkit';
import { LIGHT_THEME } from '../charts/pdfTheme.js';
import { drawBrandLockup } from '../charts/pdfBrand.js';
import type { ReceiptDocument } from './receiptData.js';

const C = LIGHT_THEME;

const PAGE_MARGIN = 44;
/** The frame sits inside the margin; everything else sits inside the frame. */
const FRAME_PAD = 26;
/** Where values start. Fixed, so labels and values line up down the page. */
const LABEL_W = 150;

/** Rs. with Indian digit grouping, for a string already fixed to 2dp. */
function inr(amount: string): string {
  const [whole = '0', frac = '00'] = amount.split('.');
  const negative = whole.startsWith('-');
  const digits = whole.replace('-', '');
  const head = digits.length > 3 ? digits.slice(0, digits.length - 3) : '';
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  return `${negative ? '-' : ''}Rs. ${grouped}.${frac}`;
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** A label in the muted ink, small caps-ish, used to open each section. */
function sectionLabel(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  x: number,
  y: number,
  width: number,
): number {
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(C.muted)
    .text(text.toUpperCase(), x, y, { width, characterSpacing: 0.8 });
  const ruleY = y + 12;
  doc.moveTo(x, ruleY).lineTo(x + width, ruleY).lineWidth(0.5).strokeColor(C.border).stroke();
  return ruleY + 10;
}

/**
 * Draw one receipt onto the current page.
 *
 * Kept separate from `renderReceiptPdf` so a bundle can put many receipts in
 * one file, one per page, without re-opening a document each time.
 */
export function drawReceipt(
  doc: InstanceType<typeof PDFDocument>,
  receipt: ReceiptDocument,
): void {
  const frameX = PAGE_MARGIN;
  const frameW = doc.page.width - PAGE_MARGIN * 2;
  const left = frameX + FRAME_PAD;
  const width = frameW - FRAME_PAD * 2;
  const right = left + width;
  const valueX = left + LABEL_W;
  const valueW = width - LABEL_W;

  // ── Masthead ──
  //
  // Brand on the left, document name on the right. The title is right-aligned
  // against the brand rather than centred under it: centred, it collided with
  // the lockup on long names and floated free of everything else on short ones.
  let y = PAGE_MARGIN + FRAME_PAD;
  drawBrandLockup(doc, C, left, y, 14);

  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(C.titleInk)
    .text(receipt.title.toUpperCase(), left + 200, y + 3, {
      width: width - 200,
      align: 'right',
      characterSpacing: 0.4,
    });

  y += 40;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1.2).strokeColor(C.ink).stroke();

  // ── Number and date, facing each other ──
  y += 14;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
  doc.text('RECEIPT NO.', left, y, { characterSpacing: 0.6 });
  doc.text('DATE', left, y, { width, align: 'right', characterSpacing: 0.6 });

  y += 11;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink);
  doc.text(receipt.number, left, y, { width: width / 2 });
  doc.text(prettyDate(receipt.date), left, y, { width, align: 'right' });

  // ── Counterparty ──
  y += 26;
  const party = receipt.isInflow ? receipt.receivedFrom : receipt.paidTo;
  if (party) {
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(
        receipt.isInflow ? 'RECEIVED WITH THANKS FROM' : 'PAID TO',
        left,
        y,
        { characterSpacing: 0.6 },
      );
    y += 12;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.titleInk).text(party, left, y, { width });
    y += 24;
  }

  // ── The amount, said twice, in one bordered band ──
  const bandH = 56;
  doc.rect(left, y, width, bandH).fillColor(C.rowAlt).fill();
  doc.rect(left, y, width, bandH).lineWidth(0.6).strokeColor(C.border).stroke();
  // A rule down the left edge, heavier, so the band reads as a stamp rather
  // than a grey slab.
  doc.rect(left, y, 3, bandH).fillColor(C.ink).fill();

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(C.muted)
    .text('AMOUNT', left + 16, y + 11, { characterSpacing: 0.6 });
  doc
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor(C.titleInk)
    .text(inr(receipt.amount), left + 16, y + 22, { width: width - 32, align: 'right' });
  doc
    .font('Helvetica-Oblique')
    .fontSize(9)
    .fillColor(C.muted)
    .text(receipt.amountWords, left + 16, y + 26, { width: width - 200 });

  y += bandH + 22;

  // ── Particulars ──
  y = sectionLabel(doc, 'Particulars', left, y, width);

  for (const field of receipt.fields) {
    if (field.label === 'Amount') continue; // already stated, twice
    const rowTop = y;
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(field.label, left, y, {
      width: LABEL_W - 12,
    });
    const labelBottom = doc.y;
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(C.ink)
      .text(field.value, valueX, rowTop, { width: valueW });
    y = Math.max(labelBottom, doc.y) + 9;
    doc.moveTo(left, y - 4).lineTo(right, y - 4).lineWidth(0.3).strokeColor(C.border).stroke();
  }

  if (receipt.narration) {
    const rowTop = y;
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text('Narration', left, y, {
      width: LABEL_W - 12,
    });
    const labelBottom = doc.y;
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(C.ink)
      .text(receipt.narration, valueX, rowTop, { width: valueW });
    y = Math.max(labelBottom, doc.y) + 9;
    doc.moveTo(left, y - 4).lineTo(right, y - 4).lineWidth(0.3).strokeColor(C.border).stroke();
  }

  // ── The ledger legs ──
  //
  // A receipt is not a voucher, but whoever files it usually wants to know
  // which accounts moved, and printing it here means the paper reconciles to
  // the books without a second document.
  y += 14;
  y = sectionLabel(doc, 'Accounting entry', left, y, width);

  for (const e of receipt.entries.slice(0, 5)) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(`Dr  ${e.debit}`, left, y, { width: width * 0.42, ellipsis: true, lineBreak: false });
    doc.text(`Cr  ${e.credit}`, left + width * 0.44, y, {
      width: width * 0.32,
      ellipsis: true,
      lineBreak: false,
    });
    doc
      .font('Helvetica')
      .fillColor(C.ink)
      .text(inr(e.amount), left, y, { width, align: 'right', lineBreak: false });
    y += 13;
  }
  if (receipt.entries.length > 5) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(`and ${receipt.entries.length - 5} more`, left, y);
    y += 13;
  }

  // ── Signature ──
  //
  // Sits a clear gap below the content, but is pushed down to just above the
  // footnote whenever the receipt is short. A receipt is signed at the foot of
  // the page; leaving the signature high and a hand's width of nothing beneath
  // it reads as a page that failed to finish rather than a document.
  const footYPinned = doc.page.height - PAGE_MARGIN - 34;
  const signY = Math.min(Math.max(y + 58, footYPinned - 66), footYPinned - 30);
  const signW = 190;
  doc
    .moveTo(right - signW, signY)
    .lineTo(right, signY)
    .lineWidth(0.8)
    .strokeColor(C.ink)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(C.ink)
    .text(receipt.issuedBy, right - signW, signY + 7, { width: signW, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(C.muted)
    .text(
      receipt.isInflow ? 'Signature of recipient' : 'Authorised signatory',
      right - signW,
      signY + 20,
      { width: signW, align: 'center' },
    );

  // ── Frame ──
  //
  // Drawn last so no fill lands on top of it.
  const frameBottom = doc.page.height - PAGE_MARGIN;
  doc
    .rect(frameX, PAGE_MARGIN, frameW, frameBottom - PAGE_MARGIN)
    .lineWidth(0.6)
    .strokeColor(C.border)
    .stroke();

  // ── Footnote, pinned inside the frame ──
  const footY = frameBottom - 34;
  doc.moveTo(left, footY).lineTo(right, footY).lineWidth(0.3).strokeColor(C.border).stroke();
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(C.muted)
    .text(`Ledger reference ${receipt.ledgerRef}`, left, footY + 8, {
      width: width / 2,
      ellipsis: true,
      lineBreak: false,
    });
  doc.text(
    'Computer-generated from recorded transactions. Valid without a physical seal.',
    left,
    footY + 8,
    { width, align: 'right', lineBreak: false },
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

    receipts.forEach((r, i) => {
      if (i > 0) doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(C.pageBg).fill();
      drawReceipt(doc, r);
    });

    doc.end();
  });
}

/** `2025-05-02-rent-RR-20250502-A1B2.pdf` — sortable, and says what it is. */
export function receiptFileName(receipt: ReceiptDocument): string {
  const kind = receipt.kind.toLowerCase().replace(/_/g, '-');
  const safeNumber = receipt.number.replace(/[^A-Za-z0-9._-]/g, '-');
  return `${receipt.date}-${kind}-${safeNumber}.pdf`;
}
