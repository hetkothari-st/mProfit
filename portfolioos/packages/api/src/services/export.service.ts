import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { Decimal, toDecimal } from '@portfolioos/shared';
import { BRAND } from './charts/pdfCharts.js';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown) => string;
}

export interface ExportPayload {
  title: string;
  meta?: Record<string, string | number>;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  footer?: Record<string, string | number>;
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
    const safeTitle = payload.title.replace(/[^a-z0-9-_]+/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
    doc.on('end', resolve);
    doc.on('error', reject);
    res.on('error', reject);
    doc.pipe(res);

    const ML    = doc.page.margins.left;
    const pageW = doc.page.width - ML - doc.page.margins.right;

    // ── Branded header block ──────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 52).fill(BRAND.ink);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND.white)
       .text('PortfolioOS', ML, 12);
    doc.font('Helvetica').fontSize(10).fillColor('#94AECB')
       .text(payload.title, ML, 34);
    doc.font('Helvetica').fontSize(8).fillColor('#94AECB')
       .text(`Generated ${new Date().toISOString().slice(0, 10)}`, ML, 38, { align: 'right', width: pageW });
    doc.y = 64;

    if (payload.meta) {
      doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.muted);
      const entries = Object.entries(payload.meta);
      entries.forEach(([k, v], i) => {
        if (i > 0) doc.text('  |  ', { continued: true });
        doc.fillColor(BRAND.muted).text(`${k}: `, { continued: true });
        doc.fillColor(BRAND.ink).text(String(v), { continued: i < entries.length - 1 });
      });
      doc.moveDown(0.5);
    }

    // ── Table ─────────────────────────────────────────────────────────
    const totalWeight = payload.columns.reduce((s, c) => s + (c.width ?? 10), 0) || payload.columns.length;
    const colWidths   = payload.columns.map(c => ((c.width ?? 10) / totalWeight) * pageW);
    const ROW_H       = 16;

    const drawRow = (values: string[], opts: { bold?: boolean; alt?: boolean }): void => {
      const y = doc.y;
      if (opts.bold)      doc.rect(ML, y, pageW, ROW_H).fill(BRAND.headerBg);
      else if (opts.alt)  doc.rect(ML, y, pageW, ROW_H).fill(BRAND.rowAlt);
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(BRAND.ink);
      let x = ML;
      for (let i = 0; i < values.length; i++) {
        doc.text(values[i] ?? '', x + 3, y + 4, { width: (colWidths[i] ?? 80) - 6, ellipsis: true });
        x += colWidths[i] ?? 80;
      }
      doc.y = y + ROW_H;
      if (doc.y > doc.page.height - doc.page.margins.bottom - 36) {
        doc.addPage();
        doc.y = 36;
        const hy = doc.y;
        doc.rect(ML, hy, pageW, ROW_H).fill(BRAND.headerBg);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.ink);
        let hx = ML;
        for (let i = 0; i < payload.columns.length; i++) {
          doc.text(payload.columns[i]!.header, hx + 3, hy + 4, { width: (colWidths[i] ?? 80) - 6, ellipsis: true });
          hx += colWidths[i] ?? 80;
        }
        doc.y = hy + ROW_H;
      }
    };

    drawRow(payload.columns.map(c => c.header), { bold: true });
    payload.rows.forEach((data, idx) => {
      const values = payload.columns.map(col => {
        const raw = data[col.key];
        if (col.formatter) return col.formatter(raw);
        return raw == null ? '' : String(raw);
      });
      drawRow(values, { alt: idx % 2 === 1 });
    });

    if (payload.footer) {
      doc.moveDown(0.6);
      doc.rect(ML, doc.y, pageW, 1).fill(BRAND.border);
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink);
      Object.entries(payload.footer).forEach(([k, v]) => {
        doc.text(`${k}: `, { continued: true }).font('Helvetica').text(String(v));
      });
    }

    // ── Page numbers ──────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(6.5).fillColor(BRAND.muted).text(
        `PortfolioOS  ·  ${safeTitle}  ·  Page ${i + 1} of ${range.count}`,
        ML, doc.page.height - 22, { width: pageW, align: 'center' },
      );
    }

    doc.flushPages();
    doc.end();
  });

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
