/**
 * The receipt as a piece of paper.
 *
 * Deliberately NOT built on `ExportPayload`. That renders tables, and a
 * receipt is not a table: it is an issuer, a number, one sentence saying who
 * paid whom how much for what, the amount said twice, and a signature.
 *
 * It is drawn the way banks and registrars draw theirs, because that is what
 * people trust on paper:
 *
 *  - a letterhead in the ISSUER's name (the account holder — the landlord on
 *    a rent receipt), on a navy band with a fine guilloche line pattern of
 *    the kind printed on cheques and certificates;
 *  - the receipt number and date in ruled form cells;
 *  - the formal sentence ("Received with thanks from … the sum of …"), which
 *    is how receipts in India are written, with the particulars below it as
 *    a ruled grid for reference;
 *  - an amount box, a signature block and a RECEIVED / PAID seal;
 *  - the ledger posting and a footer, inside a double-ruled frame.
 *
 * The frame wraps the content rather than the page. A receipt is a slip; a
 * full-page border around a third of a page of text read as a document that
 * failed to finish.
 *
 * Printed on white, always: it gets printed, attached to a return or emailed
 * to a tenant. `Rs.` rather than `₹` — see `format.ts`.
 */

import PDFDocument from 'pdfkit';
import type { ReceiptDocument } from './receiptData.js';
import { RUPEE_FIELDS } from './receiptData.js';
import { inr } from './format.js';

type Doc = InstanceType<typeof PDFDocument>;

const INK = '#1B2027';
const MUTED = '#5B6572';
const NAVY = '#15304D';
const NAVY_LINE = '#2C4D73';
const RULE = '#B8C2CF';
const SHADE = '#F2F5F9';
const AMOUNT_BG = '#F5F8FC';
const AMOUNT_LINE = '#DCE4EE';
const SEAL_IN = '#1F6B46';
const SEAL_OUT = NAVY;

const PAGE_MARGIN = 36;
/** Content sits this far inside the outer frame line. */
const PAD = 24;
/** Width of the shaded label column in the particulars grid. */
const LABEL_W = 150;

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Fine interlaced waves across a rectangle — the security-print texture on
 * cheques and share certificates. Clipped to the rectangle, drawn under
 * whatever sits on it.
 */
function guilloche(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  strands = 12,
): void {
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.lineWidth(0.35).strokeColor(color);
  for (let i = 0; i < strands; i++) {
    const phase = (i / strands) * Math.PI * 2;
    const amp = h * 0.32;
    const mid = y + h / 2;
    doc.moveTo(x, mid + amp * Math.sin(phase));
    for (let px = 4; px <= w; px += 4) {
      const t = px / w;
      const yy =
        mid +
        amp * Math.sin(t * Math.PI * 6 + phase) * 0.7 +
        amp * Math.sin(t * Math.PI * 2.5 - phase * 1.5) * 0.3;
      doc.lineTo(x + px, yy);
    }
    doc.stroke();
  }
  doc.restore();
}

/**
 * Size `text` to fit `room` on one line: shrink from `size` towards `min`,
 * and only if it still does not fit, cut it with an ellipsis. PDFKit's own
 * `ellipsis` does not stop a wrap at a hyphen, so this measures instead.
 */
function fitLine(
  doc: Doc,
  text: string,
  room: number,
  size: number,
  min: number,
  spacing = 0,
): { text: string; size: number } {
  let s = size;
  const w = (t: string) => doc.fontSize(s).widthOfString(t, { characterSpacing: spacing });
  while (s > min && w(text) > room) s -= 0.5;
  if (w(text) <= room) return { text, size: s };
  let cut = text;
  while (cut.length > 1 && w(`${cut}…`) > room) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size: s };
}

/** A small spaced caption above a block, in the navy of the letterhead. */
function caption(doc: Doc, text: string, x: number, y: number): number {
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(NAVY)
    .text(text.toUpperCase(), x, y, { characterSpacing: 1, lineBreak: false });
  return y + 12;
}

/**
 * Draw one receipt onto the current page.
 *
 * Kept separate from `renderReceiptPdf` so a bundle can put many receipts in
 * one file, one per page, without re-opening a document each time.
 */
export function drawReceipt(doc: Doc, receipt: ReceiptDocument): void {
  const frameX = PAGE_MARGIN;
  const frameW = doc.page.width - PAGE_MARGIN * 2;
  const left = frameX + PAD;
  const width = frameW - PAD * 2;
  const right = left + width;

  // ── Letterhead ──
  const bandX = frameX + 4;
  const bandY = PAGE_MARGIN + 4;
  const bandW = frameW - 8;
  const bandH = 68;
  doc.rect(bandX, bandY, bandW, bandH).fillColor(NAVY).fill();
  guilloche(doc, bandX, bandY, bandW, bandH, NAVY_LINE, 14);

  const headW = width * 0.52;
  doc.font('Helvetica-Bold');
  const issuer = fitLine(doc, receipt.issuedBy, headW, 17, 12);
  doc
    .fontSize(issuer.size)
    .fillColor('#FFFFFF')
    .text(issuer.text, left, bandY + 20 + (17 - issuer.size) / 2, {
      width: headW + 20,
      lineBreak: false,
    });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#C6D3E2')
    .text(receipt.issuerEmail ?? 'Issuer', left, bandY + 42, {
      width: headW,
      lineBreak: false,
      ellipsis: true,
    });

  // The title shrinks to its half of the band rather than running into a
  // long issuer name: "PREMIUM PAYMENT RECEIPT" is twice "RENT RECEIPT".
  const titleRoom = width - headW - 16;
  doc.font('Helvetica-Bold');
  const title = fitLine(doc, receipt.title.toUpperCase(), titleRoom, 15, 10, 1.2);
  doc
    .fontSize(title.size)
    .fillColor('#FFFFFF')
    .text(title.text, left + headW + 16, bandY + 20 + (15 - title.size) / 2, {
      width: titleRoom,
      align: 'right',
      characterSpacing: 1.2,
      lineBreak: false,
    });
  // "ORIGINAL" in an outlined tag, as printed on bank-issued copies.
  doc.font('Helvetica-Bold').fontSize(6.5);
  const tag = 'ORIGINAL';
  const tagW = doc.widthOfString(tag, { characterSpacing: 1.4 }) + 14;
  const tagX = right - tagW;
  const tagY = bandY + 42;
  doc.roundedRect(tagX, tagY, tagW, 13, 2).lineWidth(0.7).strokeColor('#C6D3E2').stroke();
  doc
    .fillColor('#FFFFFF')
    .text(tag, tagX, tagY + 3.6, { width: tagW, align: 'center', characterSpacing: 1.4, lineBreak: false });

  let y = bandY + bandH + 18;

  // ── Reference strip: number and date, in ruled form cells ──
  const stripH = 40;
  const half = width / 2;
  doc.rect(left, y, width, stripH).fillColor(SHADE).fill();
  doc.rect(left, y, width, stripH).lineWidth(0.6).strokeColor(RULE).stroke();
  doc.moveTo(left + half, y).lineTo(left + half, y + stripH).lineWidth(0.6).strokeColor(RULE).stroke();
  const cell = (label: string, value: string, x: number) => {
    doc
      .font('Helvetica')
      .fontSize(6.8)
      .fillColor(MUTED)
      .text(label.toUpperCase(), x + 12, y + 8, { characterSpacing: 0.8, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(value, x + 12, y + 20, { width: half - 24, lineBreak: false, ellipsis: true });
  };
  cell('Receipt no.', receipt.number, left);
  cell('Date', prettyDate(receipt.date), left + half);
  y += stripH + 22;

  // ── The receipt, as one sentence ──
  doc.fillColor(INK).fontSize(11.5);
  receipt.statement.forEach((part, i) => {
    doc.font(part.strong ? 'Helvetica-Bold' : 'Helvetica');
    const last = i === receipt.statement.length - 1;
    if (i === 0) {
      doc.text(part.text, left, y, { width, lineGap: 5, continued: !last });
    } else {
      doc.text(part.text, { lineGap: 5, continued: !last });
    }
  });
  y = doc.y + 22;

  // ── Particulars, as a ruled grid ──
  y = caption(doc, 'Particulars', left, y);
  const rows = receipt.fields
    .filter((f) => f.label !== 'Amount') // stated twice already
    .map((f) => ({
      label: f.label,
      value: RUPEE_FIELDS.has(f.label) && /^-?\d+(\.\d+)?$/.test(f.value) ? inr(f.value) : f.value,
    }));
  if (receipt.narration) rows.push({ label: 'Narration', value: receipt.narration });

  const valueX = left + LABEL_W;
  const valueW = width - LABEL_W;
  const gridTop = y;
  doc.fontSize(9.5);
  for (const row of rows) {
    doc.font('Helvetica-Bold');
    const lh = doc.heightOfString(row.label, { width: LABEL_W - 20 });
    doc.font('Helvetica');
    const vh = doc.heightOfString(row.value, { width: valueW - 20 });
    const rowH = Math.max(lh, vh) + 14;

    doc.rect(left, y, LABEL_W, rowH).fillColor(SHADE).fill();
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(row.label, left + 10, y + 7, { width: LABEL_W - 20 });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(INK)
      .text(row.value, valueX + 10, y + 7, { width: valueW - 20 });
    y += rowH;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(RULE).stroke();
  }
  if (rows.length > 0) {
    doc.rect(left, gridTop, width, y - gridTop).lineWidth(0.6).strokeColor(RULE).stroke();
    doc.moveTo(valueX, gridTop).lineTo(valueX, y).lineWidth(0.5).strokeColor(RULE).stroke();
  }
  y += 24;

  // ── Amount box, signature and seal ──
  const boxW = width * 0.5;
  const boxH = 76;
  doc.rect(left, y, boxW, boxH).fillColor(AMOUNT_BG).fill();
  guilloche(doc, left, y, boxW, boxH, AMOUNT_LINE, 10);
  doc.rect(left, y, boxW, boxH).lineWidth(0.9).strokeColor(NAVY).stroke();
  doc
    .font('Helvetica')
    .fontSize(6.8)
    .fillColor(MUTED)
    .text(receipt.isInflow ? 'AMOUNT RECEIVED' : 'AMOUNT PAID', left + 12, y + 9, {
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(21)
    .fillColor(NAVY)
    .text(inr(receipt.amount), left + 12, y + 21, { width: boxW - 24, lineBreak: false });
  doc
    .font('Helvetica-Oblique')
    .fontSize(8.5)
    .fillColor(INK)
    .text(receipt.amountWords, left + 12, y + 50, { width: boxW - 24, height: 22, ellipsis: true });

  const sigX = left + width * 0.6;
  const sigW = right - sigX;
  doc.font('Helvetica');
  const forLine = fitLine(doc, `For ${receipt.issuedBy}`, sigW, 8.5, 7.5);
  doc
    .fontSize(forLine.size)
    .fillColor(MUTED)
    .text(forLine.text, sigX, y + 2, { width: sigW, align: 'right', lineBreak: false });
  const lineY = y + boxH - 16;
  doc.moveTo(sigX, lineY).lineTo(right, lineY).lineWidth(0.8).strokeColor(INK).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(INK)
    .text(
      receipt.isInflow ? 'Signature of receiver' : 'Authorised signatory',
      sigX,
      lineY + 5,
      { width: sigW, align: 'right', lineBreak: false },
    );

  // The seal: set beside the signature, turned a few degrees, the way a
  // rubber stamp lands. Semi-opaque so the line under it still shows.
  const sealW = 112;
  const sealH = 38;
  const sealCx = sigX + sealW / 2 + 6;
  const sealCy = y + 34;
  const sealColor = receipt.isInflow ? SEAL_IN : SEAL_OUT;
  doc.save();
  doc.rotate(-9, { origin: [sealCx, sealCy] });
  doc.opacity(0.82);
  doc
    .roundedRect(sealCx - sealW / 2, sealCy - sealH / 2, sealW, sealH, 5)
    .lineWidth(1.8)
    .strokeColor(sealColor)
    .stroke();
  doc
    .roundedRect(sealCx - sealW / 2 + 3, sealCy - sealH / 2 + 3, sealW - 6, sealH - 6, 3)
    .lineWidth(0.5)
    .strokeColor(sealColor)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .fillColor(sealColor)
    .text(receipt.isInflow ? 'RECEIVED' : 'PAID', sealCx - sealW / 2, sealCy - 11, {
      width: sealW,
      align: 'center',
      characterSpacing: 2.2,
      lineBreak: false,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(6.8)
    .text(prettyDate(receipt.date).toUpperCase(), sealCx - sealW / 2, sealCy + 4, {
      width: sealW,
      align: 'center',
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc.restore();

  y += boxH + 26;

  // ── Ledger posting ──
  //
  // A receipt is not a voucher, but whoever files it usually wants to know
  // which accounts moved, and printing it here means the paper reconciles to
  // the books without a second document.
  y = caption(doc, 'Ledger posting', left, y);
  const colDr = width * 0.4;
  const colCr = width * 0.4;
  const colAmt = width - colDr - colCr;
  const headH = 18;
  const postTop = y;
  doc.rect(left, y, width, headH).fillColor(SHADE).fill();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
  doc.text('Debit', left + 10, y + 5.5, { lineBreak: false });
  doc.text('Credit', left + colDr + 10, y + 5.5, { lineBreak: false });
  doc.text('Amount', left, y + 5.5, { width: width - 10, align: 'right', lineBreak: false });
  y += headH;
  const shown = receipt.entries.slice(0, 5);
  for (const e of shown) {
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(RULE).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(INK);
    doc.text(e.debit, left + 10, y + 5.5, { width: colDr - 20, lineBreak: false, ellipsis: true });
    doc.text(e.credit, left + colDr + 10, y + 5.5, {
      width: colCr - 20,
      lineBreak: false,
      ellipsis: true,
    });
    doc.text(inr(e.amount), left + colDr + colCr, y + 5.5, {
      width: colAmt - 10,
      align: 'right',
      lineBreak: false,
    });
    y += 19;
  }
  if (receipt.entries.length > shown.length) {
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(RULE).stroke();
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(MUTED)
      .text(`and ${receipt.entries.length - shown.length} more`, left + 10, y + 5.5, {
        lineBreak: false,
      });
    y += 19;
  }
  doc.rect(left, postTop, width, y - postTop).lineWidth(0.6).strokeColor(RULE).stroke();
  doc
    .moveTo(left + colDr, postTop)
    .lineTo(left + colDr, y)
    .moveTo(left + colDr + colCr, postTop)
    .lineTo(left + colDr + colCr, y)
    .lineWidth(0.4)
    .strokeColor(RULE)
    .stroke();
  y += 22;

  // ── Footer ──
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(RULE).stroke();
  y += 8;
  const generated = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      'Computer-generated receipt, prepared from the issuer’s recorded transactions.',
      left,
      y,
      { width, lineBreak: false },
    );
  y += 11;
  doc.text(`Generated on ${generated} with EveryPaisa`, left, y, { lineBreak: false });
  doc.text(`Ledger ref ${receipt.ledgerRef}`, left + width * 0.45, y, {
    width: width * 0.55,
    align: 'right',
    lineBreak: false,
    ellipsis: true,
  });
  y += 10 + PAD - 6;

  // ── Frame: a heavy outer rule and a hairline just inside it ──
  doc
    .rect(frameX, PAGE_MARGIN, frameW, y - PAGE_MARGIN)
    .lineWidth(1.2)
    .strokeColor(NAVY)
    .stroke();
  doc
    .rect(frameX + 2.5, PAGE_MARGIN + 2.5, frameW - 5, y - PAGE_MARGIN - 5)
    .lineWidth(0.4)
    .strokeColor(RULE)
    .stroke();
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
      doc.rect(0, 0, doc.page.width, doc.page.height).fillColor('#FFFFFF').fill();
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
