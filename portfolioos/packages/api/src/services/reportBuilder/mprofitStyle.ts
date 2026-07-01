/**
 * mProfit-style report renderer (PDF + Excel).
 *
 * Replicates the legacy desktop reports the user sent screenshots of:
 *   - Pink banded header showing Family / Member / Financial Year
 *   - Two-level table headers (column group → child cells) with full
 *     cell borders
 *   - Sky-blue group banner rows ("SHARE INVESTMENT (EQUITY) A/C")
 *   - Pink sub-group rows (per-script header)
 *   - White data rows
 *   - Yellow "Total For <script>" subtotal rows
 *   - Green "Grand Total" footer row
 *   - Indian lakh/crore comma grouping
 *   - Negatives in parentheses, coloured red
 *
 * Caller supplies a structured layout (this module knows nothing about
 * the underlying data shape); the 12 specialised builders in this dir
 * translate their service-level data into one of these layouts.
 */

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { Decimal } from '@portfolioos/shared';
import { pdfSafe } from '../charts/pdfCharts.js';

// ─── Palette — pulled from the screenshots ───────────────────────

export const MPROFIT_PALETTE = {
  pageBg: '#0D0D0D',             // full page canvas
  bandPink: '#1E2210',           // top family/member band + table header (dark olive-lime tint)
  bandPinkSoft: '#141414',       // outer header strip
  groupBlue: '#101F2E',          // top-level group banner (dark navy tint)
  subPink: '#1C1530',            // script header row (dark violet tint)
  subtotalYellow: '#2A2008',     // per-script total (dark amber tint)
  grandGreen: '#132B0C',         // grand total (dark green tint)
  border: '#3D3D3D',
  ink: '#F0F0F0',
  muted: '#9E9E9E',
  negative: '#F0574C',
  white: '#171717',
} as const;

// ─── Layout types ────────────────────────────────────────────────

export type ColAlign = 'left' | 'right' | 'center';

export interface ColumnDef {
  key: string;
  label: string;
  width: number; // proportional weight (sum-up to 100 across all cols)
  align?: ColAlign;
  formatter?: (v: unknown) => string;
  /** colour negative numbers red and wrap in parens. */
  signed?: boolean;
}

export interface ColumnGroup {
  label: string;
  bg?: string; // override band bg
  cols: ColumnDef[];
}

export interface BodyRow {
  cells: Record<string, unknown>;
  /** override row tint */
  bg?: string;
}

export interface ScriptSubtotal {
  label: string;
  values: Record<string, unknown>;
}

export interface SubGroup {
  /** Sub-header rendered as a pink row spanning all columns. Optional. */
  header?: string;
  rows: BodyRow[];
  subtotal?: ScriptSubtotal;
}

export interface ReportSection {
  /** Sky-blue banner above the sub-groups (e.g. "SHARE INVESTMENT (EQUITY) A/C"). */
  banner?: string;
  groups: SubGroup[];
}

export interface MprofitLayout {
  reportTitle: string;
  family?: string;
  member?: string;
  pan?: string;
  financialYear?: string;
  /** Optional extra fields rendered on the right of the pink top band. */
  meta?: Array<{ label: string; value: string }>;
  /** Top-level header columns laid out left → right. Groups render as
   *  a two-row header; leaves render as a single-cell header that spans
   *  both rows. */
  headerRow1: Array<{ label: string; spanCols: number; bg?: string }>;
  headerRow2: Array<{ label: string; align?: ColAlign }>;
  /** Flat column list matching headerRow2 (one ColumnDef per cell). */
  columns: ColumnDef[];
  sections: ReportSection[];
  grandTotal?: ScriptSubtotal;
  /** Filename without extension. */
  filenameStem: string;
}

// ─── Number / string utilities ───────────────────────────────────

/** Indian lakh / crore grouping. Negatives in parens. */
export function indianMoney(v: unknown, decimals = 2): string {
  if (v == null || v === '') return '';
  try {
    const d = new Decimal(String(v));
    if (!d.isFinite()) return '';
    if (d.isZero()) return decimals > 0 ? '0.00' : '0';
    const neg = d.isNegative();
    const fixed = d.abs().toFixed(decimals, Decimal.ROUND_HALF_EVEN);
    const [intPart, frac] = fixed.split('.');
    const digits = intPart!;
    let grouped: string;
    if (digits.length <= 3) grouped = digits;
    else {
      const last3 = digits.slice(-3);
      const rest = digits.slice(0, -3);
      grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    }
    const out = frac ? `${grouped}.${frac}` : grouped;
    return neg ? `(${out})` : out;
  } catch {
    return '';
  }
}

export function indianInt(v: unknown): string {
  return indianMoney(v, 0);
}

export function fmtDateDDMMYYYY(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/** Today's date in DD/MM/YYYY, suitable for report titles. */
export function todayDDMMYYYY(): string {
  return fmtDateDDMMYYYY(new Date());
}

function isParensNegative(s: string): boolean {
  return s.startsWith('(') && s.endsWith(')');
}

// ─── PDF renderer ────────────────────────────────────────────────

const PDF_FONT = 'Helvetica';
const PDF_FONT_BOLD = 'Helvetica-Bold';

export function streamMprofitPdf(res: Response, layout: MprofitLayout): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${layout.filenameStem}.pdf"`);

    // Wide reports (>14 columns) get a Legal-landscape canvas so headers
    // stop chopping. A4 landscape is plenty for the typical 8-12 col report.
    const pageSize: 'A4' | 'LEGAL' = layout.columns.length > 14 ? 'LEGAL' : 'A4';
    const doc = new PDFDocument({ margin: 24, size: pageSize, layout: 'landscape', bufferPages: true });
    doc.on('end', resolve);
    doc.on('error', reject);
    res.on('error', reject);
    doc.pipe(res);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(MPROFIT_PALETTE.pageBg);

    const ML = doc.page.margins.left;
    const pageW = doc.page.width - ML - doc.page.margins.right;
    const BOT = doc.page.height - 30;

    // ── Top family / member / FY band ───────────────────────────
    // Drop the family cell when it duplicates the member name (v2 is
    // single-user — see CLAUDE.md §1 row 2). Drop the FY cell entirely
    // when the report doesn't carry one, so an as-of report doesn't
    // show "Financial Year: —" as dead space.
    function renderTopBand(): number {
      const bandH = 28;
      const y = doc.y;
      doc.rect(ML, y, pageW, bandH).fillAndStroke(MPROFIT_PALETTE.bandPinkSoft, MPROFIT_PALETTE.border);

      const cells: Array<{ label: string; value: string }> = [];
      if (layout.family && layout.family !== layout.member) {
        cells.push({ label: 'Family Name', value: layout.family });
      }
      cells.push({ label: 'Member Name', value: layout.member ?? '—' });
      if (layout.financialYear) {
        cells.push({ label: 'Financial Year', value: layout.financialYear });
      }
      const colW = pageW / cells.length;
      cells.forEach((c, i) => {
        const cx = ML + i * colW;
        if (i > 0) {
          doc.moveTo(cx, y).lineTo(cx, y + bandH).strokeColor(MPROFIT_PALETTE.border).lineWidth(0.6).stroke();
        }
        doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(MPROFIT_PALETTE.muted)
          .text(pdfSafe(c.label.toUpperCase()), cx + 6, y + 4, { width: colW - 12, characterSpacing: 0.5, lineBreak: false });
        doc.font(PDF_FONT_BOLD).fontSize(10).fillColor(MPROFIT_PALETTE.ink)
          .text(pdfSafe(c.value), cx + 6, y + 14, { width: colW - 12, lineBreak: false, ellipsis: true });
      });
      return y + bandH + 4;
    }

    function renderReportTitle(yStart: number): number {
      doc.fillColor(MPROFIT_PALETTE.ink).font(PDF_FONT_BOLD).fontSize(11)
        .text(pdfSafe(layout.reportTitle), ML, yStart, { width: pageW, lineBreak: false });
      let y = yStart + 14;
      if (layout.pan) {
        doc.font(PDF_FONT).fontSize(8.5).fillColor(MPROFIT_PALETTE.muted)
          .text(pdfSafe(`PAN: ${layout.pan}`), ML, y, { width: pageW, align: 'right', lineBreak: false });
      }
      return y + 8;
    }

    // Header band (top of every page)
    let cy = doc.y;
    cy = renderTopBand();
    cy = renderReportTitle(cy);
    doc.y = cy;

    // ── Compute column widths ────────────────────────────────────
    const totalWeight = layout.columns.reduce((s, c) => s + c.width, 0);
    const colXs: number[] = [];
    const colWs: number[] = [];
    {
      let x = ML;
      for (const c of layout.columns) {
        const w = (c.width / totalWeight) * pageW;
        colXs.push(x);
        colWs.push(w);
        x += w;
      }
    }

    // ── Render header rows ───────────────────────────────────────
    // Both header rows get a uniform height so the bottom of the
    // header is flush even when individual labels wrap to 2 lines.
    // Wrapping is allowed (lineBreak: true) — chopping long labels
    // like "SECURITY TRANSACTION TAX" looks worse than letting them
    // break.
    function renderHeader(y: number): number {
      const rowH = 22;
      let cursorX = ML;
      let leafIdx = 0;
      for (const grp of layout.headerRow1) {
        const w = colWs.slice(leafIdx, leafIdx + grp.spanCols).reduce((a, b) => a + b, 0);
        const isLeaf = grp.spanCols === 1;
        const cellH = isLeaf ? rowH * 2 : rowH;
        doc.rect(cursorX, y, w, cellH)
          .fillAndStroke(grp.bg ?? MPROFIT_PALETTE.bandPink, MPROFIT_PALETTE.border);
        const textY = isLeaf ? y + (cellH / 2) - 8 : y + 4;
        doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(MPROFIT_PALETTE.ink)
          .text(pdfSafe(grp.label), cursorX + 2, textY, {
            width: w - 4, height: cellH - 4, align: 'center',
            lineBreak: true, ellipsis: true,
          });
        cursorX += w;
        leafIdx += grp.spanCols;
      }

      let cur2X = ML;
      let r2 = 0;
      for (const grp of layout.headerRow1) {
        if (grp.spanCols === 1) {
          cur2X += colWs[r2]!;
          r2 += 1;
        } else {
          for (let k = 0; k < grp.spanCols; k++) {
            const w = colWs[r2]!;
            const sub = layout.headerRow2[r2];
            doc.rect(cur2X, y + rowH, w, rowH)
              .fillAndStroke(MPROFIT_PALETTE.bandPink, MPROFIT_PALETTE.border);
            doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(MPROFIT_PALETTE.ink)
              .text(pdfSafe(sub?.label ?? ''), cur2X + 2, y + rowH + 4, {
                width: w - 4, height: rowH - 4, align: sub?.align ?? 'center',
                lineBreak: true, ellipsis: true,
              });
            cur2X += w;
            r2 += 1;
          }
        }
      }
      return y + rowH * 2;
    }

    function newPage(): number {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(MPROFIT_PALETTE.pageBg);
      let y = doc.page.margins.top;
      doc.y = y;
      y = renderTopBand();
      y = renderReportTitle(y);
      y = renderHeader(y);
      return y;
    }

    cy = renderHeader(cy);

    // PDFKit's `lineBreak: false` is unreliable when `width` is set:
    // text still wraps to a second line when it overflows. Pre-truncate
    // the string here so cell contents never wrap.
    function fitToWidth(s: string, fontSize: number, w: number, bold: boolean): string {
      if (!s) return '';
      doc.font(bold ? PDF_FONT_BOLD : PDF_FONT).fontSize(fontSize);
      if (doc.widthOfString(s) <= w) return s;
      let lo = 0;
      let hi = s.length;
      const ell = '…';
      const ellW = doc.widthOfString(ell);
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (doc.widthOfString(s.slice(0, mid)) + ellW <= w) lo = mid;
        else hi = mid - 1;
      }
      return s.slice(0, lo) + ell;
    }

    // ── Render body rows ────────────────────────────────────────
    function renderBodyRow(
      y: number,
      cells: Record<string, unknown>,
      bg: string,
      bold = false,
    ): number {
      const rowH = 16;
      if (y + rowH > BOT) y = newPage();
      doc.rect(ML, y, pageW, rowH).fillAndStroke(bg, MPROFIT_PALETTE.border);
      for (let i = 0; i < layout.columns.length; i++) {
        const c = layout.columns[i]!;
        const x = colXs[i]!;
        const w = colWs[i]!;
        const raw = cells[c.key];
        const display = c.formatter ? c.formatter(raw) : raw == null ? '' : String(raw);
        let textColor: string = MPROFIT_PALETTE.ink;
        if (c.signed && typeof display === 'string' && isParensNegative(display)) {
          textColor = MPROFIT_PALETTE.negative;
        }
        if (i > 0) {
          doc.moveTo(x, y).lineTo(x, y + rowH)
            .strokeColor(MPROFIT_PALETTE.border).lineWidth(0.4).stroke();
        }
        const safe = fitToWidth(pdfSafe(display), 8, w - 6, bold);
        doc.font(bold ? PDF_FONT_BOLD : PDF_FONT).fontSize(8).fillColor(textColor)
          .text(safe, x + 3, y + 4, {
            width: w - 6,
            align: c.align ?? 'left',
            lineBreak: false,
          });
      }
      return y + rowH;
    }

    function renderSpanRow(y: number, text: string, bg: string, bold = true): number {
      const rowH = 18;
      if (y + rowH > BOT) y = newPage();
      doc.rect(ML, y, pageW, rowH).fillAndStroke(bg, MPROFIT_PALETTE.border);
      doc.font(bold ? PDF_FONT_BOLD : PDF_FONT).fontSize(8.5).fillColor(MPROFIT_PALETTE.ink)
        .text(pdfSafe(text), ML + 6, y + 5, { width: pageW - 12, lineBreak: false, ellipsis: true });
      return y + rowH;
    }

    // Render a subtotal / grand-total row. Label auto-spans across the
    // first N columns until it fits — protects narrow first columns
    // (e.g. "Sr No") from chopping "Grand Total" into "Gr..." or
    // dropping it entirely when a numeric formatter is applied.
    function renderTotalRow(
      y: number,
      label: string,
      values: Record<string, unknown>,
      bg: string,
    ): number {
      const rowH = 18;
      if (y + rowH > BOT) y = newPage();
      doc.rect(ML, y, pageW, rowH).fillAndStroke(bg, MPROFIT_PALETTE.border);

      doc.font(PDF_FONT_BOLD).fontSize(8.5);
      const labelW = doc.widthOfString(label) + 12;
      let spanCols = 1;
      let runningW = colWs[0]!;
      while (runningW < labelW && spanCols < layout.columns.length) {
        const nextCol = layout.columns[spanCols]!;
        const nextVal = values[nextCol.key];
        if (nextVal != null && nextVal !== '') break;
        runningW += colWs[spanCols]!;
        spanCols += 1;
      }
      doc.fillColor(MPROFIT_PALETTE.ink)
        .text(fitToWidth(pdfSafe(label), 8.5, runningW - 8, true), ML + 4, y + 5, {
          width: runningW - 8, align: 'left', lineBreak: false,
        });

      for (let i = spanCols; i < layout.columns.length; i++) {
        const c = layout.columns[i]!;
        const x = colXs[i]!;
        const w = colWs[i]!;
        const raw = values[c.key];
        const display = c.formatter ? c.formatter(raw) : raw == null ? '' : String(raw);
        let textColor: string = MPROFIT_PALETTE.ink;
        if (c.signed && typeof display === 'string' && isParensNegative(display)) {
          textColor = MPROFIT_PALETTE.negative;
        }
        doc.moveTo(x, y).lineTo(x, y + rowH)
          .strokeColor(MPROFIT_PALETTE.border).lineWidth(0.4).stroke();
        const safe = fitToWidth(pdfSafe(display), 8.5, w - 6, true);
        doc.font(PDF_FONT_BOLD).fontSize(8.5).fillColor(textColor)
          .text(safe, x + 3, y + 5, {
            width: w - 6, align: c.align ?? 'right', lineBreak: false,
          });
      }
      return y + rowH;
    }

    for (const section of layout.sections) {
      if (section.banner) {
        cy = renderSpanRow(cy, section.banner, MPROFIT_PALETTE.groupBlue);
      }
      for (const g of section.groups) {
        if (g.header) {
          cy = renderSpanRow(cy, g.header, MPROFIT_PALETTE.subPink);
        }
        for (const r of g.rows) {
          cy = renderBodyRow(cy, r.cells, r.bg ?? MPROFIT_PALETTE.white);
        }
        if (g.subtotal) {
          cy = renderTotalRow(
            cy,
            g.subtotal.label,
            g.subtotal.values,
            MPROFIT_PALETTE.subtotalYellow,
          );
        }
      }
    }

    if (layout.grandTotal) {
      cy = renderTotalRow(
        cy,
        layout.grandTotal.label,
        layout.grandTotal.values,
        MPROFIT_PALETTE.grandGreen,
      );
    }

    doc.end();
  });
}

// ─── Excel renderer ──────────────────────────────────────────────

export async function streamMprofitExcel(res: Response, layout: MprofitLayout): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PortfolioOS';
  wb.created = new Date();
  const ws = wb.addWorksheet(layout.reportTitle.slice(0, 31));

  const totalCols = layout.columns.length;

  // Top band — collapse duplicate family / drop empty FY, same rules
  // as the PDF renderer.
  ws.mergeCells(1, 1, 1, totalCols);
  const topParts: string[] = [];
  if (layout.family && layout.family !== layout.member) topParts.push(layout.family);
  if (layout.member) topParts.push(layout.member);
  if (layout.financialYear) topParts.push(`FY ${layout.financialYear}`);
  ws.getCell(1, 1).value = topParts.join(' · ');
  ws.getCell(1, 1).fill = solid(MPROFIT_PALETTE.bandPinkSoft);
  ws.getCell(1, 1).font = { bold: true, size: 11 };
  ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 22;

  // Report title
  ws.mergeCells(2, 1, 2, totalCols);
  ws.getCell(2, 1).value = layout.reportTitle;
  ws.getCell(2, 1).font = { bold: true, size: 12 };

  // Multi-row headers
  // Row 4 = group row, Row 5 = leaf row (for groups with spanCols > 1)
  // Leaf cells in row 4 are merged across row 4+5.
  let colIdx = 1;
  let leafCol = 1;
  for (const grp of layout.headerRow1) {
    if (grp.spanCols === 1) {
      ws.mergeCells(4, colIdx, 5, colIdx);
      ws.getCell(4, colIdx).value = grp.label;
      ws.getCell(4, colIdx).fill = solid(grp.bg ?? MPROFIT_PALETTE.bandPink);
      ws.getCell(4, colIdx).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      ws.getCell(4, colIdx).font = { bold: true, size: 9 };
      ws.getCell(4, colIdx).border = allBorders();
      colIdx += 1;
    } else {
      ws.mergeCells(4, colIdx, 4, colIdx + grp.spanCols - 1);
      ws.getCell(4, colIdx).value = grp.label;
      ws.getCell(4, colIdx).fill = solid(grp.bg ?? MPROFIT_PALETTE.bandPink);
      ws.getCell(4, colIdx).alignment = { horizontal: 'center' };
      ws.getCell(4, colIdx).font = { bold: true, size: 9 };
      ws.getCell(4, colIdx).border = allBorders();
      for (let k = 0; k < grp.spanCols; k++) {
        const c = ws.getCell(5, colIdx + k);
        const sub = layout.headerRow2[leafCol - 1 + k];
        c.value = sub?.label ?? '';
        c.fill = solid(MPROFIT_PALETTE.bandPink);
        c.alignment = { horizontal: sub?.align ?? 'center' };
        c.font = { bold: true, size: 9 };
        c.border = allBorders();
      }
      colIdx += grp.spanCols;
    }
    leafCol += grp.spanCols;
  }

  let row = 6;

  function writeRow(values: Record<string, unknown>, fill: string, bold = false) {
    for (let i = 0; i < layout.columns.length; i++) {
      const c = layout.columns[i]!;
      const raw = values[c.key];
      const display = c.formatter ? c.formatter(raw) : raw == null ? '' : String(raw);
      const cell = ws.getCell(row, i + 1);
      cell.value = display;
      cell.fill = solid(fill);
      cell.font = {
        bold,
        size: 9,
        color: c.signed && typeof display === 'string' && isParensNegative(display)
          ? { argb: 'FFF0574C' }
          : undefined,
      };
      cell.alignment = { horizontal: c.align ?? 'left' };
      cell.border = allBorders();
    }
    row += 1;
  }

  function writeBanner(label: string, fill: string) {
    ws.mergeCells(row, 1, row, totalCols);
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).fill = solid(fill);
    ws.getCell(row, 1).font = { bold: true, size: 9 };
    ws.getCell(row, 1).alignment = { horizontal: 'left' };
    ws.getCell(row, 1).border = allBorders();
    row += 1;
  }

  for (const section of layout.sections) {
    if (section.banner) writeBanner(section.banner, MPROFIT_PALETTE.groupBlue);
    for (const g of section.groups) {
      if (g.header) writeBanner(g.header, MPROFIT_PALETTE.subPink);
      for (const r of g.rows) writeRow(r.cells, r.bg ?? MPROFIT_PALETTE.white);
      if (g.subtotal) {
        writeRow(
          { [layout.columns[0]!.key]: g.subtotal.label, ...g.subtotal.values },
          MPROFIT_PALETTE.subtotalYellow,
          true,
        );
      }
    }
  }

  if (layout.grandTotal) {
    writeRow(
      { [layout.columns[0]!.key]: layout.grandTotal.label, ...layout.grandTotal.values },
      MPROFIT_PALETTE.grandGreen,
      true,
    );
  }

  // Column widths
  for (let i = 0; i < layout.columns.length; i++) {
    const c = layout.columns[i]!;
    ws.getColumn(i + 1).width = Math.max(10, c.width * 1.3);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${layout.filenameStem}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function solid(argb: string): ExcelJS.FillPattern {
  const hex = argb.startsWith('#') ? argb.slice(1) : argb;
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex.toUpperCase() } };
}

function allBorders(): ExcelJS.Borders {
  const style: ExcelJS.Border = { style: 'thin', color: { argb: 'FF3D3D3D' } };
  return { top: style, left: style, right: style, bottom: style } as ExcelJS.Borders;
}
