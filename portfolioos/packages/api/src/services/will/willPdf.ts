/**
 * The will as a printed legal document: plain white A4, black serif text,
 * numbered sections with hanging sub-clauses, a ruled Schedule whose header
 * repeats on every page it runs onto, and an execution page that keeps the
 * testator's signature and both witness blocks together. Draws the same
 * blocks the preview shows and the text hash covers. CreationDate is pinned to
 * the will's date, so the same will renders to the same bytes.
 *
 * Every page carries a small strip for the testator's and the witnesses'
 * initials: signing or initialling every page is the usual Indian practice
 * that stops a page being swapped later. The template disclaimer prints once,
 * on the last page.
 */
import PDFDocument from 'pdfkit';
import type { WillBlockV2 } from '@everypaisa/shared';
import { scriptRuns, WILL_FONTS } from './willFonts.js';

type Doc = InstanceType<typeof PDFDocument>;
type Block = WillBlockV2;
type BlockOf<T extends Block['t']> = Extract<Block, { t: T }>;

export interface WillPdfInput {
  blocks: Block[];
  /** YYYY-MM-DD */
  generatedOn: string;
  footer: string;
  /** Printed at the top of every page after the first, e.g. "Last Will and Testament of A B". */
  runningHead?: string;
}

const INK = '#111111';
const MUTED = '#4A4A4A';
const RULE = '#9A9A9A';
const HAIRLINE = '#C8C8C8';
const MARGIN_X = 72;
const MARGIN_TOP = 78;
const MARGIN_BOTTOM = 92; // room for the initials strip and the page number
const HANG = 30; // hanging indent of section text
/**
 * Latin ligatures off: they draw "fi"/"ffi" as one glyph that some viewers
 * copy or search as "i", and a will's text must copy exactly as written.
 * fontkit takes an object of overrides on top of its default features (so
 * kerning and the Devanagari shaping features stay on); pdfkit's types only
 * describe the array form, which can switch features on but never off.
 */
const FEATURES = { liga: false, clig: false } as unknown as PDFKit.Mixins.OpenTypeFeatures[];

/** The type scale. Every piece of text in the will uses one of these. */
interface Style {
  font: 'body' | 'bold' | 'italic';
  size: number;
  lineGap: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  spacing?: number;
}
const S = {
  title: { font: 'bold', size: 17, lineGap: 2, align: 'center', spacing: 2 },
  testator: { font: 'bold', size: 12.5, lineGap: 2, align: 'center' },
  body: { font: 'body', size: 11, lineGap: 3.2, align: 'justify' },
  sectionHead: { font: 'bold', size: 10.5, lineGap: 2, spacing: 0.6 },
  subNo: { font: 'body', size: 11, lineGap: 3.2 },
  scheduleHead: { font: 'bold', size: 13, lineGap: 2, align: 'center', spacing: 2.5 },
  partHead: { font: 'bold', size: 10.5, lineGap: 2, spacing: 0.4 },
  groupHead: { font: 'italic', size: 9.5, lineGap: 1.5 },
  th: { font: 'bold', size: 8.5, lineGap: 1.2 },
  td: { font: 'body', size: 8.8, lineGap: 1.4 },
  note: { font: 'italic', size: 9, lineGap: 2, align: 'justify', color: MUTED },
  execBody: { font: 'body', size: 10.5, lineGap: 3, align: 'justify' },
  label: { font: 'body', size: 9.5, lineGap: 1.5 },
  caption: { font: 'italic', size: 9, lineGap: 1.5, color: MUTED },
  witnessHead: { font: 'bold', size: 10, lineGap: 1.5, spacing: 0.6 },
  footer: { font: 'body', size: 7.5, lineGap: 1, color: MUTED },
  head: { font: 'italic', size: 8.5, lineGap: 1, align: 'center', color: MUTED },
} satisfies Record<string, Style>;

function fontFor(st: Style, deva: boolean): string {
  if (deva) return st.font === 'bold' ? 'deva-bold' : 'deva';
  return st.font;
}

function opts(st: Style, width: number, extra: Record<string, unknown> = {}) {
  return {
    width,
    align: st.align ?? 'left',
    lineGap: st.lineGap,
    characterSpacing: st.spacing ?? 0,
    features: FEATURES,
    ...extra,
  };
}

/** Height of `text` set in `st` at `width`, measured with the fonts it will be drawn with. */
function measure(doc: Doc, text: string, st: Style, width: number): number {
  const runs = scriptRuns(text);
  doc.fontSize(st.size).font(fontFor(st, false));
  if (runs.length === 0) return 0;
  let h = doc.heightOfString(text, opts(st, width));
  if (runs.some((r) => r.deva)) {
    // Devanagari lines are taller; take the larger of the two measurements.
    doc.font(fontFor(st, true));
    h = Math.max(h, doc.heightOfString(text, opts(st, width)));
  }
  return h;
}

/** Draw `text` at (x, y) in `st`, switching font per script run. Leaves doc.y below the text. */
function draw(doc: Doc, text: string, st: Style, x: number, y: number, width: number): void {
  const runs = scriptRuns(text);
  doc.fontSize(st.size).fillColor(st.color ?? INK);
  if (runs.length === 0) {
    doc.y = y;
    return;
  }
  if (runs.length > 1 && (st.align === 'center' || st.align === 'right')) {
    // pdfkit aligns each font run on its own, so a centred mixed-script line overlaps itself.
    // A line that fits is laid out by hand: measure every run, then place them side by side.
    const widths = runs.map((r) => {
      doc.font(fontFor(st, r.deva));
      return doc.widthOfString(r.text, { characterSpacing: st.spacing ?? 0, features: FEATURES });
    });
    const total = widths.reduce((s, w) => s + w, 0);
    if (total <= width) {
      let cx = x + (st.align === 'center' ? (width - total) / 2 : width - total);
      runs.forEach((r, i) => {
        doc.font(fontFor(st, r.deva));
        doc.text(r.text, cx, y, { lineBreak: false, characterSpacing: st.spacing ?? 0, features: FEATURES });
        cx += widths[i]!;
      });
      doc.y = y + measure(doc, text, st, width);
      return;
    }
  }
  // pdfkit justifies each font run on its own line segment, which opens wide gaps around a
  // change of script; a mixed-script paragraph is set ragged-right instead.
  const align = runs.length > 1 && st.align === 'justify' ? 'left' : st.align;
  runs.forEach((r, i) => {
    doc.font(fontFor(st, r.deva));
    const o = opts({ ...st, align }, width, { continued: i < runs.length - 1 });
    if (i === 0) doc.text(r.text, x, y, o);
    else doc.text(r.text, o);
  });
}

const left = (doc: Doc) => doc.page.margins.left;
const contentWidth = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const bottom = (doc: Doc) => doc.page.height - doc.page.margins.bottom;
const atTop = (doc: Doc) => doc.y <= doc.page.margins.top + 0.5;

/** New page unless `h` points still fit. Already at the top, a new page would only add a blank one. */
function ensure(doc: Doc, h: number): void {
  if (!atTop(doc) && doc.y + h > bottom(doc)) doc.addPage();
}

function gap(doc: Doc, pts: number): void {
  if (!atTop(doc)) doc.y += pts;
}

function rule(doc: Doc, x1: number, x2: number, y: number, color = RULE, width = 0.6): void {
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor(color).stroke();
}

/* ---------------------------------------------------------------- sections */

function sectionHeadHeight(doc: Doc, b: BlockOf<'section'>): number {
  return 9 + measure(doc, b.title.toUpperCase(), S.sectionHead, contentWidth(doc) - HANG) + 6;
}

function sectionParaHeight(doc: Doc, text: string): number {
  return measure(doc, text, S.body, contentWidth(doc) - HANG) + 5;
}

function drawSection(doc: Doc, b: BlockOf<'section'>): void {
  const x = left(doc);
  const w = contentWidth(doc) - HANG;
  // The heading never ends a page: it moves with its first paragraph.
  ensure(doc, sectionHeadHeight(doc, b) + (b.paras[0] ? sectionParaHeight(doc, b.paras[0].text) : 0));
  gap(doc, 9);
  const y = doc.y;
  draw(doc, `${b.n}.`, S.sectionHead, x, y, HANG);
  draw(doc, b.title.toUpperCase(), S.sectionHead, x + HANG, y, w);
  doc.y += 6;
  for (const p of b.paras) {
    const h = sectionParaHeight(doc, p.text);
    // A paragraph longer than a page flows on by itself; anything shorter is not split.
    if (h < bottom(doc) - doc.page.margins.top) ensure(doc, h);
    const py = doc.y;
    if (p.n) draw(doc, p.n, S.subNo, x, py, HANG);
    draw(doc, p.text, S.body, x + HANG, py, w);
    doc.y += 5;
  }
}

/* ---------------------------------------------------------------- schedule */

interface Cols {
  xs: number[];
  ws: number[];
}

function columns(doc: Doc, b: BlockOf<'schedule'>): Cols {
  const total = b.columns.reduce((s, c) => s + c.width, 0);
  const xs: number[] = [];
  const ws: number[] = [];
  let x = left(doc);
  for (const c of b.columns) {
    const w = (contentWidth(doc) * c.width) / total;
    xs.push(x);
    ws.push(w);
    x += w;
  }
  return { xs, ws };
}

const PAD = 3;

function cellStyle(b: BlockOf<'schedule'>, i: number, base: Style): Style {
  return { ...base, align: b.columns[i]?.align ?? 'left' };
}

function rowHeight(doc: Doc, b: BlockOf<'schedule'>, cols: Cols, cells: readonly string[], base: Style): number {
  let h = 0;
  cells.forEach((c, i) => {
    h = Math.max(h, measure(doc, c, cellStyle(b, i, base), cols.ws[i]! - 2 * PAD));
  });
  return h + 2 * PAD + 1;
}

function drawRow(doc: Doc, b: BlockOf<'schedule'>, cols: Cols, cells: readonly string[], base: Style, h: number): void {
  const y = doc.y;
  cells.forEach((c, i) => draw(doc, c, cellStyle(b, i, base), cols.xs[i]! + PAD, y + PAD, cols.ws[i]! - 2 * PAD));
  doc.y = y + h;
}

function drawHeaderRow(doc: Doc, b: BlockOf<'schedule'>, cols: Cols): void {
  const labels = b.columns.map((c) => c.label);
  if (labels.every((l) => l === '')) return;
  const h = rowHeight(doc, b, cols, labels, S.th);
  const x2 = left(doc) + contentWidth(doc);
  rule(doc, left(doc), x2, doc.y, INK, 0.8);
  drawRow(doc, b, cols, labels, S.th, h);
  rule(doc, left(doc), x2, doc.y, INK, 0.5);
}

function groupHeadHeight(doc: Doc, title: string): number {
  return title ? measure(doc, title, S.groupHead, contentWidth(doc)) + 2 * PAD + 2 : 0;
}

function drawGroupHead(doc: Doc, title: string): void {
  if (!title) return;
  const y = doc.y;
  draw(doc, title, S.groupHead, left(doc) + PAD, y + PAD + 1, contentWidth(doc) - 2 * PAD);
  doc.y = y + groupHeadHeight(doc, title);
}

function partHeadHeight(doc: Doc, b: BlockOf<'schedule'>): number {
  return b.title ? measure(doc, b.title.toUpperCase(), S.partHead, contentWidth(doc)) + 6 : 0;
}

function drawSchedule(doc: Doc, b: BlockOf<'schedule'>): void {
  const cols = columns(doc, b);
  const x2 = left(doc) + contentWidth(doc);
  const labels = b.columns.map((c) => c.label);
  const headerH = labels.every((l) => l === '') ? 0 : rowHeight(doc, b, cols, labels, S.th);
  const firstGroup = b.groups[0];
  const firstRowH = firstGroup?.rows[0] ? rowHeight(doc, b, cols, firstGroup.rows[0], S.td) : 0;
  const introH = b.intro ? measure(doc, b.intro, S.note, contentWidth(doc)) + 4 : 0;
  // The part title, its header row, the first group title and first row stay together.
  ensure(doc, 10 + partHeadHeight(doc, b) + introH + headerH + (firstGroup ? groupHeadHeight(doc, firstGroup.title) : 0) + firstRowH);
  gap(doc, 10);
  if (b.title) {
    draw(doc, b.title.toUpperCase(), S.partHead, left(doc), doc.y, contentWidth(doc));
    doc.y += 6;
  }
  if (b.intro) {
    draw(doc, b.intro, S.note, left(doc), doc.y, contentWidth(doc));
    doc.y += 4;
  }
  drawHeaderRow(doc, b, cols);

  const continued = () => {
    doc.addPage();
    if (b.title) {
      draw(doc, `${b.title.toUpperCase()} (CONTINUED)`, S.partHead, left(doc), doc.y, contentWidth(doc));
      doc.y += 6;
    }
    drawHeaderRow(doc, b, cols);
  };

  for (const g of b.groups) {
    const gh = groupHeadHeight(doc, g.title);
    const r0 = g.rows[0] ? rowHeight(doc, b, cols, g.rows[0], S.td) : 0;
    // A group title never ends a page without its first row.
    if (doc.y + gh + r0 > bottom(doc)) continued();
    drawGroupHead(doc, g.title);
    for (const r of g.rows) {
      const h = rowHeight(doc, b, cols, r, S.td);
      if (doc.y + h > bottom(doc)) continued();
      drawRow(doc, b, cols, r, S.td, h);
      rule(doc, left(doc), x2, doc.y, HAIRLINE, 0.4);
    }
  }
  rule(doc, left(doc), x2, doc.y, INK, 0.8);
  doc.y += 4;
}

/* --------------------------------------------------------------- execution */

const SIGN_SPACE = 30; // room above a signature line for a handwritten signature
const FIELD_SPACE = 20; // room above any other line
const COL_GAP = 36;

/** A labelled blank: a line with its label beneath, `space` points of writing room above it. */
function lineFieldHeight(doc: Doc, label: string, w: number, space: number): number {
  return space + 3 + measure(doc, label, S.label, w) + 4;
}

function drawLineField(doc: Doc, label: string, x: number, w: number, space: number): void {
  const y = doc.y + space;
  rule(doc, x, x + w, y, INK, 0.6);
  draw(doc, label, S.label, x, y + 3, w);
  doc.y = y + 3 + measure(doc, label, S.label, w) + 4;
}

function witnessSpace(f: string): number {
  if (f === 'Signature') return SIGN_SPACE;
  if (f === 'Address') return FIELD_SPACE * 2; // two written lines
  return FIELD_SPACE;
}

function witnessColumnHeight(doc: Doc, b: BlockOf<'execution'>, w: number): number {
  let h = measure(doc, 'WITNESS 1', S.witnessHead, w) + 2;
  for (const f of b.witnessFields) h += lineFieldHeight(doc, f, w, witnessSpace(f));
  return h;
}

function executionHeight(doc: Doc, b: BlockOf<'execution'>): number {
  const w = contentWidth(doc);
  const half = (w - COL_GAP) / 2;
  const rows = Math.ceil(b.witnessCount / 2);
  const fields = b.fields.reduce((s, f) => s + lineFieldHeight(doc, f, half, FIELD_SPACE), 0);
  const sign = b.testator
    ? lineFieldHeight(doc, 'Signature of the Testator', half, SIGN_SPACE) + measure(doc, `(${b.testator})`, S.caption, half)
    : 0;
  return 16
    + (b.testimonium ? measure(doc, b.testimonium, S.execBody, w) + 10 : 0)
    + (fields || sign ? Math.max(fields, sign) + 18 : 0)
    + measure(doc, b.attestation, S.execBody, w) + 12
    + rows * witnessColumnHeight(doc, b, half) + (rows - 1) * 12;
}

function drawExecution(doc: Doc, b: BlockOf<'execution'>): void {
  const x = left(doc);
  const w = contentWidth(doc);
  const half = (w - COL_GAP) / 2;
  const xRight = x + half + COL_GAP;
  // The whole block - testimonium, signature, attestation, both witnesses - on one page.
  ensure(doc, executionHeight(doc, b));
  gap(doc, 16);
  if (b.testimonium) {
    draw(doc, b.testimonium, S.execBody, x, doc.y, w);
    doc.y += 10;
  }

  if (b.fields.length || b.testator) {
    // Place and date on the left, the testator's signature on the right.
    const top = doc.y;
    for (const f of b.fields) drawLineField(doc, f, x, half, FIELD_SPACE);
    const leftEnd = doc.y;
    doc.y = top;
    if (b.testator) {
      drawLineField(doc, 'Signature of the Testator', xRight, half, SIGN_SPACE);
      draw(doc, `(${b.testator})`, S.caption, xRight, doc.y, half);
    }
    doc.y = Math.max(leftEnd, doc.y) + 18;
  }

  draw(doc, b.attestation, S.execBody, x, doc.y, w);
  doc.y += 12;

  // Witnesses two to a row, side by side.
  let rowTop = doc.y;
  let rowEnd = rowTop;
  for (let i = 0; i < b.witnessCount; i++) {
    if (i > 0 && i % 2 === 0) rowTop = rowEnd + 12;
    const cx = i % 2 === 0 ? x : xRight;
    doc.y = rowTop;
    draw(doc, `WITNESS ${i + 1}`, S.witnessHead, cx, doc.y, half);
    doc.y += 2;
    for (const f of b.witnessFields) drawLineField(doc, f, cx, half, witnessSpace(f));
    rowEnd = Math.max(rowEnd, doc.y);
  }
  doc.y = rowEnd;
}

/* --------------------------------------------------- the rest of the blocks */

function drawTitle(doc: Doc, text: string): void {
  draw(doc, text.toUpperCase(), S.title, left(doc), doc.y, contentWidth(doc));
  doc.y += 4;
}

function drawHeading(doc: Doc, b: BlockOf<'heading'>, startsAnnexure: boolean): void {
  const mid = left(doc) + contentWidth(doc) / 2;
  if (startsAnnexure) {
    if (!atTop(doc)) doc.addPage();
    draw(doc, b.text.toUpperCase(), S.scheduleHead, left(doc), doc.y, contentWidth(doc));
    doc.y += 4;
    rule(doc, mid - 40, mid + 40, doc.y, INK, 0.6);
    doc.y += 12;
    return;
  }
  // The testator's name under the title.
  draw(doc, b.text, S.testator, left(doc), doc.y, contentWidth(doc));
  doc.y += 8;
  rule(doc, mid - 60, mid + 60, doc.y, INK, 0.6);
  doc.y += 18;
}

function drawPara(doc: Doc, text: string): void {
  const h = measure(doc, text, S.body, contentWidth(doc));
  if (h < bottom(doc) - doc.page.margins.top) ensure(doc, h);
  draw(doc, text, S.body, left(doc), doc.y, contentWidth(doc));
  doc.y += 8;
}

function drawNote(doc: Doc, text: string): void {
  ensure(doc, measure(doc, text, S.note, contentWidth(doc)));
  draw(doc, text, S.note, left(doc), doc.y, contentWidth(doc));
  doc.y += 6;
}

/** v1 blocks, drawn in the v2 style so an older template still prints cleanly. */
function drawV1(doc: Doc, b: BlockOf<'clause' | 'table' | 'signature' | 'witnesses'>): void {
  switch (b.t) {
    case 'clause':
      drawSection(doc, { t: 'section', n: b.n, title: b.title, paras: b.paras.map((text) => ({ n: '', text })) });
      return;
    case 'table':
      drawSchedule(doc, {
        t: 'schedule',
        title: b.title ?? '',
        intro: null,
        columns: [{ label: '', width: 0.6, align: 'left' }, { label: '', width: 0.4, align: 'left' }],
        groups: [{ title: '', rows: b.rows }],
      });
      return;
    case 'signature':
      for (const l of b.lines) {
        draw(doc, l, S.execBody, left(doc), doc.y, contentWidth(doc));
        doc.y += 4;
      }
      return;
    case 'witnesses':
      drawExecution(doc, {
        t: 'execution', testimonium: '', fields: [], testator: '', attestation: b.intro,
        witnessCount: b.count, witnessFields: b.fields,
      });
  }
}

function drawBlock(doc: Doc, blocks: Block[], i: number): void {
  const b = blocks[i]!;
  switch (b.t) {
    case 'title':
      drawTitle(doc, b.text);
      return;
    case 'heading': {
      // A heading followed by the Schedule (directly or after its note) opens the annexure on a new page.
      const annexure = blocks[i + 1]?.t === 'schedule' || blocks[i + 2]?.t === 'schedule';
      drawHeading(doc, b, annexure);
      return;
    }
    case 'para':
      drawPara(doc, b.text);
      return;
    case 'note':
      drawNote(doc, b.text);
      return;
    case 'section':
      drawSection(doc, b);
      return;
    case 'schedule':
      drawSchedule(doc, b);
      return;
    case 'execution':
      drawExecution(doc, b);
      return;
    default:
      drawV1(doc, b);
  }
}

/* ------------------------------------------------------- headers / footers */

function drawPageFurniture(doc: Doc, footer: string, runningHead: string | undefined): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not add a page
    const x = doc.page.margins.left;
    const w = doc.page.width - x - doc.page.margins.right;
    const page = i - range.start + 1;
    if (runningHead && page > 1) {
      const hy = MARGIN_TOP - 36;
      draw(doc, runningHead, S.head, x, hy, w);
      rule(doc, x, x + w, hy + 15, HAIRLINE, 0.4);
    }
    const y = doc.page.height - MARGIN_BOTTOM + 26;
    rule(doc, x, x + w, y, HAIRLINE, 0.4);
    // Initials strip: a short line each for the testator and both witnesses on every page.
    const slot = (w - 90) / 3;
    ['Testator', 'Witness 1', 'Witness 2'].forEach((label, k) => {
      const sx = x + k * slot;
      rule(doc, sx, sx + slot - 18, y + 26, RULE, 0.5);
      draw(doc, label, S.footer, sx, y + 29, slot - 18);
    });
    draw(doc, `Page ${page} of ${range.count}`, { ...S.footer, align: 'right' }, x + w - 90, y + 29, 90);
    if (page === range.count) {
      draw(doc, footer, { font: 'italic', size: 6.8, lineGap: 1, align: 'center', color: MUTED }, x, y + 46, w);
    }
    doc.page.margins.bottom = keep;
  }
}

export function renderWillPdf(input: WillPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const created = new Date(`${input.generatedOn}T00:00:00Z`);
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN_TOP, left: MARGIN_X, right: MARGIN_X, bottom: MARGIN_BOTTOM },
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
      doc.registerFont('italic', WILL_FONTS.italic);
      doc.registerFont('deva', WILL_FONTS.deva);
      doc.registerFont('deva-bold', WILL_FONTS.devaBold);
      for (let i = 0; i < input.blocks.length; i++) drawBlock(doc, input.blocks, i);
      drawPageFurniture(doc, input.footer, input.runningHead);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
