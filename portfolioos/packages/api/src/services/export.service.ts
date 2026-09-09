import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { Decimal, toDecimal } from '@portfolioos/shared';
import { drawHorizontalBarChart, pdfSafe, type BarDatum } from './charts/pdfCharts.js';
import { themeFor, hexToArgb, type PdfTheme, type ThemeName } from './charts/pdfTheme.js';

export type { PdfTheme, ThemeName } from './charts/pdfTheme.js';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown) => string;
  /**
   * Alignment for the header AND every cell in the column. Omit to infer it
   * from the column's own data: a column whose first non-empty value looks
   * numeric aligns right, anything else left.
   */
  align?: 'left' | 'right';
}

export interface ExportSection {
  title: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  emptyMessage?: string;
  /**
   * Optional final row, keyed the same as `rows`, rendered distinct from the
   * data rows (top rule, bold, the theme's table-header background).
   * Formatted through each column's own `formatter`, same as any other row.
   * Omit entirely to render no totals row.
   */
  totals?: Record<string, unknown>;
}

export interface ExportPayload {
  title: string;
  subtitle?: string;
  meta?: Record<string, string | number>;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  // Footer values are shown as metric cards at the top of the PDF.
  footer?: Record<string, string | number>;
  // Optional bar chart of top items by value.
  chartRows?: BarDatum[];
  chartTitle?: string;
  /**
   * 'light' switches to the printable ink-on-paper theme; 'dark' is the
   * app's own brand skin. Defaults to 'dark' — every caller that never
   * opted into a theme keeps rendering exactly as it always has.
   */
  theme?: ThemeName;
  // Optional explicit filename (no extension). Falls back to slugified title.
  filenameStem?: string;
  // Additional sections rendered after the main table (e.g. Transactions,
  // Realised Trades, Income).
  additionalSections?: ExportSection[];
  // Optional label shown on the main table band (defaults to "Details").
  mainSectionLabel?: string;
  /**
   * Optional final row for the MAIN table only, keyed the same as `rows`.
   * See `ExportSection.totals` for the rendering contract.
   */
  totals?: Record<string, unknown>;
  /**
   * Optional short line rendered in muted text directly beneath the main
   * table — for a caveat the totals row alone can't carry (e.g. "Paid
   * includes a security deposit not applied to this balance"). Omit when
   * there's nothing to explain.
   */
  note?: string;
}

// ─── Excel (XLSX) ───────────────────────────────────────────────────

export async function streamExcel(res: Response, payload: ExportPayload): Promise<void> {
  const C = themeFor(payload.theme);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PortfolioOS';
  wb.created = new Date();
  const ws = wb.addWorksheet(payload.title.slice(0, 31));

  let row = 1;
  ws.getCell(row, 1).value = payload.title;
  ws.getCell(row, 1).font = { bold: true, size: 14 };
  row += 1;

  if (payload.meta) {
    for (const [k, v] of Object.entries(payload.meta)) {
      ws.getCell(row, 1).value = k;
      ws.getCell(row, 1).font = { bold: true };
      ws.getCell(row, 2).value = String(v);
      row += 1;
    }
    row += 1;
  }

  const headerRow = ws.getRow(row);
  payload.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    // Fill + font both come from the theme so the header reads whichever
    // theme was requested — the previous fixed near-black fill (`FF20240F`)
    // sat under cell text that Excel always renders dark, making the header
    // unreadable regardless of theme.
    cell.font = { bold: true, color: { argb: hexToArgb(C.ink) } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexToArgb(C.tableHeaderBg) },
    };
    if (col.width) ws.getColumn(i + 1).width = col.width;
  });
  row += 1;

  for (const data of payload.rows) {
    const r = ws.getRow(row);
    payload.columns.forEach((col, i) => {
      const raw = data[col.key];
      r.getCell(i + 1).value = col.formatter
        ? col.formatter(raw)
        : (raw as ExcelJS.CellValue);
    });
    row += 1;
  }

  if (payload.totals) {
    const r = ws.getRow(row);
    payload.columns.forEach((col, i) => {
      const raw = payload.totals![col.key];
      const cell = r.getCell(i + 1);
      cell.value = col.formatter ? col.formatter(raw) : (raw as ExcelJS.CellValue);
      cell.font = { bold: true, color: { argb: hexToArgb(C.ink) } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(C.tableHeaderBg) } };
      cell.border = { top: { style: 'thin', color: { argb: hexToArgb(C.border) } } };
    });
    row += 1;
  }

  if (payload.note) {
    row += 1;
    ws.getCell(row, 1).value = payload.note;
    ws.getCell(row, 1).font = { italic: true, color: { argb: hexToArgb(C.muted) } };
    row += 1;
  }

  if (payload.footer) {
    row += 1;
    for (const [k, v] of Object.entries(payload.footer)) {
      ws.getCell(row, 1).value = k;
      ws.getCell(row, 1).font = { bold: true };
      ws.getCell(row, 2).value = String(v);
      row += 1;
    }
  }

  const safeTitle = payload.title.replace(/[^a-z0-9-_]+/gi, '_');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// Manually truncate a string so it fits inside `maxWidth` at the document's
// current font/size. Caller must set the desired font/size BEFORE calling.
// Returns the input unchanged when it already fits.
function fitText(doc: InstanceType<typeof PDFDocument>, text: string, maxWidth: number): string {
  if (!text) return '';
  if (doc.widthOfString(text) <= maxWidth) return text;
  const ellipsis = '...';
  const ellW = doc.widthOfString(ellipsis);
  if (ellW > maxWidth) return '';
  // Binary-search the longest prefix that fits with the ellipsis suffix.
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (doc.widthOfString(text.slice(0, mid)) + ellW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

// ─── PDF ────────────────────────────────────────────────────────────

export function streamPdf(res: Response, payload: ExportPayload): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const safeTitle = (payload.filenameStem ?? payload.title).replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);

    const C = themeFor(payload.theme);
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
    doc.on('end', resolve);
    doc.on('error', reject);
    res.on('error', reject);
    doc.pipe(res);

    const ML    = doc.page.margins.left;
    const MR    = doc.page.margins.right;
    const pageW = doc.page.width - ML - MR;
    const pageH = doc.page.height;
    const BOT   = pageH - 40;  // bottom safe y for content

    function renderPageHeader(): void {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.pageBg);
      doc.rect(0, 0, doc.page.width, 56).fill(C.headerBarBg);
      if (C.headerRule) doc.rect(0, 55.5, doc.page.width, 0.5).fill(C.border);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(C.titleInk)
         .text('PortfolioOS', ML, 14, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(C.muted)
         .text(pdfSafe(payload.title), ML, 36, { lineBreak: false });
      const genStr = `Generated  ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
         .text(genStr, ML, 22, { align: 'right', width: pageW, lineBreak: false });
      if (payload.subtitle) {
        doc.font('Helvetica').fontSize(8).fillColor(C.muted)
           .text(pdfSafe(payload.subtitle), ML, 38, { align: 'right', width: pageW, lineBreak: false });
      }
    }

    renderPageHeader();
    let cy = 72;

    // ─── META STRIP — single-line, single-color, never wraps ────────
    // Pre-rendered single string avoids the continued: true chain that
    // PDFKit auto-paginates when it overflows pageW.
    if (payload.meta && Object.keys(payload.meta).length > 0) {
      const parts = Object.entries(payload.meta)
        .map(([k, v]) => `${pdfSafe(k)}: ${pdfSafe(String(v))}`);
      const fullStr = parts.join('   ·   ');
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted);
      const fitted = fitText(doc, fullStr, pageW);
      doc.text(fitted, ML, cy, { width: pageW, lineBreak: false });
      cy += 16;
    }

    // ─── METRIC CARDS ────────────────────────────────────────────────
    if (payload.footer && Object.keys(payload.footer).length > 0) {
      const entries = Object.entries(payload.footer);
      const cardCount = entries.length;
      const gap = 8;
      const cardW = (pageW - gap * (cardCount - 1)) / cardCount;
      const cardH = 44;
      entries.forEach(([k, v], i) => {
        const cx = ML + i * (cardW + gap);
        doc.rect(cx, cy, cardW, cardH).fill(C.headerBg);
        if (C.accentBar) doc.rect(cx, cy, 3, cardH).fill(C.accent);
        doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
           .text(pdfSafe(k).toUpperCase(), cx + 10, cy + 8, { width: cardW - 14, characterSpacing: 0.5, lineBreak: false });
        const valStr = pdfSafe(String(v));
        const isNeg = valStr.startsWith('-') && (k.toLowerCase().includes('p&l') || k.toLowerCase().includes('gain') || k.toLowerCase().includes('loss'));
        doc.font('Helvetica-Bold').fontSize(13).fillColor(isNeg ? C.negative : C.ink)
           .text(valStr, cx + 10, cy + 22, { width: cardW - 16, ellipsis: true, lineBreak: false });
      });
      cy += cardH + 14;
    }

    // ─── CHART (top N items, horizontal bars) ────────────────────────
    if (payload.chartRows && payload.chartRows.length > 0) {
      cy = drawSectionBand(doc, ML, pageW, cy, payload.chartTitle ?? 'Top items by value', C);
      const chartH = Math.min(payload.chartRows.length * 18 + 8, 200);
      const bottom = drawHorizontalBarChart(doc, payload.chartRows, {
        x: ML, y: cy, width: pageW, height: chartH,
      });
      cy = bottom + 12;
    }

    // ─── MAIN TABLE ──────────────────────────────────────────────────
    cy = renderTable(doc, {
      x: ML, y: cy, width: pageW, pageH,
      label: payload.mainSectionLabel ?? 'Details',
      columns: payload.columns,
      rows: payload.rows,
      emptyMessage: 'No records to display.',
      onPageBreak: () => { doc.addPage(); renderPageHeader(); return 72; },
        C,
      totals: payload.totals,
    });
    cy += 10;

    // ─── RECONCILIATION NOTE — directly beneath the main table only ──
    if (payload.note) {
      if (cy + 30 > BOT) {
        doc.addPage();
        renderPageHeader();
        cy = 72;
      }
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(C.muted)
         .text(pdfSafe(payload.note), ML, cy, { width: pageW });
      cy = doc.y + 10;
    }

    // ─── ADDITIONAL SECTIONS (e.g. Transactions, Realised Trades) ────
    for (const section of payload.additionalSections ?? []) {
      // Force new page if section header would land too close to bottom
      if (cy + 60 > BOT) {
        doc.addPage();
        renderPageHeader();
        cy = 72;
      }
      cy = renderTable(doc, {
        x: ML, y: cy, width: pageW, pageH,
        label: section.title,
        columns: section.columns,
        rows: section.rows,
        emptyMessage: section.emptyMessage ?? 'None.',
        onPageBreak: () => { doc.addPage(); renderPageHeader(); return 72; },
        C,
        totals: section.totals,
      });
      cy += 10;
    }

    // ─── PAGE NUMBERS ────────────────────────────────────────────────
    // Do NOT pass `width` to this text call. PDFKit's `text` routes any
    // width-bearing call through LineWrapper.wrap(), which at line 3041
    // checks `if (doc.y > maxY) nextSection()` and triggers a
    // continueOnNewPage() — appending a blank page per iteration. Our
    // footer y (pageH - 22 = 820) sits below maxY (= pageH - bottomMargin
    // = 802), so the wrapper fired every time. `lineBreak: false` is
    // honoured for wrapping but does not suppress that overflow check.
    // Centre the string manually via widthOfString to avoid the wrapper.
    const range = doc.bufferedPageRange();
    doc.font('Helvetica').fontSize(7);
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const txt = `PortfolioOS  ·  ${safeTitle}  ·  Page ${i + 1} of ${range.count}`;
      const tw  = doc.widthOfString(txt);
      const tx  = ML + (pageW - tw) / 2;
      doc.fillColor(C.muted).text(txt, tx, pageH - 22, { lineBreak: false });
    }

    doc.flushPages();
    doc.end();
  });
}

// Section header band — light blue field with an accent vertical bar on the
// left and dark ink text. Replaces the previous solid dark-navy bar that made
// the report feel visually heavy when several sections stacked.
function drawSectionBand(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  y: number,
  label: string,
  C: PdfTheme,
): number {
  const H = 20;
  doc.rect(x, y, width, H).fill(C.headerBg);
  if (C.accentBar) doc.rect(x, y, 3, H).fill(C.accent);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink)
     .text(pdfSafe(label), x + 10, y + 6, { width: width - 18, lineBreak: false });
  return y + H + 4;
}

interface RenderTableOpts {
  x: number;
  y: number;
  width: number;
  pageH: number;
  label: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  emptyMessage: string;
  onPageBreak: () => number;  // returns new cy after adding page + header
  C: PdfTheme;
  /** Optional final row — see `ExportSection.totals`. Skipped when there are no rows. */
  totals?: Record<string, unknown>;
}

function renderTable(doc: InstanceType<typeof PDFDocument>, o: RenderTableOpts): number {
  const C = o.C;
  let cy = drawSectionBand(doc, o.x, o.width, o.y, o.label, C);
  const BOT = o.pageH - 40;

  if (o.rows.length === 0) {
    doc.rect(o.x, cy, o.width, 36).fill(C.rowAlt);
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
       .text(o.emptyMessage, o.x, cy + 12, { width: o.width, align: 'center', lineBreak: false });
    return cy + 40;
  }

  const totalWeight = o.columns.reduce((s, c) => s + (c.width ?? 10), 0) || o.columns.length;
  const colWidths   = o.columns.map(c => ((c.width ?? 10) / totalWeight) * o.width);
  const ROW_H       = 16;

  const looksNumeric = (s: string): boolean =>
    /^[+-]?[\d,.]+%?$/.test(s.trim()) || /^[+-]?Rs/.test(s.trim());

  const cellText = (col: ExportColumn, row: Record<string, unknown>): string => {
    const raw = row[col.key];
    return pdfSafe(col.formatter ? col.formatter(raw) : raw == null ? '' : String(raw));
  };

  // One alignment per column, shared by the header and every cell. Previously
  // each cell decided for itself while the header was always left — so the
  // header of a money column floated left of its own right-aligned figures,
  // in every report this renderer produces.
  const colAlign: Array<'left' | 'right'> = o.columns.map((c) => {
    if (c.align) return c.align;
    for (const row of o.rows) {
      const s = cellText(c, row).trim();
      if (s) return looksNumeric(s) ? 'right' : 'left';
    }
    return 'left';
  });

  const drawHeader = (yy: number): void => {
    // Table column header — dark slate background, ink text. Distinct from
    // section header (headerBg) and row background (rowAlt).
    doc.rect(o.x, yy, o.width, ROW_H).fill(C.tableHeaderBg);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.ink);
    let x = o.x;
    for (let i = 0; i < o.columns.length; i++) {
      const cellW = (colWidths[i] ?? 80) - 8;
      doc.text(fitText(doc, pdfSafe(o.columns[i]!.header), cellW), x + 4, yy + 5, {
        width: cellW, align: colAlign[i] ?? 'left', lineBreak: false,
      });
      x += colWidths[i] ?? 80;
    }
  };

  drawHeader(cy);
  cy += ROW_H;

  for (let idx = 0; idx < o.rows.length; idx++) {
    if (cy + ROW_H > BOT) {
      cy = o.onPageBreak();
      cy = drawSectionBand(doc, o.x, o.width, cy, `${o.label} (continued)`, C);
      drawHeader(cy);
      cy += ROW_H;
    }

    if (idx % 2 === 1) doc.rect(o.x, cy, o.width, ROW_H).fill(C.rowAlt);
    let x = o.x;
    doc.font('Helvetica').fontSize(8);
    for (let i = 0; i < o.columns.length; i++) {
      const col = o.columns[i]!;
      const safe = cellText(col, o.rows[idx]!);
      const isNeg = safe.trim().startsWith('-');
      const align = colAlign[i] ?? 'left';
      const cellW = (colWidths[i] ?? 80) - 8;
      // Manually truncate so we can guarantee single-line — PDFKit's
      // lineBreak:false + ellipsis:true combo is unreliable when text is
      // far wider than the column. doc.widthOfString uses real font metrics.
      const display = fitText(doc, safe, cellW);
      doc.fillColor(isNeg ? C.negative : C.ink)
         .text(display, x + 4, cy + 5, {
           width: cellW, align, lineBreak: false,
         });
      x += colWidths[i] ?? 80;
    }
    cy += ROW_H;
  }

  // ─── TOTALS ROW — visually distinct from the data above it: a top rule,
  // bold text, the theme's table-header background. Skipped when the caller
  // didn't supply one, so every other report is unaffected.
  if (o.totals) {
    if (cy + ROW_H > BOT) {
      cy = o.onPageBreak();
      cy = drawSectionBand(doc, o.x, o.width, cy, `${o.label} (continued)`, C);
      drawHeader(cy);
      cy += ROW_H;
    }
    doc.rect(o.x, cy, o.width, 0.75).fill(C.border);  // top rule
    cy += 1;                                          // nudge past the rule
    doc.rect(o.x, cy, o.width, ROW_H).fill(C.tableHeaderBg);
    let tx = o.x;
    doc.font('Helvetica-Bold').fontSize(8);
    for (let i = 0; i < o.columns.length; i++) {
      const col = o.columns[i]!;
      const safe = cellText(col, o.totals);
      const isNeg = safe.trim().startsWith('-');
      const align = colAlign[i] ?? 'left';
      const cellW = (colWidths[i] ?? 80) - 8;
      const display = fitText(doc, safe, cellW);
      doc.fillColor(isNeg ? C.negative : C.ink)
         .text(display, tx + 4, cy + 5, {
           width: cellW, align, lineBreak: false,
         });
      tx += colWidths[i] ?? 80;
    }
    cy += ROW_H;
  }

  // Thin bottom border
  doc.rect(o.x, cy, o.width, 0.5).fill(C.border);
  return cy;
}

// Format money or quantity for reports. Parses through Decimal so the 4dp/6dp
// strings coming off the API don't lose their last digit to IEEE-754 before
// en-IN grouping is applied (§3.2).
export function fmtNum(v: unknown, decimals = 2): string {
  if (v == null || v === '') return '';
  let d: Decimal;
  try {
    d = toDecimal(v as Parameters<typeof toDecimal>[0]);
  } catch {
    return String(v);
  }
  if (!d.isFinite()) return String(v);
  const fixed = d.toFixed(decimals, Decimal.ROUND_HALF_EVEN);
  // Indian grouping (lakhs/crores): first group of 3 from the right, then 2's.
  const [intPart, fracPart] = fixed.split('.');
  const negative = intPart!.startsWith('-');
  const digits = negative ? intPart!.slice(1) : intPart!;
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const signed = negative ? '-' + grouped : grouped;
  return fracPart ? `${signed}.${fracPart}` : signed;
}

export function fmtDate(v: unknown): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
