import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { Decimal, toDecimal } from '@portfolioos/shared';
import { BRAND, drawHorizontalBarChart, pdfSafe, type BarDatum } from './charts/pdfCharts.js';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown) => string;
}

export interface ExportSection {
  title: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  emptyMessage?: string;
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
  // Optional explicit filename (no extension). Falls back to slugified title.
  filenameStem?: string;
  // Additional sections rendered after the main table (e.g. Transactions,
  // Realised Trades, Income).
  additionalSections?: ExportSection[];
  // Optional label shown on the main table band (defaults to "Details").
  mainSectionLabel?: string;
}

// ─── Excel (XLSX) ───────────────────────────────────────────────────

export async function streamExcel(res: Response, payload: ExportPayload): Promise<void> {
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
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' },
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

// ─── PDF ────────────────────────────────────────────────────────────

export function streamPdf(res: Response, payload: ExportPayload): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const safeTitle = (payload.filenameStem ?? payload.title).replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);

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
      doc.rect(0, 0, doc.page.width, 56).fill(BRAND.ink);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.white)
         .text('PortfolioOS', ML, 14, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor('#94AECB')
         .text(pdfSafe(payload.title), ML, 36, { lineBreak: false });
      const genStr = `Generated  ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;
      doc.font('Helvetica').fontSize(8.5).fillColor('#94AECB')
         .text(genStr, ML, 22, { align: 'right', width: pageW, lineBreak: false });
      if (payload.subtitle) {
        doc.font('Helvetica').fontSize(8).fillColor('#94AECB')
           .text(pdfSafe(payload.subtitle), ML, 38, { align: 'right', width: pageW, lineBreak: false });
      }
    }

    renderPageHeader();
    let cy = 72;

    // ─── META STRIP ──────────────────────────────────────────────────
    if (payload.meta && Object.keys(payload.meta).length > 0) {
      const entries = Object.entries(payload.meta);
      doc.y = cy;
      doc.x = ML;
      doc.font('Helvetica').fontSize(8.5);
      entries.forEach(([k, v], i) => {
        doc.fillColor(BRAND.muted).font('Helvetica')
           .text(`${pdfSafe(k)}: `, { continued: true });
        doc.fillColor(BRAND.ink).font('Helvetica-Bold')
           .text(pdfSafe(String(v)), { continued: i < entries.length - 1 });
        if (i < entries.length - 1) {
          doc.fillColor(BRAND.border).font('Helvetica').text('   ·   ', { continued: true });
        }
      });
      cy = doc.y + 12;
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
        doc.rect(cx, cy, cardW, cardH).fill(BRAND.headerBg);
        doc.rect(cx, cy, 3, cardH).fill(BRAND.accent);
        doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.muted)
           .text(pdfSafe(k).toUpperCase(), cx + 10, cy + 8, { width: cardW - 14, characterSpacing: 0.5, lineBreak: false });
        const valStr = pdfSafe(String(v));
        const isNeg = valStr.startsWith('-') && (k.toLowerCase().includes('p&l') || k.toLowerCase().includes('gain') || k.toLowerCase().includes('loss'));
        doc.font('Helvetica-Bold').fontSize(13).fillColor(isNeg ? BRAND.negative : BRAND.ink)
           .text(valStr, cx + 10, cy + 22, { width: cardW - 16, ellipsis: true, lineBreak: false });
      });
      cy += cardH + 14;
    }

    // ─── CHART (top N items, horizontal bars) ────────────────────────
    if (payload.chartRows && payload.chartRows.length > 0) {
      cy = drawSectionBand(doc, ML, pageW, cy, payload.chartTitle ?? 'Top items by value');
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
    });
    cy += 10;

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
      });
      cy += 10;
    }

    // ─── PAGE NUMBERS ────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted).text(
        `PortfolioOS  ·  ${safeTitle}  ·  Page ${i + 1} of ${range.count}`,
        ML, pageH - 22, { width: pageW, align: 'center', lineBreak: false },
      );
    }

    doc.flushPages();
    doc.end();
  });
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

function drawSectionBand(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  y: number,
  label: string,
): number {
  doc.rect(x, y, width, 18).fill(BRAND.ink);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.white)
     .text(pdfSafe(label), x + 8, y + 5, { width: width - 16, lineBreak: false });
  return y + 22;
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
}

function renderTable(doc: InstanceType<typeof PDFDocument>, o: RenderTableOpts): number {
  let cy = drawSectionBand(doc, o.x, o.width, o.y, o.label);
  const BOT = o.pageH - 40;

  if (o.rows.length === 0) {
    doc.rect(o.x, cy, o.width, 36).fill(BRAND.rowAlt);
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted)
       .text(o.emptyMessage, o.x, cy + 12, { width: o.width, align: 'center', lineBreak: false });
    return cy + 40;
  }

  const totalWeight = o.columns.reduce((s, c) => s + (c.width ?? 10), 0) || o.columns.length;
  const colWidths   = o.columns.map(c => ((c.width ?? 10) / totalWeight) * o.width);
  const ROW_H       = 16;

  const drawHeader = (yy: number): void => {
    doc.rect(o.x, yy, o.width, ROW_H).fill('#2C4360');
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.white);
    let x = o.x;
    for (let i = 0; i < o.columns.length; i++) {
      doc.text(pdfSafe(o.columns[i]!.header), x + 4, yy + 5, {
        width: (colWidths[i] ?? 80) - 8, ellipsis: true, lineBreak: false,
      });
      x += colWidths[i] ?? 80;
    }
  };

  drawHeader(cy);
  cy += ROW_H;

  for (let idx = 0; idx < o.rows.length; idx++) {
    if (cy + ROW_H > BOT) {
      cy = o.onPageBreak();
      cy = drawSectionBand(doc, o.x, o.width, cy, `${o.label} (continued)`);
      drawHeader(cy);
      cy += ROW_H;
    }

    if (idx % 2 === 1) doc.rect(o.x, cy, o.width, ROW_H).fill(BRAND.rowAlt);
    let x = o.x;
    doc.font('Helvetica').fontSize(8);
    for (let i = 0; i < o.columns.length; i++) {
      const col = o.columns[i]!;
      const raw = o.rows[idx]![col.key];
      const rawVal = col.formatter ? col.formatter(raw) : (raw == null ? '' : String(raw));
      const safe = pdfSafe(rawVal);
      const isNumeric = /^[+-]?[\d,.]+%?$/.test(safe.trim()) || /^[+-]?Rs/.test(safe.trim());
      const isNeg = safe.trim().startsWith('-');
      const align = isNumeric ? 'right' : 'left';
      const cellW = (colWidths[i] ?? 80) - 8;
      // Manually truncate so we can guarantee single-line — PDFKit's
      // lineBreak:false + ellipsis:true combo is unreliable when text is
      // far wider than the column. doc.widthOfString uses real font metrics.
      const display = fitText(doc, safe, cellW);
      doc.fillColor(isNeg ? BRAND.negative : BRAND.ink)
         .text(display, x + 4, cy + 5, {
           width: cellW, align, lineBreak: false,
         });
      x += colWidths[i] ?? 80;
    }
    cy += ROW_H;
  }

  // Thin bottom border
  doc.rect(o.x, cy, o.width, 0.5).fill(BRAND.border);
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
