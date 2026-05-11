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

    // ─────────────────────────────────────────────────────────────────
    // HEADER BAR
    // ─────────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 56).fill(BRAND.ink);
    doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.white)
       .text('PortfolioOS', ML, 14);
    doc.font('Helvetica').fontSize(10).fillColor('#94AECB')
       .text(pdfSafe(payload.title), ML, 36);

    const genStr = `Generated  ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;
    doc.font('Helvetica').fontSize(8.5).fillColor('#94AECB')
       .text(genStr, ML, 22, { align: 'right', width: pageW });
    if (payload.subtitle) {
      doc.font('Helvetica').fontSize(8).fillColor('#94AECB')
         .text(pdfSafe(payload.subtitle), ML, 38, { align: 'right', width: pageW });
    }

    let cy = 72;

    // ─────────────────────────────────────────────────────────────────
    // META STRIP — single line key: value pills
    // ─────────────────────────────────────────────────────────────────
    if (payload.meta && Object.keys(payload.meta).length > 0) {
      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8.5);
      const pieces: { k: string; v: string }[] = Object.entries(payload.meta)
        .map(([k, v]) => ({ k, v: pdfSafe(String(v)) }));
      let mx = ML;
      doc.y = cy;
      pieces.forEach((p, i) => {
        const text = `${p.k}: `;
        const valText = p.v;
        doc.font('Helvetica').fillColor(BRAND.muted).text(text, mx, cy, { continued: true })
           .font('Helvetica-Bold').fillColor(BRAND.ink).text(valText, { continued: i < pieces.length - 1 });
        if (i < pieces.length - 1) {
          doc.font('Helvetica').fillColor(BRAND.border).text('   ·   ', { continued: true });
        }
      });
      cy = doc.y + 14;
    }

    // ─────────────────────────────────────────────────────────────────
    // METRIC CARDS — from footer entries (4 across)
    // ─────────────────────────────────────────────────────────────────
    if (payload.footer && Object.keys(payload.footer).length > 0) {
      const entries = Object.entries(payload.footer);
      const cardCount = entries.length;
      const gap = 8;
      const cardW = (pageW - gap * (cardCount - 1)) / cardCount;
      const cardH = 42;
      entries.forEach(([k, v], i) => {
        const cx = ML + i * (cardW + gap);
        doc.rect(cx, cy, cardW, cardH).fill(BRAND.headerBg);
        doc.rect(cx, cy, 3, cardH).fill(BRAND.accent);
        doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.muted)
           .text(pdfSafe(k).toUpperCase(), cx + 9, cy + 7, { width: cardW - 12, characterSpacing: 0.5 });
        const valStr = pdfSafe(String(v));
        const isNeg = valStr.includes('-') && (k.toLowerCase().includes('p&l') || k.toLowerCase().includes('gain') || k.toLowerCase().includes('loss'));
        doc.font('Helvetica-Bold').fontSize(13).fillColor(isNeg ? BRAND.negative : BRAND.ink)
           .text(valStr, cx + 9, cy + 21, { width: cardW - 14, ellipsis: true });
      });
      cy += cardH + 14;
    }

    // ─────────────────────────────────────────────────────────────────
    // CHART (top N items, horizontal bars)
    // ─────────────────────────────────────────────────────────────────
    if (payload.chartRows && payload.chartRows.length > 0) {
      const chartTitle = payload.chartTitle ?? 'Top items by value';
      doc.rect(ML, cy, pageW, 16).fill(BRAND.headerBg);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.ink)
         .text(pdfSafe(chartTitle), ML + 8, cy + 4);
      cy += 22;
      const chartH = Math.min(payload.chartRows.length * 18 + 8, 180);
      const bottom = drawHorizontalBarChart(doc, payload.chartRows, {
        x: ML, y: cy, width: pageW, height: chartH,
      });
      cy = bottom + 10;
    }

    // ─────────────────────────────────────────────────────────────────
    // TABLE
    // ─────────────────────────────────────────────────────────────────
    if (payload.rows.length === 0) {
      doc.rect(ML, cy, pageW, 60).fill(BRAND.rowAlt);
      doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted)
         .text('No records to display.', ML, cy + 22, { width: pageW, align: 'center' });
      cy += 70;
    } else {
      // Table header
      doc.rect(ML, cy, pageW, 16).fill(BRAND.headerBg);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.ink)
         .text('Details', ML + 8, cy + 4);
      cy += 22;

      const totalWeight = payload.columns.reduce((s, c) => s + (c.width ?? 10), 0) || payload.columns.length;
      const colWidths   = payload.columns.map(c => ((c.width ?? 10) / totalWeight) * pageW);
      const ROW_H       = 17;

      const drawHeader = (y: number): void => {
        doc.rect(ML, y, pageW, ROW_H).fill(BRAND.ink);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.white);
        let x = ML;
        for (let i = 0; i < payload.columns.length; i++) {
          doc.text(pdfSafe(payload.columns[i]!.header), x + 4, y + 5, {
            width: (colWidths[i] ?? 80) - 8, ellipsis: true,
          });
          x += colWidths[i] ?? 80;
        }
      };

      drawHeader(cy);
      cy += ROW_H;

      payload.rows.forEach((data, idx) => {
        // Page break check
        if (cy + ROW_H > pageH - 40) {
          // Draw page number on current page first
          doc.fontSize(7).fillColor(BRAND.muted).font('Helvetica')
             .text(`PortfolioOS  ·  ${safeTitle}`, ML, pageH - 26, { width: pageW, align: 'left' });
          doc.addPage();
          cy = 36;
          drawHeader(cy);
          cy += ROW_H;
        }

        if (idx % 2 === 1) doc.rect(ML, cy, pageW, ROW_H).fill(BRAND.rowAlt);
        let x = ML;
        doc.font('Helvetica').fontSize(8);
        for (let i = 0; i < payload.columns.length; i++) {
          const col = payload.columns[i]!;
          const raw = data[col.key];
          const val = col.formatter ? col.formatter(raw) : (raw == null ? '' : String(raw));
          const isNumeric = /^-?[\d,.]+%?$/.test(val.trim()) || /^Rs/.test(val.trim());
          const isNeg = val.trim().startsWith('-');
          const align = isNumeric ? 'right' : 'left';
          doc.fillColor(isNeg ? BRAND.negative : BRAND.ink)
             .text(pdfSafe(val), x + 4, cy + 5, {
               width: (colWidths[i] ?? 80) - 8, ellipsis: true, align,
             });
          x += colWidths[i] ?? 80;
        }
        cy += ROW_H;
      });

      // bottom border
      doc.rect(ML, cy, pageW, 0.5).fill(BRAND.border);
    }

    // ─────────────────────────────────────────────────────────────────
    // PAGE NUMBERS — applied after content with switchToPage
    // ─────────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted).text(
        `PortfolioOS  ·  ${safeTitle}  ·  Page ${i + 1} of ${range.count}`,
        ML, pageH - 22, { width: pageW, align: 'center' },
      );
    }

    doc.flushPages();
    doc.end();
  });
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
