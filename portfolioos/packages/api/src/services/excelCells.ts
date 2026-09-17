import type ExcelJS from 'exceljs';
import { Decimal } from '@everypaisa/shared';

/**
 * A worksheet name Excel accepts: none of * ? : \ / [ ], no leading or
 * trailing apostrophe, at most 31 characters, never empty. Report titles such
 * as "Trial Balance As On 17/09/2026" otherwise make the download fail.
 */
export function excelSheetName(title: string): string {
  const cleaned = title
    .replace(/[*?:\\/[\]]/g, '-')
    .replace(/^'+|'+$/g, '')
    .trim()
    .slice(0, 31)
    .trim();
  return cleaned || 'Report';
}

// A formatted amount or quantity: digits with grouping commas, optional
// decimals, negative as a leading minus or in parentheses.
const FORMATTED_NUMBER = /^\(?-?[\d,]+(\.\d+)?\)?$/;

/**
 * Write a formatted numeric cell as a real number with a matching number
 * format, so a spreadsheet can SUM and sort it; the stored value keeps the
 * full precision of `raw` while the format shows what the report shows.
 * Anything that isn't plainly a number (dates, labels, percentages) is left
 * as the formatted text.
 */
export function setExcelValue(cell: ExcelJS.Cell, raw: unknown, display: string): void {
  const text = display.trim();
  if (raw != null && raw !== '' && FORMATTED_NUMBER.test(text)) {
    let value: Decimal | null = null;
    try {
      value = new Decimal(String(raw));
    } catch {
      value = null; // not numeric after all: keep the text below
    }
    if (value && value.isFinite()) {
      const decimals = text.includes('.') ? text.split('.')[1]!.replace(/\D/g, '').length : 0;
      const body = decimals > 0 ? `#,##,##0.${'0'.repeat(decimals)}` : '#,##,##0';
      // Excel stores numbers as doubles; this is the spreadsheet boundary.
      cell.value = value.toNumber();
      cell.numFmt = `${body};(${body})`;
      return;
    }
  }
  cell.value = display;
}
