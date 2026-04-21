import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';

import { genericCsvParser } from '../../src/services/imports/parsers/genericCsv.parser.js';
import { genericExcelParser } from '../../src/services/imports/parsers/genericExcel.parser.js';
import { parseZerodhaContractNoteText } from '../../src/services/imports/parsers/zerodhaContractNote.parser.js';
import { parseMfCasText } from '../../src/services/imports/parsers/mfCas.parser.js';
import { parseNsdlCdslText } from '../../src/services/imports/parsers/nsdlCdslCas.parser.js';

/**
 * Golden fixtures — §5.1 task 9.
 *
 * Each parser has ≥5 input fixtures checked into test/fixtures/. This suite
 * runs the parsers (pure-text entry points for PDF parsers; real file path
 * for CSV/Excel) and snapshots the normalized output. Any change to a
 * parser's behavior that's not reflected in the committed snapshot fails CI.
 *
 * If a parser change is intentional, re-run with `-u` to update snapshots.
 */

const FIX_ROOT = join(__dirname);

function listFixtures(dir: string, ext: RegExp): string[] {
  return readdirSync(dir)
    .filter((f) => ext.test(f))
    .sort();
}

function normaliseWarnings(ws: string[]): string[] {
  // Keep warnings order-stable and strip env-specific absolute paths or timestamps.
  return ws.map((w) =>
    w
      .replace(/\b\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+\b/g, '<timestamp>')
      .replace(/\b[A-Z]:\\[^ ]+/g, '<abs-path>'),
  );
}

describe('parser golden fixtures', () => {
  describe('generic CSV parser', () => {
    const csvDir = join(FIX_ROOT, 'csv');
    for (const file of listFixtures(csvDir, /\.csv$/i)) {
      it(`csv :: ${file}`, async () => {
        const full = join(csvDir, file);
        const result = await genericCsvParser.parse({
          filePath: full,
          fileName: file,
          portfolioId: null,
          userId: 'fixture-user',
        });
        expect({
          adapter: result.adapter,
          adapterVer: result.adapterVer,
          transactions: result.transactions,
          warnings: normaliseWarnings(result.warnings),
        }).toMatchSnapshot();
      });
    }
  });

  describe('generic Excel parser', () => {
    // XLSX fixtures are generated from the CSV fixtures at test time so we
    // don't have to commit binary files. The Excel path delegates to the CSV
    // parser, so this primarily verifies the XLSX→CSV bridge preserves rows.
    const csvDir = join(FIX_ROOT, 'csv');
    const csvFixtures = listFixtures(csvDir, /\.csv$/i);

    for (const file of csvFixtures) {
      it(`xlsx :: ${file.replace(/\.csv$/, '.xlsx')}`, async () => {
        const csvText = readFileSync(join(csvDir, file), 'utf8');
        // Parse CSV -> AOA -> workbook so the XLSX cells preserve string shape
        // (Zerodha-style "24,750.00" quoted cells stay as text, not numbers).
        const rows = parseCsv(csvText, {
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        }) as string[][];
        const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: false });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

        const tmp = mkdtempSync(join(tmpdir(), 'gxl-'));
        const xlsxPath = join(tmp, file.replace(/\.csv$/, '.xlsx'));
        XLSX.writeFile(wb, xlsxPath);

        try {
          const result = await genericExcelParser.parse({
            filePath: xlsxPath,
            fileName: file.replace(/\.csv$/, '.xlsx'),
            portfolioId: null,
            userId: 'fixture-user',
          });
          expect({
            adapter: result.adapter,
            adapterVer: result.adapterVer,
            transactions: result.transactions,
            warnings: normaliseWarnings(result.warnings),
          }).toMatchSnapshot();
        } finally {
          rmSync(tmp, { recursive: true, force: true });
        }
      });
    }
  });

  describe('Zerodha contract note (PDF text)', () => {
    const dir = join(FIX_ROOT, 'contract_note', 'zerodha');
    for (const file of listFixtures(dir, /\.txt$/i)) {
      it(`zerodha-pdf :: ${file}`, () => {
        const text = readFileSync(join(dir, file), 'utf8');
        const { transactions, warnings } = parseZerodhaContractNoteText(text);
        expect({
          transactions,
          warnings: normaliseWarnings(warnings),
        }).toMatchSnapshot();
      });
    }
  });

  describe('MF CAS (CAMS/KFintech, PDF text)', () => {
    const dir = join(FIX_ROOT, 'cas', 'cams_kfintech');
    for (const file of listFixtures(dir, /\.txt$/i)) {
      it(`mf-cas :: ${file}`, () => {
        const text = readFileSync(join(dir, file), 'utf8');
        const { transactions, warnings } = parseMfCasText(text);
        expect({
          transactions,
          warnings: normaliseWarnings(warnings),
        }).toMatchSnapshot();
      });
    }
  });

  describe('Depository CAS (NSDL/CDSL, PDF text)', () => {
    const dir = join(FIX_ROOT, 'cas', 'nsdl_cdsl');
    for (const file of listFixtures(dir, /\.txt$/i)) {
      it(`nsdl-cdsl :: ${file}`, () => {
        const text = readFileSync(join(dir, file), 'utf8');
        const { transactions, warnings, depository, isTxnOnly } =
          parseNsdlCdslText(text);
        expect({
          depository,
          isTxnOnly,
          transactions,
          warnings: normaliseWarnings(warnings),
        }).toMatchSnapshot();
      });
    }
  });
});
