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
/**
 * Latin ligatures off: they draw "fi"/"ffi" as one glyph that some viewers
 * copy or search as "i", and a will's text must copy exactly as written.
 * fontkit takes an object of overrides on top of its default features (so
 * kerning and the Devanagari shaping features stay on); pdfkit's types only
 * describe the array form, which can switch features on but never off.
 */
const FEATURES = { liga: false, clig: false } as unknown as PDFKit.Mixins.OpenTypeFeatures[];

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
    const opts = { width, align: o.align ?? 'left', continued: i < runs.length - 1, lineGap: 2, features: FEATURES };
    if (i === 0) doc.text(r.text, x, doc.y, opts);
    else doc.text(r.text, opts);
  });
  if (o.gapAfter) doc.moveDown(o.gapAfter);
}

/**
 * Start a new page unless `needed` points still fit, so a block is not split.
 * Already at the top of a page, a new page would only add a blank one.
 */
function keepTogether(doc: Doc, needed: number): void {
  if (doc.y > doc.page.margins.top && doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

/** One write, or vertical space in lines of the given font size. */
type Step = { text: string; o: WriteOpts } | { space: number; size: number };

type BlockOf<T extends WillBlock['t']> = Extract<WillBlock, { t: T }>;

const paraSteps = (text: string): Step[] => [{ text, o: { size: 10.5, align: 'justify', gapAfter: 0.6 } }];

const signatureSteps = (b: BlockOf<'signature'>): Step[] => [
  ...b.lines.map((line): Step => ({ text: line, o: { size: 10.5, gapAfter: 0.3 } })),
  { space: 0.8, size: 10.5 },
];

function witnessSteps(b: BlockOf<'witnesses'>): Step[] {
  const steps: Step[] = [{ text: b.intro, o: { size: 10, align: 'justify', gapAfter: 0.8 } }];
  for (let i = 1; i <= b.count; i++) {
    steps.push({ text: `Witness ${i}`, o: { size: 10.5, bold: true, gapAfter: 0.4 } });
    for (const f of b.fields) steps.push({ text: `${f}: ______________________________`, o: { size: 10, gapAfter: 0.7 } });
  }
  return steps;
}

function runSteps(doc: Doc, steps: Step[]): void {
  for (const s of steps) {
    if ('text' in s) write(doc, s.text, s.o);
    else doc.moveDown(s.space);
  }
}

/** Height `write` will use, measured with the fonts it will draw with. */
function measure(doc: Doc, text: string, o: WriteOpts): number {
  const x = doc.page.margins.left + (o.indent ?? 0);
  const width = doc.page.width - doc.page.margins.right - x;
  const opts = { width, align: o.align ?? 'left', lineGap: 2, features: FEATURES };
  doc.font(o.bold ? 'bold' : 'body').fontSize(o.size);
  const lineHeight = doc.currentLineHeight(true);
  const runs = scriptRuns(text);
  if (runs.length === 0) return lineHeight * 0.6;
  let height = doc.heightOfString(text, opts);
  if (runs.some((r) => r.deva)) {
    // Devanagari lines are taller; take the larger of the two measurements.
    doc.font(o.bold ? 'deva-bold' : 'deva');
    height = Math.max(height, doc.heightOfString(text, opts));
  }
  return height + lineHeight * (o.gapAfter ?? 0);
}

function measureSteps(doc: Doc, steps: Step[]): number {
  let height = 0;
  for (const s of steps) {
    if ('text' in s) height += measure(doc, s.text, s.o);
    else height += doc.fontSize(s.size).currentLineHeight(true) * s.space;
  }
  return height;
}

/**
 * Height of the attestation group starting at blocks[i], or 0 when none starts
 * there. The group is the sentence directly before the signature block, the
 * signature block and the witness block: they print on one page so the
 * attestation is never stranded on the page before.
 */
function attestationGroupHeight(doc: Doc, blocks: WillBlock[], i: number): number {
  let j = i;
  let height = 0;
  const first = blocks[j];
  if (first?.t === 'para') {
    if (blocks[j + 1]?.t !== 'signature') return 0;
    height += measureSteps(doc, paraSteps(first.text));
    j++;
  }
  const sig = blocks[j];
  if (sig?.t === 'signature') {
    height += measureSteps(doc, signatureSteps(sig));
    j++;
  }
  const wit = blocks[j];
  if (wit?.t === 'witnesses') height += measureSteps(doc, witnessSteps(wit));
  return height;
}

/**
 * Height of the start of a block: what must follow a heading onto its page.
 * A table needs its title and first row; a clause its title and first
 * paragraph; a paragraph all of itself (a heading's intro is short).
 */
function leadHeight(doc: Doc, b: WillBlock | undefined): number {
  if (!b) return 0;
  switch (b.t) {
    case 'para':
      return measureSteps(doc, paraSteps(b.text));
    case 'note':
      return measure(doc, b.text, { size: 9, gapAfter: 0.6 });
    case 'clause':
      return measure(doc, `${b.n}. ${b.title}`, { size: 11.5, bold: true, gapAfter: 0.3 })
        + (b.paras[0] ? measure(doc, b.paras[0], { size: 10.5, align: 'justify', indent: 14, gapAfter: 0.4 }) : 0);
    case 'table': {
      const title = b.title ? measure(doc, b.title, { size: 10.5, bold: true, gapAfter: 0.3 }) : 0;
      const row = b.rows[0];
      return title + (row
        ? measure(doc, row[0], { size: 10, bold: true, indent: 14, gapAfter: 0.05 }) + measure(doc, row[1], { size: 10, indent: 28, gapAfter: 0.35 })
        : 0);
    }
    case 'heading':
      return measure(doc, b.text, { size: 12, bold: true, align: 'center', gapAfter: 0.8 });
    default:
      return 0;
  }
}

/**
 * Space a heading needs so it never ends a page: itself, the start of the
 * next block, and - when that block is a short intro paragraph - the start of
 * the block after it too (the Schedule heading, its intro, the first item).
 */
function headingGroupHeight(doc: Doc, blocks: WillBlock[], i: number): number {
  const h = blocks[i];
  if (h?.t !== 'heading') return 0;
  const next = blocks[i + 1];
  let height = leadHeight(doc, h) + leadHeight(doc, next);
  if (next?.t === 'para' || next?.t === 'note') height += leadHeight(doc, blocks[i + 2]);
  return height;
}

function drawBlock(doc: Doc, b: WillBlock): void {
  switch (b.t) {
    case 'title':
      write(doc, b.text.toUpperCase(), { size: 17, bold: true, align: 'center', gapAfter: 0.2 });
      return;
    case 'heading':
      write(doc, b.text, { size: 12, bold: true, align: 'center', gapAfter: 0.8 });
      return;
    case 'para':
      runSteps(doc, paraSteps(b.text));
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
      runSteps(doc, signatureSteps(b));
      return;
    case 'witnesses':
      runSteps(doc, witnessSteps(b));
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
    doc.text('Signature of the Testator: ____________________', x, y, { width, align: 'left', lineBreak: false, features: FEATURES });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, x, y, { width, align: 'right', lineBreak: false, features: FEATURES });
    doc.fontSize(7).text(footer, x, y + 14, { width, align: 'center', features: FEATURES });
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
      input.blocks.forEach((b, i) => {
        const group = Math.max(attestationGroupHeight(doc, input.blocks, i), headingGroupHeight(doc, input.blocks, i));
        if (group > 0) keepTogether(doc, group);
        drawBlock(doc, b);
      });
      drawFooters(doc, input.footer);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
