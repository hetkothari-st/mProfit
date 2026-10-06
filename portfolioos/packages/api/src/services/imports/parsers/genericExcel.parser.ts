import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { Parser, ParserResult } from './types.js';
import { genericCsvParser } from './genericCsv.parser.js';

/**
 * Serialise one worksheet to CSV text.
 *
 * Replaces SheetJS (`xlsx`) here. The npm-published `xlsx` build carries a
 * known prototype-pollution / ReDoS advisory that is not fixed on npm —
 * SheetJS moved patched releases to their own CDN — and this parser sits
 * directly on the untrusted-upload path, reading spreadsheets a user (or a
 * sender whose attachment we ingested) supplied. exceljs was already a
 * dependency of this package, used by the report writers.
 */
function sheetToCsv(sheet: ExcelJS.Worksheet): string {
  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    // `row.cellCount` covers the populated width; iterate by index so empty
    // cells become empty fields rather than being skipped, which would shift
    // every later column left and silently misalign the CSV.
    for (let col = 1; col <= sheet.columnCount; col++) {
      const value = row.getCell(col).value;
      cells.push(csvEscape(stringifyCell(value)));
    }
    lines.push(cells.join(','));
  });
  return lines.join('\n');
}

function stringifyCell(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // Formula cells carry { formula, result }; rich text carries { richText }.
    // Take the computed result / flattened text — never the formula source,
    // which is neither data nor safe to forward.
    if ('result' in value && value.result !== undefined) {
      return stringifyCell(value.result as ExcelJS.CellValue);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join('');
    }
    if ('text' in value && typeof value.text === 'string') return value.text;
    return '';
  }
  return String(value);
}

function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const genericExcelParser: Parser = {
  name: 'generic-excel',

  async canHandle(ctx) {
    const lower = ctx.fileName.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls');
  },

  async parse(ctx): Promise<ParserResult> {
    const buf = await readFile(ctx.filePath);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return { transactions: [], warnings: ['No sheets found'] };
    const csv = sheetToCsv(ws);

    // Write a temp CSV-like buffer and delegate to generic CSV parser
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tempPath = join(tmpdir(), `import-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
    try {
      await writeFile(tempPath, csv, 'utf8');
      const result = await genericCsvParser.parse({ ...ctx, filePath: tempPath, fileName: 'temp.csv' });
      // Stamp as the Excel adapter so the lineage on Transaction rows points
      // back to the file the user actually uploaded (not our temp CSV).
      return { ...result, adapter: 'generic.excel', adapterVer: '1' };
    } finally {
      // Best-effort temp-file cleanup; a failure here never changes the
      // parse result, so we swallow the error rather than masking the
      // primary outcome. `tmpdir()` gets GC'd by the OS regardless.
      // eslint-disable-next-line everypaisa/no-silent-catch -- best-effort cleanup
      try { await unlink(tempPath); } catch { /* ignore */ }
    }
  },
};
