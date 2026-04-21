import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { Decimal, toDecimal } from '@portfolioos/shared';

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

export function streamPdf(res: Response, payload: ExportPayload): void {
  const safeTitle = payload.title.replace(/[^a-z0-9-_]+/gi, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);

  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(18).text(payload.title);
  doc.moveDown(0.3);

  if (payload.meta) {
    doc.font('Helvetica').fontSize(10);
    for (const [k, v] of Object.entries(payload.meta)) {
      doc.text(`${k}: ${v}`);
    }
    doc.moveDown(0.5);
  }

  // Table header
  const tableStartX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight =
    payload.columns.reduce((sum, c) => sum + (c.width ?? 10), 0) || payload.columns.length;
  const colWidths = payload.columns.map(
    (c) => ((c.width ?? 10) / totalWeight) * pageWidth,
  );

  function drawRow(values: string[], opts: { bold?: boolean; bg?: boolean }): void {
    const y = doc.y;
    const rowHeight = 18;
    if (opts.bg) {
      doc.save().rect(tableStartX, y, pageWidth, rowHeight).fill('#E8EEF7').restore();
    }
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#111');
    let x = tableStartX;
    for (let i = 0; i < values.length; i++) {
      doc.text(values[i] ?? '', x + 4, y + 4, {
        width: (colWidths[i] ?? 100) - 8,
        ellipsis: true,
      });
      x += colWidths[i] ?? 100;
    }
    doc.y = y + rowHeight;
    if (doc.y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
    }
  }

  drawRow(
    payload.columns.map((c) => c.header),
    { bold: true, bg: true },
  );

  for (const data of payload.rows) {
    const values = payload.columns.map((col) => {
      const raw = data[col.key];
      if (col.formatter) return col.formatter(raw);
      if (raw == null) return '';
      return String(raw);
    });
    drawRow(values, {});
  }

  if (payload.footer) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10);
    for (const [k, v] of Object.entries(payload.footer)) {
      doc.text(`${k}: ${v}`);
    }
  }

  doc.end();
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
