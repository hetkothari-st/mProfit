/**
 * The will as a printed document: plain white A4, black text, numbered
 * clauses, a signature line and page number on every page, the disclaimer in
 * the footer. Draws the same WillBlock[] the preview shows and the text hash
 * covers. CreationDate is pinned to the will's date.
 */
import PDFDocument from 'pdfkit';
import type { WillBlock } from '@everypaisa/shared';
import { scriptRuns, WILL_FONTS } from './willFonts.js';

type Doc = InstanceType<typeof PDFDocument>;

export interface WillPdfInput {
  blocks: WillBlock[];
  /** YYYY-MM-DD */
  generatedOn: string;
  footer: string;
}

const INK = '#111111';
const MUTED = '#555555';
const RULE = '#BBBBBB';
const MARGIN = 64;
const BOTTOM = 92; // room for the two-line footer

interface WriteOpts {
  size: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'justify';
  color?: string;
  gapAfter?: number;
  indent?: number;
}

function write(doc: Doc, text: string, o: WriteOpts): void {
  const x = doc.page.margins.left + (o.indent ?? 0);
  const width = doc.page.width - doc.page.margins.right - x;
  doc.fontSize(o.size).fillColor(o.color ?? INK);
  const runs = scriptRuns(text);
  if (runs.length === 0) {
    doc.moveDown(0.6);
    return;
  }
  runs.forEach((r, i) => {
    doc.font(r.deva ? (o.bold ? 'deva-bold' : 'deva') : o.bold ? 'bold' : 'body');
    const opts = { width, align: o.align ?? 'left', continued: i < runs.length - 1, lineGap: 2 };
    if (i === 0) doc.text(r.text, x, doc.y, opts);
    else doc.text(r.text, opts);
  });
  if (o.gapAfter) doc.moveDown(o.gapAfter);
}

/** Start a new page unless `needed` points still fit, so a block is not split. */
function keepTogether(doc: Doc, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function drawBlock(doc: Doc, b: WillBlock): void {
  switch (b.t) {
    case 'title':
      write(doc, b.text.toUpperCase(), { size: 17, bold: true, align: 'center', gapAfter: 0.2 });
      return;
    case 'heading':
      keepTogether(doc, 40);
      write(doc, b.text, { size: 12, bold: true, align: 'center', gapAfter: 0.8 });
      return;
    case 'para':
      write(doc, b.text, { size: 10.5, align: 'justify', gapAfter: 0.6 });
      return;
    case 'note':
      write(doc, b.text, { size: 9, color: MUTED, gapAfter: 0.6 });
      return;
    case 'clause':
      keepTogether(doc, 60);
      write(doc, `${b.n}. ${b.title}`, { size: 11.5, bold: true, gapAfter: 0.3 });
      for (const p of b.paras) write(doc, p, { size: 10.5, align: 'justify', indent: 14, gapAfter: 0.4 });
      doc.moveDown(0.3);
      return;
    case 'table':
      if (b.title) {
        keepTogether(doc, 50);
        write(doc, b.title, { size: 10.5, bold: true, gapAfter: 0.3 });
      }
      for (const [k, v] of b.rows) {
        keepTogether(doc, 32);
        write(doc, k, { size: 10, bold: true, indent: 14, gapAfter: 0.05 });
        write(doc, v, { size: 10, indent: 28, gapAfter: 0.35 });
      }
      doc.moveDown(0.4);
      return;
    case 'signature':
      keepTogether(doc, 120);
      for (const line of b.lines) write(doc, line, { size: 10.5, gapAfter: 0.3 });
      doc.moveDown(0.8);
      return;
    case 'witnesses':
      keepTogether(doc, 320);
      write(doc, b.intro, { size: 10, align: 'justify', gapAfter: 0.8 });
      for (let i = 1; i <= b.count; i++) {
        write(doc, `Witness ${i}`, { size: 10.5, bold: true, gapAfter: 0.4 });
        for (const f of b.fields) write(doc, `${f}: ______________________________`, { size: 10, gapAfter: 0.7 });
      }
      return;
  }
}

function drawFooters(doc: Doc, footer: string): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not add a page
    const x = doc.page.margins.left;
    const width = doc.page.width - x - doc.page.margins.right;
    const y = doc.page.height - BOTTOM + 22;
    doc.moveTo(x, y - 6).lineTo(x + width, y - 6).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.font('body').fontSize(8).fillColor(MUTED);
    doc.text('Signature of the Testator: ____________________', x, y, { width, align: 'left', lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, x, y, { width, align: 'right', lineBreak: false });
    doc.fontSize(7).text(footer, x, y + 14, { width, align: 'center' });
    doc.page.margins.bottom = keep;
  }
}

export function renderWillPdf(input: WillPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const created = new Date(`${input.generatedOn}T00:00:00Z`);
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: BOTTOM },
      bufferPages: true,
      info: { Title: 'Last Will and Testament', Creator: 'EveryPaisa Will Maker', Producer: 'EveryPaisa', CreationDate: created, ModDate: created },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('body', WILL_FONTS.regular);
      doc.registerFont('bold', WILL_FONTS.bold);
      doc.registerFont('deva', WILL_FONTS.deva);
      doc.registerFont('deva-bold', WILL_FONTS.devaBold);
      for (const b of input.blocks) drawBlock(doc, b);
      drawFooters(doc, input.footer);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
