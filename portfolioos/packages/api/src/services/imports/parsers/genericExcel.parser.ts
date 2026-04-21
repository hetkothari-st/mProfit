import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import type { Parser, ParserResult } from './types.js';
import { genericCsvParser } from './genericCsv.parser.js';

export const genericExcelParser: Parser = {
  name: 'generic-excel',

  async canHandle(ctx) {
    const lower = ctx.fileName.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls');
  },

  async parse(ctx): Promise<ParserResult> {
    const buf = await readFile(ctx.filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return { transactions: [], warnings: ['No sheets found'] };
    const ws = wb.Sheets[firstSheet]!;
    const csv = XLSX.utils.sheet_to_csv(ws);

    // Write a temp CSV-like buffer and delegate to generic CSV parser
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tempPath = join(tmpdir(), `import-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
    try {
      await writeFile(tempPath, csv, 'utf8');
      const result = await genericCsvParser.parse({ ...ctx, filePath: tempPath, fileName: 'temp.csv' });
      return result;
    } finally {
      try {
        await unlink(tempPath);
      } catch {
        // ignore
      }
    }
  },
};
