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
import { DARK_THEME, LIGHT_THEME, hexToArgb, type ThemeName } from '../charts/pdfTheme.js';

// ─── Palette — pulled from the screenshots ───────────────────────
//
// mProfit's legacy desktop report uses pastel identity bands — pink header,
// sky-blue group banner, yellow subtotal, green grand total — on a white
// page. The dark theme keeps that same identity but tints every band dark
// enough to sit on a near-black page; the light theme renders the pastels
// close to the original screenshots. Base ink/muted/negative/border/white
// come from the shared theme so this stays in step with every other report.

function paletteFor(theme: ThemeName) {
  if (theme === 'light') {
    return {
      pageBg: LIGHT_THEME.pageBg,
      bandPink: '#F9D9E6',           // top family/member band + table header
      bandPinkSoft: '#FCEFF4',       // outer header strip
      groupBlue: '#D6EAF8',          // top-level group banner
      subPink: '#F3E1F5',            // script header row
      subtotalYellow: '#FFF3B0',     // per-script total
      grandGreen: '#C8E6C9',         // grand total
      border: LIGHT_THEME.border,
      ink: LIGHT_THEME.ink,
      muted: LIGHT_THEME.muted,
      negative: LIGHT_THEME.negative,
      white: '#FFFFFF',
    } as const;
  }
  return {
    pageBg: DARK_THEME.pageBg,
    bandPink: '#1E2210',           // dark olive-lime tint
    bandPinkSoft: '#141414',
    groupBlue: '#101F2E',          // dark navy tint
    subPink: '#1C1530',            // dark violet tint
    subtotalYellow: '#2A2008',     // dark amber tint
    grandGreen: '#132B0C',         // dark green tint
    border: DARK_THEME.border,
    ink: DARK_THEME.ink,
    muted: DARK_THEME.muted,
    negative: DARK_THEME.negative,
    white: '#171717',
  } as const;
}

export type MprofitPalette = ReturnType<typeof paletteFor>;

/** @deprecated kept only so nothing importing the old constant breaks; prefer `paletteFor(theme)`. */
export const MPROFIT_PALETTE = paletteFor('dark');

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
  /** Defaults to 'dark' — the app's own brand skin — same as every other report. */
  theme?: ThemeName;
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

// ─── Raw-XML streamer (Tally export) ────────────────────────────
// Tally XML isn't a banded PDF/Excel report — it bypasses MprofitLayout
// entirely (see services/reportBuilder/tally/). Same two-line
// header-then-write shape as the PDF/Excel streamers above, just with a
// plain XML string body instead of a pdfkit/exceljs document.
export function streamTallyXml(res: Response, xml: string, filenameStem: string): void {
  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameStem}.xml"`);
  res.send(xml);
}

// ─── PDF renderer ────────────────────────────────────────────────

const PDF_FONT = 'Helvetica';
const PDF_FONT_BOLD = 'Helvetica-Bold';

export function streamMprofitPdf(res: Response, layout: MprofitLayout): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const PAL = paletteFor(layout.theme ?? 'dark');
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
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAL.pageBg);

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
      doc.rect(ML, y, pageW, bandH).fillAndStroke(PAL.bandPinkSoft, PAL.border);

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
          doc.moveTo(cx, y).lineTo(cx, y + bandH).strokeColor(PAL.border).lineWidth(0.6).stroke();
        }
        doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(PAL.muted)
          .text(pdfSafe(c.label.toUpperCase()), cx + 6, y + 4, { width: colW - 12, characterSpacing: 0.5, lineBreak: false });
        doc.font(PDF_FONT_BOLD).fontSize(10).fillColor(PAL.ink)
          .text(pdfSafe(c.value), cx + 6, y + 14, { width: colW - 12, lineBreak: false, ellipsis: true });
      });
      return y + bandH + 4;
    }

    function renderReportTitle(yStart: number): number {
      doc.fillColor(PAL.ink).font(PDF_FONT_BOLD).fontSize(11)
        .text(pdfSafe(layout.reportTitle), ML, yStart, { width: pageW, lineBreak: false });
      const y = yStart + 14;
      if (layout.pan) {
        doc.font(PDF_FONT).fontSize(8.5).fillColor(PAL.muted)
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
          .fillAndStroke(grp.bg ?? PAL.bandPink, PAL.border);
        const textY = isLeaf ? y + (cellH / 2) - 8 : y + 4;
        doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(PAL.ink)
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
              .fillAndStroke(PAL.bandPink, PAL.border);
            doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(PAL.ink)
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
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAL.pageBg);
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
      doc.rect(ML, y, pageW, rowH).fillAndStroke(bg, PAL.border);
      for (let i = 0; i < layout.columns.length; i++) {
        const c = layout.columns[i]!;
        const x = colXs[i]!;
        const w = colWs[i]!;
        const raw = cells[c.key];
        const display = c.formatter ? c.formatter(raw) : raw == null ? '' : String(raw);
        let textColor: string = PAL.ink;
        if (c.signed && typeof display === 'string' && isParensNegative(display)) {
          textColor = PAL.negative;
        }
        if (i > 0) {
          doc.moveTo(x, y).lineTo(x, y + rowH)
            .strokeColor(PAL.border).lineWidth(0.4).stroke();
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
      doc.rect(ML, y, pageW, rowH).fillAndStroke(bg, PAL.border);
      doc.font(bold ? PDF_FONT_BOLD : PDF_FONT).fontSize(8.5).fillColor(PAL.ink)
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
      doc.rect(ML, y, pageW, rowH).fillAndStroke(bg, PAL.border);

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
      doc.fillColor(PAL.ink)
        .text(fitToWidth(pdfSafe(label), 8.5, runningW - 8, true), ML + 4, y + 5, {
          width: runningW - 8, align: 'left', lineBreak: false,
        });

      for (let i = spanCols; i < layout.columns.length; i++) {
        const c = layout.columns[i]!;
        const x = colXs[i]!;
        const w = colWs[i]!;
        const raw = values[c.key];
        const display = c.formatter ? c.formatter(raw) : raw == null ? '' : String(raw);
        let textColor: string = PAL.ink;
        if (c.signed && typeof display === 'string' && isParensNegative(display)) {
          textColor = PAL.negative;
        }
        doc.moveTo(x, y).lineTo(x, y + rowH)
          .strokeColor(PAL.border).lineWidth(0.4).stroke();
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
        cy = renderSpanRow(cy, section.banner, PAL.groupBlue);
      }
      for (const g of section.groups) {
        if (g.header) {
          cy = renderSpanRow(cy, g.header, PAL.subPink);
        }
        for (const r of g.rows) {
          cy = renderBodyRow(cy, r.cells, r.bg ?? PAL.white);
        }
        if (g.subtotal) {
          cy = renderTotalRow(
            cy,
            g.subtotal.label,
            g.subtotal.values,
            PAL.subtotalYellow,
          );
        }
      }
    }

    if (layout.grandTotal) {
      cy = renderTotalRow(
        cy,
        layout.grandTotal.label,
        layout.grandTotal.values,
        PAL.grandGreen,
      );
    }

    doc.end();
  });
}

// ─── Excel renderer ──────────────────────────────────────────────

export async function streamMprofitExcel(res: Response, layout: MprofitLayout): Promise<void> {
  const PAL = paletteFor(layout.theme ?? 'dark');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EveryPaisa';
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
  ws.getCell(1, 1).fill = solid(PAL.bandPinkSoft);
  ws.getCell(1, 1).font = { bold: true, size: 11, color: { argb: hexToArgb(PAL.ink) } };
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
      ws.getCell(4, colIdx).fill = solid(grp.bg ?? PAL.bandPink);
      ws.getCell(4, colIdx).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      ws.getCell(4, colIdx).font = { bold: true, size: 9, color: { argb: hexToArgb(PAL.ink) } };
      ws.getCell(4, colIdx).border = allBorders(PAL.border);
      colIdx += 1;
    } else {
      ws.mergeCells(4, colIdx, 4, colIdx + grp.spanCols - 1);
      ws.getCell(4, colIdx).value = grp.label;
      ws.getCell(4, colIdx).fill = solid(grp.bg ?? PAL.bandPink);
      ws.getCell(4, colIdx).alignment = { horizontal: 'center' };
      ws.getCell(4, colIdx).font = { bold: true, size: 9, color: { argb: hexToArgb(PAL.ink) } };
      ws.getCell(4, colIdx).border = allBorders(PAL.border);
      for (let k = 0; k < grp.spanCols; k++) {
        const c = ws.getCell(5, colIdx + k);
        const sub = layout.headerRow2[leafCol - 1 + k];
        c.value = sub?.label ?? '';
        c.fill = solid(PAL.bandPink);
        c.alignment = { horizontal: sub?.align ?? 'center' };
        c.font = { bold: true, size: 9, color: { argb: hexToArgb(PAL.ink) } };
        c.border = allBorders(PAL.border);
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
      // Always an explicit colour, not just on the negative branch — Excel's
      // own default text colour is black, which the dark theme's tinted
      // bands (e.g. `subtotalYellow` at '#2A2008') would swallow entirely.
      cell.font = {
        bold,
        size: 9,
        color: {
          argb: hexToArgb(
            c.signed && typeof display === 'string' && isParensNegative(display)
              ? PAL.negative
              : PAL.ink,
          ),
        },
      };
      cell.alignment = { horizontal: c.align ?? 'left' };
      cell.border = allBorders(PAL.border);
    }
    row += 1;
  }

  function writeBanner(label: string, fill: string) {
    ws.mergeCells(row, 1, row, totalCols);
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).fill = solid(fill);
    ws.getCell(row, 1).font = { bold: true, size: 9, color: { argb: hexToArgb(PAL.ink) } };
    ws.getCell(row, 1).alignment = { horizontal: 'left' };
    ws.getCell(row, 1).border = allBorders(PAL.border);
    row += 1;
  }

  for (const section of layout.sections) {
    if (section.banner) writeBanner(section.banner, PAL.groupBlue);
    for (const g of section.groups) {
      if (g.header) writeBanner(g.header, PAL.subPink);
      for (const r of g.rows) writeRow(r.cells, r.bg ?? PAL.white);
      if (g.subtotal) {
        writeRow(
          { [layout.columns[0]!.key]: g.subtotal.label, ...g.subtotal.values },
          PAL.subtotalYellow,
          true,
        );
      }
    }
  }

  if (layout.grandTotal) {
    writeRow(
      { [layout.columns[0]!.key]: layout.grandTotal.label, ...layout.grandTotal.values },
      PAL.grandGreen,
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

function allBorders(borderColor: string): ExcelJS.Borders {
  const style: ExcelJS.Border = { style: 'thin', color: { argb: hexToArgb(borderColor) } };
  return { top: style, left: style, right: style, bottom: style } as ExcelJS.Borders;
}
